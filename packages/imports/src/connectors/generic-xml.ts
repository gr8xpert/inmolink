/**
 * Generic XML connector (PLAN §10 / §11.5).
 *
 * Same streaming SAX discipline as the Kyero connector, but the path → field
 * mapping is supplied by the caller. Sprint 5 ships two consumers:
 *
 * - GenericXmlConnector (this file) — agency provides a custom mapping
 *   stored on FeedConnection.fieldMappings (Json). Useful for proprietary
 *   feeds that don't match a built-in connector.
 *
 * - ResaleOnlineConnector (./resale-online.ts) — preset mapping for the
 *   Resale Online XML format (Spain MLS — common in the same agencies that
 *   serve Kyero feeds; their CDN is `cdn.resales-online.com`).
 *
 * Path syntax: '/'-joined lowercase tag names, relative to the per-property
 * wrapper element. e.g. for a feed shaped like:
 *
 *   <listing>
 *     <ref>X1</ref>
 *     <pricing><total>250000</total></pricing>
 *     <translations>
 *       <text lang="en">For sale</text>
 *     </translations>
 *   </listing>
 *
 * a mapping might be:
 *
 *   { path: "ref",                target: "externalRef" }
 *   { path: "pricing/total",      target: "priceCents", transform: "money" }
 *
 * For locale-keyed text the parser captures the matching attribute when
 * `localeFromAttr` is set on the mapping (e.g. `<text lang="en">…`).
 */

import { Readable } from "node:stream";
import { LOCALES, type Locale } from "@inmolink/shared";
import sax from "sax";
import type {
  FeatureName,
  FeedConnector,
  FeedConnectorKind,
  FeedFetchInput,
  NormalizedListing,
} from "../connector";
import { AsyncQueue } from "../stream-queue";

export type GenericFieldTarget =
  | "externalRef"
  | "priceCents"
  | "currency"
  | "transactionType"
  | "typeName"
  | "townName"
  | "provinceName"
  | "countryCode"
  | "latitude"
  | "longitude"
  | "addressLine"
  | "postcode"
  | "bedrooms"
  | "bathrooms"
  | "areaM2"
  | "plotM2"
  | "yearBuilt"
  | "videoUrl"
  | "virtualTourUrl"
  | "sourceUpdatedAt"
  | "title"
  | "description"
  | "feature"
  | "imageUrl"
  | "floorPlanUrl";

export type GenericFieldTransform =
  | "trim"
  | "lower"
  | "upper"
  | "money" // "550000" / "550,000" / "550000.50" → bigint cents
  | "isoDate" // ISO-8601 → Date
  | "stripParenSuffix" // strip "(Province)" or "(City)" tail
  | "freqToTx" // sale/rent/rentlong/rentshort → SALE/RENT/SHORT_TERM
  | "intRound";

export type GenericMapping = {
  path: string;
  target: GenericFieldTarget;
  /** Static locale if known (e.g. for fixed nested-tag locale like Kyero <en>). */
  locale?: Locale;
  /** Read locale from this XML attribute on the matched element (e.g. `lang`). */
  localeFromAttr?: string;
  transform?: GenericFieldTransform;
  /** Default if the path is empty/missing. */
  default?: string;
};

export type GenericXmlConfig = {
  /** Tag whose children mark per-listing boundaries (e.g. `property`, `listing`). */
  itemTag: string;
  /** ISO 3166-1 alpha-2; defaults to "ES". */
  countryCode?: string;
  /** Identifier used as `source` on emitted listings. Generic feeds expose
   *  this so the worker can persist a stable provenance per agency. */
  source: FeedConnectorKind;
  mappings: GenericMapping[];
};

type Draft = {
  externalRef?: string;
  priceCents?: bigint;
  currency?: string;
  transactionType?: NormalizedListing["transactionType"];
  typeName?: string;
  townName?: string;
  provinceName?: string;
  countryCode?: string;
  latitude?: number;
  longitude?: number;
  addressLine?: string;
  postcode?: string;
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  plotM2?: number;
  yearBuilt?: number;
  videoUrl?: string;
  virtualTourUrl?: string;
  sourceUpdatedAt?: Date;
  translations: Partial<Record<Locale, { title?: string; description?: string }>>;
  features: FeatureName[];
  imageUrls: string[];
  floorPlanUrls: string[];
  /** Per-feature accumulator: when the feature element closes we push it. */
  pendingFeature?: FeatureName | null;
};

