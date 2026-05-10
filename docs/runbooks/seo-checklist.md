# SEO checklist (pre-launch)

PLAN §8 / §11.13. Run before opening up search-engine indexing.

## Quick pass

```bash
# Validate sitemap + hreflang against staging
tsx scripts/validate-sitemap.ts https://staging.inmolink.eu

# Validate against production (post-deploy smoke)
tsx scripts/validate-sitemap.ts https://inmolink.eu
```

## Manual checklist

- [ ] `/robots.txt` declares the sitemap and `Disallow: /api/` + `Disallow: /dashboard/`
- [ ] `/sitemap.xml` is the sitemap index (not a flat urlset) when ≥ 50 K URLs
- [ ] Each child sitemap caps at 50 000 URLs (Google limit)
- [ ] Every URL has `<xhtml:link rel="alternate" hreflang>` for en / es / de / fr
- [ ] `x-default` hreflang resolves to `/en/...`
- [ ] `<link rel="canonical">` on property detail pages points at the canonical slug
- [ ] Soft-deleted property URLs return **301** to `/search` or a similar listing (never 404 — see PLAN §8)
- [ ] OG + Twitter Card meta on property detail (image, title, description)
- [ ] `RealEstateListing` JSON-LD on every property detail page
- [ ] `BreadcrumbList` JSON-LD on location landings
- [ ] No-index on dashboard surfaces (`<meta name="robots" content="noindex">` for `/[locale]/dashboard/*`)

## Search Console setup

1. Submit `https://inmolink.eu/sitemap.xml` to Google Search Console
2. Same for Bing Webmaster Tools
3. Set up alerts for crawl errors and coverage drops
4. Verify domain via DNS TXT (Cloudflare DNS panel)

## Schema.org cheat-sheet

| Page                          | JSON-LD                          |
| ----------------------------- | -------------------------------- |
| `/`                           | `WebSite` + `SearchAction`       |
| `/[locale]/property/<slug>-<id>` | `RealEstateListing` + `Offer`   |
| `/[locale]/buy/...`           | `BreadcrumbList` + `Place`       |
| `/[locale]/agency/<slug>`     | `RealEstateAgent` + `member[]`   |
| `/[locale]/agent/<slug>`      | `Person` + `worksFor`            |

## Common pre-launch fails

- robots.txt cached — Cloudflare caches at the edge; `Cache-Control: max-age=300` on `/robots.txt` is enough
- Trailing slash redirects breaking canonical (Next.js `trailingSlash: false` is the safe default)
- Missing `Cache-Control: public, max-age=…` on the sitemap response — search engines re-fetch every 24h, so 1h cache is plenty
