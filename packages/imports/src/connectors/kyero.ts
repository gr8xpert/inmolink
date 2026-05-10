/**
 * Kyero connector (PLAN §11.5; samples/feeds/README.md).
 *
 * Streaming SAX parser — Kyero feeds reach 100+ MB in production. We never
 * buffer the whole document. The parser walks `<root>/<property>` children,
 * accumulates per-listing state in a small object, and emits one
 * `NormalizedListing` per `</property>` close. Consumer pulls listings via
 * AsyncIterable; parser pauses when the queue is full and resumes on pull.
 *
 * Quirks the parser handles (see samples/feeds/README.md):
 * - locale-keyed `<title>`, `<desc>`, and per-feature names (`<en>` etc.)
 * - `<province>` may carry "(Province)" suffix (we strip it)
 * - `<images>/<image>/<url>` URLs include `?v=…` cache busters — kept as-is
 *   (the worker hashes the bytes after download, not the URL)
 * - optional `<location latitude="…" longitude="…"/>` (not in the bundled
 *   sample but in the v3 spec; handled when present)
 * - empty `<distances/>` self-closed — safely ignored
 */

import { LOCALES, type Locale } from "@inmolink/shared";
import sax from "sax";
import type { FeatureName, FeedConnector, FeedFetchInput, NormalizedListing } from "../connector";
import { AsyncQueue } from "../stream-queue";

type DraftProperty = {
  externalRef?: string;
  internalId?: string;
  sourceUpdatedAt?: Date;
  priceCents?: bigint;
  currency?: string;
  transactionType?: NormalizedListing["transactionType"];
  typeName?: string;
  townName?: string;
  provinceName?: string;
  videoUrl?: string;
  bedrooms?: number;
  bathrooms?: number;
  areaM2?: number;
  plotM2?: number;
  latitude?: number;
  longitude?: number;
  features: FeatureName[];
  imageUrls: string[];
  translations: Partial<Record<Locale, { title?: string; description?: string }>>;
};

const KYERO_FREQ_TO_TX: Record<string, NormalizedListing["transactionType"]> = {
  sale: "SALE",
  rent: "RENT",
  rentlong: "RENT",
  rentshort: "SHORT_TERM",
};

export class KyeroConnector implements FeedConnector {
  readonly kind = "KYERO" as const;

  fetch(input: FeedFetchInput): AsyncIterable<NormalizedListing> {
    return parseKyeroFromUrl(input);
  }
}

async function* parseKyeroFromUrl(input: FeedFetchInput): AsyncIterable<NormalizedListing> {
  const res = await fetch(input.feedUrl, { signal: input.signal });
  if (!res.ok || !res.body) {
    throw new Error(`Kyero fetch failed: ${res.status} ${res.statusText}`);
  }
  // Web ReadableStream → Node-style stream of bytes via `for await`.
  yield* parseKyeroStream(webStreamToNode(res.body), input.signal);
}

// Convert a fetch Response.body (web ReadableStream) into a Node Readable.
// Using Node 18+'s built-in Readable.fromWeb avoids extra deps.
function webStreamToNode(stream: ReadableStream<Uint8Array>): NodeJS.ReadableStream {
  // biome-ignore lint/suspicious/noExplicitAny: Readable.fromWeb is typed loosely across Node versions
  const { Readable } = require("node:stream") as any;
  return Readable.fromWeb(stream);
}

/**
 * Public entry point used by tests — accepts any Node ReadableStream so the
 * vitest fixture can pipe a file directly. The HTTP path uses the same
 * function under the hood.
 */
