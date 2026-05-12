import { check, group, sleep } from "k6";
/**
 * k6 baseline — anonymous public marketplace.
 *
 * Targets PLAN §11.12 budget: p95 < 500 ms across the public surface
 * even at the steady-state load.
 *
 * Run:
 *   k6 run --vus 50 --duration 5m -e BASE=https://inmolink.eu tools/k6/public.js
 *
 * Iteration mix is weighted to mirror production traffic shape:
 *   60% search list with filters
 *   30% property detail
 *   10% sitemap fetch + location landing
 */
import http from "k6/http";
import { Rate } from "k6/metrics";

const BASE = __ENV.BASE || "http://localhost:3002";
const API = __ENV.API_BASE || "http://localhost:3001";
const errorRate = new Rate("errors");

export const options = {
  scenarios: {
    steady: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "30s", target: 25 },
        { duration: "4m", target: 50 },
        { duration: "30s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  thresholds: {
    http_req_duration: ["p(95)<500", "p(99)<1500"],
    http_req_failed: ["rate<0.01"],
    errors: ["rate<0.01"],
  },
};

const QUERY_TERMS = ["villa", "apartamento", "house", "piscina", "vista al mar", ""];
const TX_TYPES = ["SALE", "RENT"];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

// k6's Goja runtime has no URLSearchParams — build the query string manually.
function qs(params) {
  const parts = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === "") continue;
    parts.push(`${encodeURIComponent(k)}=${encodeURIComponent(v)}`);
  }
  return parts.join("&");
}

export default function () {
  const r = Math.random();

  if (r < 0.6) {
    group("public-search", () => {
      const q = pick(QUERY_TERMS);
      const tx = pick(TX_TYPES);
      const query = qs({ q, transactionType: tx, limit: "20" });
      const res = http.get(`${API}/api/public/properties?${query}`, {
        tags: { name: "public-search" },
      });
      check(res, { "search 200": (r) => r.status === 200 }) || errorRate.add(1);
    });
  } else if (r < 0.9) {
    group("public-property-detail", () => {
      // For full coverage substitute a real seeded property slug+id.
      // Bench environments should pre-load `tools/k6/sample-ids.json`.
      const res = http.get(`${API}/api/public/properties?limit=1`, {
        tags: { name: "public-listing" },
      });
      if (res.status === 200) {
        const items = res.json("items") || [];
        if (items.length > 0) {
          const id = items[0].id;
          const detail = http.get(`${API}/api/public/properties/${id}`, {
            tags: { name: "public-detail" },
          });
          check(detail, { "detail 200": (r) => r.status === 200 }) || errorRate.add(1);
        }
      } else {
        errorRate.add(1);
      }
    });
  } else {
    group("public-sitemap", () => {
      const sm = http.get(`${BASE}/sitemap.xml`, { tags: { name: "sitemap" } });
      check(sm, { "sitemap 200": (r) => r.status === 200 }) || errorRate.add(1);
    });
  }

  sleep(1);
}
