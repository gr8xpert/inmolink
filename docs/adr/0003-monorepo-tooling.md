# ADR 0003 — Monorepo tooling choices (Turbo, Biome, Vitest, Husky, lint-staged)

- **Status**: Accepted
- **Date**: 2026-05-09
- **Deciders**: User (solo dev, owner)
- **Consulted**: Claude
- **Relates to**: [ADR 0001](./0001-stack-choice.md), [PLAN.md §11.12](../../PLAN.md)

## Context

Sprint 0 needed to choose concrete tools for: linting/formatting, testing, pre-commit gates, monorepo task orchestration, and dev-loop ergonomics. ADR 0001 named the categories ("Biome over ESLint+Prettier", "Vitest over Jest"); this ADR records the specific versions and config choices we landed on once we wired everything up.

## Decision

### Monorepo orchestration: Turbo 2

Used `tasks` (not the legacy `pipeline`) field. Cache outputs declared per task. `dependsOn: ["^build"]` on typecheck so workspace consumers see their deps' generated types. `db:generate` declared explicitly so it runs before `build` in any package depending on `@inmolink/db`. Concurrency cancellation in CI saves CI minutes on rapid PR refs.

### Linter / formatter: Biome 1.9.4

Single tool replaces ESLint + Prettier. Config:
- `noUnusedVariables: error`, `noUnusedImports: error`, `noExplicitAny: error`, `noConsoleLog: warn`.
- Style: `useImportType: error`, `useExportType: error` (matches `verbatimModuleSyntax: true` in tsconfig).
- 100-col width, 2-space indent, double quotes, trailing commas, organized imports.
- LF endings (matches `.gitattributes` + `.editorconfig`).

### TypeScript: 5.7

Base config in `tsconfig.base.json`:
- `target: ES2022`, `module: ESNext`, `moduleResolution: bundler`.
- `strict: true` plus the strictness toggles: `noUncheckedIndexedAccess`, `noImplicitOverride`, `verbatimModuleSyntax`, `forceConsistentCasingInFileNames`, `noFallthroughCasesInSwitch`.
- `incremental: true` for fast subsequent typechecks.

### Test runner: Vitest 2.1

Modern, ESM-native, ~3-10× faster than Jest in our typical case. Used by `packages/imports` for connector unit tests against the Kyero fixture (Sprint 5). Apps will adopt as they need it.

### API mocking: MSW

Same mocks for client + server tests. Imports adapter integration tests will use it for HTTP-mocked feed sources.

### Pre-commit: Husky 9 + lint-staged 15

Husky 9 is zero-config: `prepare: husky` in root `package.json` sets up hooks during `pnpm install`. `lint-staged.config.cjs` runs Biome `--write` on staged code files; on `schema.prisma` changes it also runs `prisma validate` + `prisma format`.

### Package manager: pnpm 10.33

Pinned via `packageManager` field in root `package.json`. Workspace declared in `pnpm-workspace.yaml`. `.npmrc` tunes:
- `auto-install-peers=true`
- `node-linker=isolated` (per-package node_modules so workspace scope is enforced)
- `link-workspace-packages=deep`
- `save-workspace-protocol=rolling`

### Argon2id implementation: @node-rs/argon2

Native Rust binding via Node N-API. Faster than `argon2` (pure-JS-with-WASM) and the canonical pick when production runs on a Linux VPS. OWASP 2024+ params: `memoryCost: 19456 KiB, timeCost: 2, parallelism: 1, outputLen: 32`.

### CI: GitHub Actions, 4-job parallel

Lint+typecheck, prisma-validate, test (with Postgres+Redis service containers), build. Build depends on lint+prisma. Concurrency cancellation on PR refs. Bundle-stats artifact uploaded for size budgets (PLAN §11.6).

### Dependabot: weekly grouped, monthly Actions

Weekly npm bumps grouped by area (next/react, prisma, fastify, auth, types, dev-tools). Major bumps are deliberately ignored — they require manual review (potential ADR). Monthly Actions updates.

## Consequences

### Positive
- Single linter/formatter cuts dependency churn vs ESLint + Prettier ecosystem.
- Strict TS + verbatim modules catches errors that would otherwise surface at runtime (especially around type-only imports in workspace boundaries).
- Per-package node_modules (isolated linker) enforces dependency declarations — no accidental reaches into other packages.
- Pre-commit auto-fix means PRs arrive clean, reviewers focus on logic.
- Turbo's task graph handles `prisma generate` ordering automatically — no "run this first" foot-gun for new contributors.

### Negative / trade-offs
- Biome is younger than ESLint, so some custom rules don't have direct equivalents. Acceptable: project rules are mostly "no any, no console.log, organize imports" which Biome covers.
- `verbatimModuleSyntax` requires `import type` on type-only imports, which trips up muscle memory from older codebases. Worth the runtime safety.
- @node-rs/argon2 has prebuilt binaries for major platforms; rare edge cases (BSD, exotic CPUs) may need source compilation.
- Strict typecheck on Next.js apps requires `next` to have generated `.next/types/**` for full route safety — handled by `dependsOn: ^build` in turbo.

### Open
- Whether to add a Storybook later for shadcn component refinement (deferred to v1.5).
- Whether to add Knip / depcheck to the CI to catch unused deps (deferred — small project, low signal-to-noise for now).

## Related

- [ADR 0001](./0001-stack-choice.md) — Stack choice (named the categories)
- [ADR 0002](./0002-storage-deduplication.md) — Storage dedup (independent)
- [PLAN.md §11.12](../../PLAN.md) — Code quality / DX checklist