export async function* parseKyeroStream(
  stream: NodeJS.ReadableStream,
  signal?: AbortSignal,
): AsyncIterable<NormalizedListing> {
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
  const path: string[] = [];
  let textBuf = "";
  let curr: DraftProperty | null = null;
  let currentFeature: { perLocale: Partial<Record<Locale, string>> } | null = null;

  const handleClose = (name: string) => {
    if (!curr) return;
    const text = textBuf.trim();
    const parent = path[path.length - 2] ?? "";
    const grand = path[path.length - 3] ?? "";

    // Top-level property fields (parent === "property")
    if (parent === "property") {
      switch (name) {
        case "id":
          curr.internalId = text;
          break;
        case "ref":
          curr.externalRef = text;
          break;
        case "date": {
          const d = parseKyeroDate(text);
          if (d) curr.sourceUpdatedAt = d;
          break;
        }
        case "price": {
          const cents = priceToCents(text);
          if (cents !== null) curr.priceCents = cents;
          break;
        }
        case "currency":
          if (text) curr.currency = text.toUpperCase();
          break;
        case "price_freq":
          curr.transactionType = KYERO_FREQ_TO_TX[text.toLowerCase()] ?? "SALE";
          break;
        case "type":
          if (text) curr.typeName = text;
          break;
        case "town":
          if (text) curr.townName = text;
          break;
        case "province":
          if (text) curr.provinceName = stripProvinceSuffix(text);
          break;
        case "video_url":
          if (text) curr.videoUrl = text;
          break;
        case "beds":
          curr.bedrooms = toInt(text);
          break;
        case "baths":
          curr.bathrooms = toInt(text);
          break;
      }
    }

    // surface_area/built|plot
    if (parent === "surface_area") {
      if (name === "built") curr.areaM2 = toInt(text);
      else if (name === "plot") curr.plotM2 = toInt(text);
    }

    // title/<locale>, desc/<locale>
    if (parent === "title" && (LOCALES as readonly string[]).includes(name)) {
      const locale = name as Locale;
      const slot = curr.translations[locale] ?? {};
      slot.title = text;
      curr.translations[locale] = slot;
    }
    if (parent === "desc" && (LOCALES as readonly string[]).includes(name)) {
      const locale = name as Locale;
      const slot = curr.translations[locale] ?? {};
      slot.description = text;
      curr.translations[locale] = slot;
    }

    // features/feature/<locale>
    if (
      parent === "feature" &&
      grand === "features" &&
      currentFeature &&
      (LOCALES as readonly string[]).includes(name)
    ) {
      currentFeature.perLocale[name as Locale] = text;
    }

    // image url
    if (parent === "image" && name === "url" && text) {
      curr.imageUrls.push(text);
    }

    // close feature → push onto property
    if (name === "feature" && curr) {
      if (currentFeature && Object.keys(currentFeature.perLocale).length > 0) {
        const canonical =
          currentFeature.perLocale.en ??
          currentFeature.perLocale.es ??
          currentFeature.perLocale.de ??
          currentFeature.perLocale.fr ??
          "";
        if (canonical) {
          curr.features.push({ canonical, perLocale: currentFeature.perLocale });
        }
      }
      currentFeature = null;
    }
  };

  parser.on("opentag", (tag) => {
    const name = String(tag.name).toLowerCase();
    path.push(name);
    textBuf = "";

    if (name === "property") {
      curr = { features: [], imageUrls: [], translations: {} };
      return;
    }
    if (!curr) return;

    if (name === "feature" && path[path.length - 2] === "features") {
      currentFeature = { perLocale: {} };
    }

    // Optional <location latitude="…" longitude="…"/> — Kyero v3.
    if (name === "location") {
      const attrs = tag.attributes as Record<string, string | undefined>;
      const lat = attrs.latitude;
      const lng = attrs.longitude;
      if (lat) curr.latitude = Number.parseFloat(lat);
      if (lng) curr.longitude = Number.parseFloat(lng);
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
    handleClose(name);

    if (name === "property" && curr) {
      const listing = finalize(curr);
      if (listing) queue.push(listing);
      curr = null;
      currentFeature = null;
      // Backpressure — pause the upstream when the consumer falls behind.
      if (queue.highWater() && !paused) {
        paused = true;
        stream.pause();
      }
    }

    path.pop();
    textBuf = "";
  });

  parser.on("error", (err) => {
    queue.end(err);
  });
  parser.on("end", () => {
    queue.end();
  });

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

function finalize(d: DraftProperty): NormalizedListing | null {
  // `<ref>` is the agency's own reference — preferred. If the feed publishes
  // it empty (real production feeds occasionally do), fall back to Kyero's
  // internal `<id>` prefixed to avoid collision with agency-assigned refs.
  const externalRef = d.externalRef || (d.internalId ? `kyero:${d.internalId}` : "");
  // Truly mandatory: a stable external reference + classification we can map.
  // Price/currency/transaction can be defaulted (POA listings, missing tags).
  if (!externalRef || !d.typeName || !d.townName) return null;
  return {
    externalRef,
    source: "KYERO",
    transactionType: d.transactionType ?? "SALE",
    priceCents: d.priceCents ?? 0n,
    currency: d.currency ?? "EUR",
    typeName: d.typeName,
    townName: d.townName,
    provinceName: d.provinceName,
    countryCode: "ES", // Kyero feeds are Spain-centric in practice; override later via defaults if needed.
    latitude: d.latitude,
    longitude: d.longitude,
    bedrooms: d.bedrooms,
    bathrooms: d.bathrooms,
    areaM2: d.areaM2,
    plotM2: d.plotM2,
    features: d.features,
    translations: d.translations,
    imageUrls: d.imageUrls,
    videoUrl: d.videoUrl,
    sourceUpdatedAt: d.sourceUpdatedAt,
  };
}

// "550000" → 55000000n (cents). Returns null on garbage/empty.
function priceToCents(text: string): bigint | null {
  if (!text) return null;
  const cleaned = text.replace(/[\s,]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(cleaned)) return null;
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

function toInt(text: string): number | undefined {
  if (!text) return undefined;
  const n = Number.parseInt(text, 10);
  return Number.isFinite(n) ? n : undefined;
}

function stripProvinceSuffix(text: string): string {
  return text.replace(/\s*\(\s*Province\s*\)\s*$/i, "").trim();
}

// Kyero `<date>` is `YYYY-MM-DD HH:MM:SS` (UTC by convention).
function parseKyeroDate(text: string): Date | undefined {
  if (!text) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(text);
  if (!m) return undefined;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(
    Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)),
  );
  return Number.isNaN(date.getTime()) ? undefined : date;
}