export class GenericXmlConnector implements FeedConnector {
  readonly kind: FeedConnectorKind = "GENERIC_XML";

  constructor(private readonly config: GenericXmlConfig) {}

  fetch(input: FeedFetchInput): AsyncIterable<NormalizedListing> {
    return parseGenericFromUrl(input, this.config);
  }
}

async function* parseGenericFromUrl(
  input: FeedFetchInput,
  config: GenericXmlConfig,
): AsyncIterable<NormalizedListing> {
  const res = await fetch(input.feedUrl, { signal: input.signal });
  if (!res.ok || !res.body) {
    throw new Error(`Generic XML fetch failed: ${res.status} ${res.statusText}`);
  }
  const node = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
  yield* parseGenericXmlStream(node, config, input.signal);
}

/**
 * Test-friendly entry: pipe any Node Readable. Same engine the URL fetch uses.
 */
export async function* parseGenericXmlStream(
  stream: NodeJS.ReadableStream,
  config: GenericXmlConfig,
  signal?: AbortSignal,
): AsyncIterable<NormalizedListing> {
  const itemTag = config.itemTag.toLowerCase();
  // Index mappings by their path's last segment for fast dispatch.
  const byClosingTag = new Map<string, GenericMapping[]>();
  for (const m of config.mappings) {
    const parts = m.path.toLowerCase().split("/");
    const last = parts[parts.length - 1] ?? "";
    if (!last) continue;
    const list = byClosingTag.get(last);
    if (list) list.push(m);
    else byClosingTag.set(last, [m]);
  }

  const parser = sax.createStream(false, {
    trim: true,
    normalize: false,
    lowercase: true,
  });

  const queue = new AsyncQueue<NormalizedListing>(50);
  queue.onPull(() => {
    if (paused) {
      paused = false;
      stream.resume();
    }
  });
  let paused = false;

  // SAX state
  const path: string[] = [];
  // Per-element attributes captured at `opentag` so closetag can read them.
  const attrStack: Array<Record<string, string>> = [];
  let textBuf = "";
  let curr: Draft | null = null;
  // For features: when we open the feature wrapper element we set this so
  // nested `feature` mappings know to push at close.
  let featureWrapperOpen: {
    startDepth: number;
    perLocale: Partial<Record<Locale, string>>;
  } | null = null;

  parser.on("opentag", (tag) => {
    const name = String(tag.name).toLowerCase();
    path.push(name);
    attrStack.push((tag.attributes as Record<string, string>) ?? {});
    textBuf = "";

    if (name === itemTag && path.length >= 1) {
      curr = {
        translations: {},
        features: [],
        imageUrls: [],
        floorPlanUrls: [],
      };
      return;
    }

    if (!curr) return;

    // Feature wrapper detection: if any mapping targets `feature`, the path
    // immediately above the locale-bearing tag opens a new feature.
    for (const m of config.mappings) {
      if (m.target !== "feature") continue;
      const last = m.path.toLowerCase().split("/").pop() ?? "";
      const parent = m.path.toLowerCase().split("/").slice(0, -1).pop() ?? "";
      if (parent && name === parent) {
        featureWrapperOpen = { startDepth: path.length, perLocale: {} };
      }
      // suppress unused-var lint
      void last;
    }
  });

  parser.on("text", (txt: string) => {
    textBuf += txt;
  });
  parser.on("cdata", (txt: string) => {
    textBuf += txt;
  });

  parser.on("closetag", (rawName: string) => {
    const name = String(rawName).toLowerCase();
    const text = textBuf.trim();
    const attrs = attrStack[attrStack.length - 1] ?? {};

    if (curr) {
      const candidates = byClosingTag.get(name);
      if (candidates) {
        // Build the path-relative-to-item once for matching.
        const itemDepth = path.lastIndexOf(itemTag);
        const relative = itemDepth === -1 ? path.join("/") : path.slice(itemDepth + 1).join("/");
        for (const m of candidates) {
          if (m.path.toLowerCase() !== relative) continue;
          applyMapping(curr, m, text, attrs, featureWrapperOpen);
        }
      }

      // Close feature wrapper → flush.
      if (featureWrapperOpen && path.length === featureWrapperOpen.startDepth) {
        const perLocale = featureWrapperOpen.perLocale;
        if (Object.keys(perLocale).length > 0) {
          const canonical = perLocale.en ?? perLocale.es ?? perLocale.de ?? perLocale.fr ?? "";
          if (canonical) curr.features.push({ canonical, perLocale });
        }
        featureWrapperOpen = null;
      }
    }

    if (name === itemTag && curr) {
      const listing = finalize(curr, config);
      if (listing) queue.push(listing);
      curr = null;
      featureWrapperOpen = null;
      if (queue.highWater() && !paused) {
        paused = true;
        stream.pause();
      }
    }

    path.pop();
    attrStack.pop();
    textBuf = "";
  });

  parser.on("error", (err) => queue.end(err));
  parser.on("end", () => queue.end());

  if (signal) {
    const onAbort = () => queue.end(new Error("Feed parse aborted"));
    if (signal.aborted) onAbort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  stream.pipe(parser as unknown as NodeJS.WritableStream);

  while (true) {
    const { value, done } = await queue.next();
    if (done) return;
    yield value;
  }
}

function applyMapping(
  curr: Draft,
  m: GenericMapping,
  rawText: string,
  attrs: Record<string, string>,
  featureWrapper: { perLocale: Partial<Record<Locale, string>> } | null,
): void {
  const text = applyTransform(rawText || m.default || "", m.transform);
  if (text === "" && m.target !== "feature") return;

  const locale = m.locale ?? readLocaleFromAttr(attrs, m.localeFromAttr);

  switch (m.target) {
    case "externalRef":
      curr.externalRef = text;
      break;
    case "priceCents":
      if (typeof text === "string") {
        const n = parseMoneyToCents(text);
        if (n !== null) curr.priceCents = n;
      }
      break;
    case "currency":
      if (typeof text === "string") curr.currency = text.toUpperCase();
      break;
    case "transactionType":
      curr.transactionType = freqToTx(typeof text === "string" ? text : "");
      break;
    case "typeName":
      if (typeof text === "string") curr.typeName = text;
      break;
    case "townName":
      if (typeof text === "string") curr.townName = text;
      break;
    case "provinceName":
      if (typeof text === "string") curr.provinceName = text;
      break;
    case "countryCode":
      if (typeof text === "string") curr.countryCode = text.toUpperCase();
      break;
    case "latitude":
      curr.latitude = toFloat(typeof text === "string" ? text : "");
      break;
    case "longitude":
      curr.longitude = toFloat(typeof text === "string" ? text : "");
      break;
    case "addressLine":
      if (typeof text === "string") curr.addressLine = text;
      break;
    case "postcode":
      if (typeof text === "string") curr.postcode = text;
      break;
    case "bedrooms":
      curr.bedrooms = toInt(typeof text === "string" ? text : "");
      break;
    case "bathrooms":
      curr.bathrooms = toInt(typeof text === "string" ? text : "");
      break;
    case "areaM2":
      curr.areaM2 = toInt(typeof text === "string" ? text : "");
      break;
    case "plotM2":
      curr.plotM2 = toInt(typeof text === "string" ? text : "");
      break;
    case "yearBuilt":
      curr.yearBuilt = toInt(typeof text === "string" ? text : "");
      break;
    case "videoUrl":
      if (typeof text === "string") curr.videoUrl = text;
      break;
    case "virtualTourUrl":
      if (typeof text === "string") curr.virtualTourUrl = text;
      break;
    case "sourceUpdatedAt": {
      const d = tryParseDate(text);
      if (d) curr.sourceUpdatedAt = d;
      break;
    }
    case "title": {
      if (!locale || typeof text !== "string") break;
      const slot = curr.translations[locale] ?? {};
      slot.title = text;
      curr.translations[locale] = slot;
      break;
    }
    case "description": {
      if (!locale || typeof text !== "string") break;
      const slot = curr.translations[locale] ?? {};
      slot.description = text;
      curr.translations[locale] = slot;
      break;
    }
    case "feature": {
      if (!featureWrapper) break;
      const usedLocale = locale ?? "en";
      if (typeof text === "string" && text) {
        featureWrapper.perLocale[usedLocale as Locale] = text;
      }
      break;
    }
    case "imageUrl":
      if (typeof text === "string" && text) curr.imageUrls.push(text);
      break;
    case "floorPlanUrl":
      if (typeof text === "string" && text) curr.floorPlanUrls.push(text);
      break;
  }
}

function readLocaleFromAttr(attrs: Record<string, string>, attrName?: string): Locale | undefined {
  if (!attrName) return undefined;
  const value = attrs[attrName.toLowerCase()];
  if (!value) return undefined;
  const v = value.toLowerCase();
  return (LOCALES as readonly string[]).includes(v) ? (v as Locale) : undefined;
}

function applyTransform(text: string, t: GenericFieldTransform | undefined): string {
  if (!t) return text;
  switch (t) {
    case "trim":
      return text.trim();
    case "lower":
      return text.toLowerCase();
    case "upper":
      return text.toUpperCase();
    case "money":
      return text; // applied at applyMapping via parseMoneyToCents
    case "intRound":
      return text;
    case "isoDate":
      return text;
    case "stripParenSuffix":
      return text.replace(/\s*\([^)]*\)\s*$/, "").trim();
    case "freqToTx":
      return text.toLowerCase();
  }
}

