<!--
  PR template — keep terse. Reviewers (current + future-you) need to scan fast.
-->

## What

<!-- One sentence. -->

## Why

<!-- Why does this change need to exist? Link to PLAN.md section, ADR, or issue. -->

## How

<!-- High-level approach, plus anything non-obvious. -->

## Refs

- PLAN.md §
- ADR
- TROUBLESHOOTING entry (if this fixes something we hit before)

## Checklist

- [ ] Touches `packages/db/prisma/schema.prisma`? Migration committed (`prisma migrate dev --name <descriptive>`)
- [ ] Touches translatable strings? Added to all 4 locale files (en/es/de/fr)
- [ ] Touches a paid feature? `can(user, 'feature:...')` gate verified
- [ ] Touches money / commission %? Snapshot to deal record, not live lookup
- [ ] Touches encrypted fields? Used AES-256-GCM via the `Enc` field convention
- [ ] CHANGELOG.md updated (if user-visible)
- [ ] Adds an ADR if it's a real architectural decision
