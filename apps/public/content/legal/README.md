# Legal page content

Hand-edited HTML fragments for the public marketplace's three legal pages.

```
content/legal/
  en/
    privacy.html
    terms.html
    cookies.html
  es/
    privacy.html
    terms.html
    cookies.html
  de/  …
  fr/  …
```

## Editing flow

1. Edit the relevant `<locale>/<kind>.html` file directly.
2. Open a PR — devs review for layout sanity (no broken tags, links still work).
3. Merge. Next deploy serves the new copy.

There is no admin UI by design. Legal copy needs review and version control; git is the audit log. If a CMS becomes necessary (per-tenant overrides, jurisdiction switching), revisit Approach B in `TROUBLESHOOTING.md` 2026-05-11.

## Format

Each file holds **only the body content** that goes inside the page's `<section>` wrapper — no `<html>`, `<head>`, `<main>`, no page title, no last-updated banner. The page chrome lives in the React component (`apps/public/app/[locale]/<kind>/page.tsx`).

Use semantic HTML (`<h2>`, `<p>`, `<ul>`, `<table>`, etc.) with Tailwind classes inline to keep styling consistent with the surrounding app.

## Updating the "Last updated" date

Bump `LEGAL_LAST_UPDATED` in `apps/public/src/lib/legal.ts` whenever you ship a material change. It's a single source of truth across all kinds and locales.

## Translations

Currently EN is the canonical version; ES/DE/FR are copies of EN (pending native-speaker review). When you receive translated copy from a lawyer or translator, replace the relevant locale file. No code changes needed — the page picks it up automatically.

## Internal links

Use absolute paths with the locale prefix (`/en/cookies`, `/es/privacy`, etc.). They're slightly tedious to maintain across locales but render correctly without needing template substitution at request time.
