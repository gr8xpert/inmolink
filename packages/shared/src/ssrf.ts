/**
 * Edge-safe SSRF static guard.
 *
 * IMPORTANT: this module is imported by Zod schemas (`schemas/webhook.ts`,
 * `schemas/feed-connection.ts`) which transitively land in the Auth.js
 * `auth.config` edge bundle. It MUST NOT import Node builtins (`node:dns`,
 * `node:net`, etc.) — they cannot be resolved in the Next edge runtime and
 * the `apps/web` production build will fail with `UnhandledSchemeError`.
 *
 * DNS-resolving variant lives in `./ssrf-node.ts` and is exposed via the
 * `@inmolink/shared/ssrf-node` subpath. Worker / imports / API code should
 * import the async guard from there.
 *
 * Blocks (static check, by hostname):
 *   - non-HTTPS schemes by default (HTTP allowed only when `allowHttp` is set,
 *     intended for legacy feed URLs behind an internal allowlist)
 *   - localhost / loopback (127.0.0.0/8, ::1)
 *   - private IPv4 ranges (10/8, 172.16/12, 192.168/16)
 *   - link-local (169.254/16, fe80::/10)
 *   - cloud metadata (169.254.169.254)
 *   - multicast / reserved / IPv6 ULA (fc00::/7)
 *   - shorthand names without dots (e.g. `intranet`)
 *
 * NOTE: the URL allow check is a static guard. Redirect handling, TTL-bound
 * IP locking, and full DNS resolution belong in the fetch caller, which should
 * use `redirect: "manual"`, re-validate Location through this guard, bound the
 * body with `AbortSignal.timeout` + a streaming size limit, and run the async
 * `assertSafeUrl` from `./ssrf-node` before opening the socket.
 */

export type SsrfGuardOptions = {
  /** Allow http:// in addition to https:// (default: false). */
  allowHttp?: boolean;
  /** Allow private IPs (off by default; only set in tests). */
  allowPrivate?: boolean;
};

export class SsrfBlockedError extends Error {
  readonly reason: string;
  constructor(reason: string) {
    super(`SSRF blocked: ${reason}`);
    this.reason = reason;
    this.name = "SsrfBlockedError";
  }
}

// Regex-based IP detection so this module stays Node-free for the edge bundle.
const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
// Loose IPv6 — full validation isn't required because we follow up with
// per-form private-range checks; this just decides "looks like IPv6".
const IPV6_RE = /^[0-9a-fA-F:]+$/;

export function isIPv4(host: string): boolean {
  const m = IPV4_RE.exec(host);
  if (!m) return false;
  for (let i = 1; i <= 4; i++) {
    const n = Number(m[i]);
    if (!Number.isFinite(n) || n < 0 || n > 255) return false;
  }
  return true;
}

export function isIPv6(host: string): boolean {
  if (!host.includes(":")) return false;
  return IPV6_RE.test(host);
}

const PRIVATE_IPV4 = [
  // [networkPrefix, mask bits]
  ["10.0.0.0", 8],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local + metadata
  ["100.64.0.0", 10], // CGNAT
  ["0.0.0.0", 8],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved
] as const;

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number(p));
  if (parts.length !== 4 || parts.some((p) => Number.isNaN(p) || p < 0 || p > 255)) {
    return Number.NaN;
  }
  return (
    ((parts[0] as number) << 24) |
    ((parts[1] as number) << 16) |
    ((parts[2] as number) << 8) |
    (parts[3] as number)
  );
}

export function isPrivateIPv4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (Number.isNaN(ipInt)) return true; // fail closed
  for (const [network, bits] of PRIVATE_IPV4) {
    const netInt = ipv4ToInt(network);
    // bits is always 4..16 from PRIVATE_IPV4 — never 0, so the mask is well-defined.
    const mask = (~0 << (32 - bits)) >>> 0;
    if ((ipInt & mask) === (netInt & mask)) return true;
  }
  return false;
}

export function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  // fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast)
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  if (lower.startsWith("ff")) return true;
  // IPv4-mapped IPv6 (::ffff:0:0/96) → inspect the embedded IPv4
  const ipv4MapMatch = lower.match(/^::ffff:([0-9.]+)$/);
  if (ipv4MapMatch?.[1]) return isPrivateIPv4(ipv4MapMatch[1]);
  return false;
}

export function isPrivateHost(host: string): boolean {
  if (!host) return true;
  if (host === "localhost") return true;
  if (!host.includes(".") && !host.includes(":")) return true; // shorthand
  if (isIPv4(host)) return isPrivateIPv4(host);
  if (isIPv6(host)) return isPrivateIPv6(host);
  return false;
}

/**
 * Parse + statically validate URL. Returns the parsed URL on success.
 * Use the async `assertSafeUrl` from `@inmolink/shared/ssrf-node` for the
 * variant that also resolves DNS and checks each resolved address.
 */
export function assertSafeUrlStatic(input: string, opts: SsrfGuardOptions = {}): URL {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new SsrfBlockedError("invalid URL");
  }
  if (parsed.protocol === "https:") {
    // ok
  } else if (parsed.protocol === "http:") {
    if (!opts.allowHttp) throw new SsrfBlockedError("http scheme not allowed");
  } else {
    throw new SsrfBlockedError(`scheme ${parsed.protocol} not allowed`);
  }
  if (parsed.username || parsed.password) {
    throw new SsrfBlockedError("URL credentials not allowed");
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!hostname) throw new SsrfBlockedError("missing host");
  if (!opts.allowPrivate && isPrivateHost(hostname)) {
    throw new SsrfBlockedError(`host ${hostname} is private/reserved`);
  }
  return parsed;
}