function parseMoneyToCents(text: string): bigint | null {
  if (!text) return null;
  const cleaned = text.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  if (!/^-?\d+(?:\.\d+)?$/.test(cleaned)) return null;
  const parts = cleaned.split(".");
  const whole = parts[0] ?? "0";
  const frac = parts[1] ?? "";
  const padded = `${frac}00`.slice(0, 2);
  try {
    return BigInt(whole) * 100n + BigInt(padded);
  } catch {
    return null;
  }
}

function freqToTx(text: string): NormalizedListing["transactionType"] {
  const v = text.toLowerCase();
  if (v.includes("rentshort") || v.includes("short")) return "SHORT_TERM";
  if (v.includes("rent")) return "RENT";
  return "SALE";
}

function toInt(text: string): number | undefined {
  if (!text) return undefined;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : undefined;
}

function toFloat(text: string): number | undefined {
  if (!text) return undefined;
  const n = Number.parseFloat(text);
  return Number.isFinite(n) ? n : undefined;
}

function tryParseDate(text: string): Date | undefined {
  if (!text) return undefined;
  const d = new Date(text);
  if (!Number.isNaN(d.getTime())) return d;
  // Fallback: Kyero-style "YYYY-MM-DD HH:MM:SS"
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return undefined;
  const [, y, mo, da, h, mi, s] = m;
  const dt = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(da), Number(h), Number(mi), Number(s)),
  );
  return Number.isNaN(dt.getTime()) ? undefined : dt;
}

function finalize(d: Draft, config: GenericXmlConfig): NormalizedListing | null {
  if (!d.externalRef || !d.typeName || !d.townName) return null;
  return {
    externalRef: d.externalRef,
    source: config.source,
    transactionType: d.transactionType ?? "SALE",
    priceCents: d.priceCents ?? 0n,
    currency: d.currency ?? "EUR",
    typeName: d.typeName,
    townName: d.townName,
    provinceName: d.provinceName,
    countryCode: d.countryCode ?? config.countryCode ?? "ES",
    latitude: d.latitude,
    longitude: d.longitude,
    addressLine: d.addressLine,
    postcode: d.postcode,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    areaM2: d.areaM2,
    plotM2: d.plotM2,
    yearBuilt: d.yearBuilt,
    features: d.features,
    translations: d.translations,
    imageUrls: d.imageUrls,
    floorPlanUrls: d.floorPlanUrls.length > 0 ? d.floorPlanUrls : undefined,
    videoUrl: d.videoUrl,
    virtualTourUrl: d.virtualTourUrl,
    sourceUpdatedAt: d.sourceUpdatedAt,
  };
}
