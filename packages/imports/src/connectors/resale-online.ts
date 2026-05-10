/**
 * Resale Online connector (PLAN §11.5).
 *
 * Spain MLS — many of the same agencies that publish Kyero feeds back-end
 * onto Resale Online (the Kyero sample's image CDN is `cdn.resales-online.com`).
 *
 * The Resale Online XML schema differs from Kyero in tag names but follows
 * the same "one wrapper element per listing, locale-keyed text via
 * `<text language="en">…</text>`" shape. We express it as a preset config
 * over the GenericXmlConnector engine so all three connectors share the
 * same SAX/queue plumbing.
 *
 * Field map below is based on the public Resale Online v3 export schema as
 * documented at `https://www.resales-online.com/api/feed-export.htm`. Real
 * sample feeds vary by agency; mapping covers the common subset and degrades
 * gracefully when fields are absent (finalize() requires only externalRef +
 * typeName + townName).
 */

import type { FeedConnector, FeedFetchInput, NormalizedListing } from "../connector";
import { type GenericXmlConfig, GenericXmlConnector, parseGenericXmlStream } from "./generic-xml";

export const RESALE_ONLINE_CONFIG: GenericXmlConfig = {
  itemTag: "property",
  source: "RESALE_ONLINE",
  countryCode: "ES",
  mappings: [
    { path: "reference", target: "externalRef" },
    { path: "agency_ref", target: "externalRef" },
    { path: "ref", target: "externalRef" },
    { path: "price", target: "priceCents", transform: "money" },
    { path: "currency", target: "currency", transform: "upper" },
    { path: "type", target: "typeName" },
    { path: "subtype", target: "typeName" }, // override `type` if present
    { path: "town", target: "townName" },
    { path: "city", target: "townName" },
    { path: "province", target: "provinceName", transform: "stripParenSuffix" },
    { path: "country", target: "countryCode", transform: "upper" },
    { path: "location/latitude", target: "latitude" },
    { path: "location/longitude", target: "longitude" },
    { path: "latitude", target: "latitude" },
    { path: "longitude", target: "longitude" },
    { path: "address", target: "addressLine" },
    { path: "postcode", target: "postcode" },
    { path: "bedrooms", target: "bedrooms" },
    { path: "bathrooms", target: "bathrooms" },
    { path: "built", target: "areaM2" },
    { path: "surface_area/built", target: "areaM2" },
    { path: "plot", target: "plotM2" },
    { path: "surface_area/plot", target: "plotM2" },
    { path: "year_built", target: "yearBuilt" },
    { path: "video_url", target: "videoUrl" },
    { path: "tour_url", target: "virtualTourUrl" },
    { path: "last_updated", target: "sourceUpdatedAt", transform: "isoDate" },
    { path: "date", target: "sourceUpdatedAt" },
    { path: "transaction", target: "transactionType", transform: "freqToTx" },
    { path: "price_freq", target: "transactionType", transform: "freqToTx" },
    // Locale-keyed title + description: <title language="en">…</title>
    { path: "title", target: "title", localeFromAttr: "language" },
    { path: "description", target: "description", localeFromAttr: "language" },
    // Locale-keyed features: <features><feature><text language="en">…</text></feature></features>
    { path: "features/feature/text", target: "feature", localeFromAttr: "language" },
    // Image URLs
    { path: "images/image/url", target: "imageUrl" },
    { path: "images/image", target: "imageUrl" }, // some feeds put the URL directly in <image>
    { path: "floorplans/floorplan/url", target: "floorPlanUrl" },
  ],
};

export class ResaleOnlineConnector implements FeedConnector {
  readonly kind = "RESALE_ONLINE" as const;

  private readonly inner = new GenericXmlConnector(RESALE_ONLINE_CONFIG);

  fetch(input: FeedFetchInput): AsyncIterable<NormalizedListing> {
    return this.inner.fetch(input);
  }
}

/**
 * Test entry: pipe a Node Readable directly through the Resale preset.
 */
export function parseResaleOnlineStream(
  stream: NodeJS.ReadableStream,
  signal?: AbortSignal,
): AsyncIterable<NormalizedListing> {
  return parseGenericXmlStream(stream, RESALE_ONLINE_CONFIG, signal);
}
