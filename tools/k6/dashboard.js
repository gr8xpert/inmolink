import { check, group, sleep } from "k6";
/**
 * k6 baseline — authenticated dashboard.
 *
 * Targets PLAN §11.12 budget: p95 < 300 ms across the dashboard surface.
 *
 * Pre-req: a seeded user reachable at the API. Pass credentials via env:
 *   k6 run \
 *     -e API=http://localhost:3001 \
 *     -e WEB=http://localhost:3000 \
 *     -e EMAIL=admin@inmolink.local \
 *     -e PASSWORD=Inmolink-Dev-2026! \
 *     tools/k6/dashboard.js
 *
 * Auth flow (Auth.js v5 Credentials):
 *   1. GET /<locale>/sign-in to capture CSRF cookie + token
 *   2. POST /api/auth/callback/credentials with form body
 *   3. Subsequent VU iterations re-use the session cookie jar
 *
 * Iteration mix:
 *   45% list properties (cursor + filters)
 *   25% property detail
 *   15% list viewings
 *   10% list deals
 *    5% notifications
 */
import http from "k6/http";
import { Rate } from "k6/metrics";

const API = __ENV.API || "http://localhost:3001";
const WEB = __ENV.WEB || "http://localhost:3000";
const LOCALE = __ENV.LOCALE || "en";
const EMAIL = __ENV.EMAIL || "admin@inmolink.local";
const PASSWORD = __ENV.PASSWORD || "Inmolink-Dev-2026!";

const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    steady: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 10 },
        { duration: "3m", target: 20 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<300", "p(99)<800"],
    http_req_failed: ["rate<0.01"],
    errors: ["rate<0.01"],
  },
};

export function setup() {
  // Auth.js v5 Credentials flow — capture the session cookie once and
  // share with all VUs. Using the api directly is simpler than going
  // through the web app's CSRF dance for a load test.
  const jar = http.cookieJar();
  const csrfRes = http.get(`${WEB}/api/auth/csrf`);
  if (csrfRes.status !== 200) {
    throw new Error(`csrf fetch failed: ${csrfRes.status}`);
  }
  const csrfToken = csrfRes.json("csrfToken");

  const signin = http.post(
    `${WEB}/api/auth/callback/credentials`,
    {
      csrfToken,
      email: EMAIL,
      password: PASSWORD,
      json: "true",
      callbackUrl: `${WEB}/${LOCALE}/dashboard`,
    },
    {
      redirects: 0,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    },
  );
  if (signin.status !== 200 && signin.status !== 302) {
    throw new Error(`sign-in failed: ${signin.status}`);
  }

  // Capture the cookie jar contents to pass to VUs.
  const cookies = jar.cookiesForURL(WEB);
  return { cookies };
}

function applyCookies(data) {
  const jar = http.cookieJar();
  for (const [name, values] of Object.entries(data.cookies || {})) {
    for (const v of values) {
      jar.set(WEB, name, v);
      // Some Auth.js cookies are set on the api host too (same-site).
      jar.set(API, name, v);
    }
  }
}

export default function (data) {
  applyCookies(data);
  const r = Math.random();

  if (r < 0.45) {
    group("list-properties", () => {
      const res = http.get(`${API}/api/dashboard/properties?limit=25`, {
        tags: { name: "dash-properties-list" },
      });
      check(res, { 200: (r) => r.status === 200 }) || errorRate.add(1);
    });
  } else if (r < 0.7) {
    group("property-detail", () => {
      const list = http.get(`${API}/api/dashboard/properties?limit=1`, {
        tags: { name: "dash-properties-pick" },
      });
      if (list.status === 200) {
        const items = list.json("items") || [];
        if (items.length > 0) {
          const detail = http.get(`${API}/api/dashboard/properties/${items[0].id}`, {
            tags: { name: "dash-property-detail" },
          });
          check(detail, { 200: (r) => r.status === 200 }) || errorRate.add(1);
        }
      }
    });
  } else if (r < 0.85) {
    group("list-viewings", () => {
      const res = http.get(`${API}/api/dashboard/viewings?limit=25`, {
        tags: { name: "dash-viewings" },
      });
      check(res, { 200: (r) => r.status === 200 }) || errorRate.add(1);
    });
  } else if (r < 0.95) {
    group("list-deals", () => {
      const res = http.get(`${API}/api/dashboard/deals?limit=25`, {
        tags: { name: "dash-deals" },
      });
      check(res, { 200: (r) => r.status === 200 }) || errorRate.add(1);
    });
  } else {
    group("notifications", () => {
      const res = http.get(`${API}/api/dashboard/notifications?limit=20`, {
        tags: { name: "dash-notifications" },
      });
      check(res, { 200: (r) => r.status === 200 }) || errorRate.add(1);
    });
  }

  sleep(1);
}
