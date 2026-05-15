/**
 * Node-only async SSRF guard.
 *
 * Imports `node:dns` and is therefore NOT safe to load from the Next edge
 * runtime. The root `@inmolink/shared` barrel only re-exports the static
 * helpers from `./ssrf`. Server-side callers (worker, imports, API route
 * handlers running under the Node runtime) import the async guard from
 * `@inmolink/shared/ssrf-node`.
 *
 * Resolves the hostname and validates every resolved address against the
 * same deny rules as the static guard — defends against DNS rebinding when
 * followed by a single fetch with the resolved IP locked in.
 *
 * Pinning the resolved IP at the socket level (full DNS-rebinding closure)
 * requires a custom Node `Agent` / undici dispatcher and is tracked as a
 * follow-up (ADR pending). The current guard closes the easy cases
 * (registered private host, link-local literal, dotless name); rebinding
 * within the TTL window remains a residual risk.
 */
import { promises as dns } from "node:dns";
import * as net from "node:net";
import {
  SsrfBlockedError,
  type SsrfGuardOptions,
  assertSafeUrlStatic,
  isPrivateHost,
} from "./ssrf";

export { SsrfBlockedError, assertSafeUrlStatic, isPrivateHost };
export type { SsrfGuardOptions };

/**
 * Full async guard: parse, static-check, resolve DNS, and verify every
 * resolved address is public. Returns the parsed URL on success.
 */
export async function assertSafeUrl(input: string, opts: SsrfGuardOptions = {}): Promise<URL> {
  const parsed = assertSafeUrlStatic(input, opts);
  if (opts.allowPrivate) return parsed;
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname)) return parsed; // already validated statically
  let addrs: Array<{ address: string; family: number }>;
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new SsrfBlockedError(`DNS lookup failed for ${hostname}`);
  }
  if (addrs.length === 0) throw new SsrfBlockedError(`DNS empty for ${hostname}`);
  for (const a of addrs) {
    if (isPrivateHost(a.address)) {
      throw new SsrfBlockedError(`${hostname} resolves to private ${a.address}`);
    }
  }
  return parsed;
}
