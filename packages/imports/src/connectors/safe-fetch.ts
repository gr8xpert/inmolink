/**
 * SSRF-safe fetch with manual redirect handling.
 *
 * Why not `redirect: "follow"`: the platform follower bypasses our
 * `assertSafeUrl` check on the redirect target — a feed URL on a public
 * host could redirect to `http://169.254.169.254/...` and we'd happily
 * stream the response. Following manually + re-validating each hop keeps
 * the SSRF guarantee intact.
 *
 * Hop cap of 5 matches common HTTP client defaults (curl is 50, fetch is
 * 20). 5 is enough for the http→https upgrade or one CDN bounce that real
 * feeds use.
 */

import { assertSafeUrl } from "@inmolink/shared/ssrf-node";

const MAX_REDIRECTS = 5;

export async function safeFetchWithRedirects(
  feedUrl: string,
  init: RequestInit & { allowHttp?: boolean } = {},
): Promise<Response> {
  const { allowHttp = true, ...rest } = init;
  let currentUrl = feedUrl;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertSafeUrl(currentUrl, { allowHttp });
    const res = await fetch(currentUrl, { ...rest, redirect: "manual" });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) {
        throw new Error(`Feed fetch failed: ${res.status} ${res.statusText} (no Location header)`);
      }
      currentUrl = new URL(location, currentUrl).toString();
      // Drain the redirect body so the connection can be reused
      await res.body?.cancel();
      continue;
    }

    return res;
  }

  throw new Error(`Feed fetch exceeded ${MAX_REDIRECTS} redirects`);
}
