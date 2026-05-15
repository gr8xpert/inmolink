/**
 * Server-side MIME sniffer for uploaded media.
 *
 * Trusts actual bytes — never the client's claimed `mimeType`. Returns the
 * sniffed type so the caller can compare against the claim and reject
 * mismatches before creating a MediaObject row.
 *
 * Sniff strategy:
 *   - Images: magic-byte match (JPEG / PNG / WebP / AVIF / HEIC / HEIF / GIF).
 *   - PDF:    `%PDF-` literal at offset 0.
 *   - Video:  ISO BMFF `ftyp` box for MP4/MOV variants; EBML header for WebM.
 *
 * SVG is intentionally not in the allow-list — the upload schema rejects it
 * before we ever reach here.
 */

export type SniffResult = {
  mimeType: string | null;
  /** True if bytes are consistent with the claimed type. */
  matches: boolean;
};

const isoBmffBrands: Record<string, string> = {
  isom: "video/mp4",
  iso2: "video/mp4",
  mp41: "video/mp4",
  mp42: "video/mp4",
  avc1: "video/mp4",
  qt: "video/quicktime",
  "qt  ": "video/quicktime",
  heic: "image/heic",
  heix: "image/heic",
  mif1: "image/heif",
  msf1: "image/heif",
  avif: "image/avif",
  avis: "image/avif",
};

function sniffBytes(buf: Buffer): string | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return "image/png";
  }
  if (buf.length >= 6 && buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38) {
    return "image/gif";
  }
  if (
    buf.length >= 12 &&
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return "image/webp";
  }
  if (buf.length >= 5 && buf.subarray(0, 5).toString("latin1") === "%PDF-") {
    return "application/pdf";
  }
  // ISO BMFF (MP4/MOV/HEIC/HEIF/AVIF): `<size:4><'ftyp'><brand:4>...`
  if (buf.length >= 12 && buf.subarray(4, 8).toString("latin1") === "ftyp") {
    const brand = buf.subarray(8, 12).toString("latin1").toLowerCase().trim();
    if (isoBmffBrands[brand]) return isoBmffBrands[brand] as string;
    // Unknown brand → assume MP4 if we got this far (still better than trusting client).
    return "video/mp4";
  }
  if (buf.length >= 4 && buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return "video/webm";
  }
  return null;
}

/**
 * Map a sniffed type to the equivalence class the upload pipeline cares about,
 * so e.g. an `image/heif` upload labelled `image/heic` still passes (the two
 * share a container).
 */
function normalizeClass(mimeType: string): string {
  if (mimeType === "image/heif") return "image/heic";
  return mimeType;
}

export function sniffActualMimeType(buf: Buffer, claimed: string): SniffResult {
  const sniffed = sniffBytes(buf);
  if (!sniffed) return { mimeType: null, matches: false };
  return { mimeType: sniffed, matches: normalizeClass(sniffed) === normalizeClass(claimed) };
}
