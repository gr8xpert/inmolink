# Troubleshooting log

Real bugs we hit and the root cause + fix. **Newest at the top.**

> **Format for each entry:**
>
> ## YYYY-MM-DD — Short title
> **Symptom**: what the user / system saw
> **Root cause**: what was actually broken (the *real* explanation, not just "we fixed it")
> **Fix**: what we changed (link the commit / PR if there is one)
> **Prevention**: what stops this from happening again — usually a test, a lint rule, a runtime check, or a doc update

---

## 2026-05-09 — `prisma generate` fails with EPERM rename on `query_engine-windows.dll.node`

**Symptom**: `pnpm --filter @inmolink/db db:generate` (or any operation that triggers `prisma generate`, including `prisma migrate dev`) fails on Windows with:

```
EPERM: operation not permitted, rename
'…/.prisma/client/query_engine-windows.dll.node.tmp9196'
-> '…/.prisma/client/query_engine-windows.dll.node'
```

The migration SQL still applies cleanly to Postgres + the migration file is created — only the client codegen step fails. Result: the DB is ahead of the generated TypeScript types, so any new schema field surfaces as a TS error in code that uses it.

**Root cause**: Prisma writes the new query engine binary to a `.tmp*` file then atomically renames it. Windows refuses the rename when **any process has the existing DLL loaded**. In this monorepo that's any of the dev servers (`apps/api`, `apps/web`, `apps/public`, `apps/worker`) running under `tsx watch` / `next dev` — they all import `@prisma/client`, which lazy-loads the engine. POSIX systems silently overwrite mapped files; Windows enforces the lock.

Notably the lock survives `Ctrl+C` of the watcher if a `tsx`/`node` child process leaks. PM2-managed runs are also susceptible.

**Fix (this session)**: `taskkill /F /IM node.exe` to clear all Node processes, then re-run `pnpm --filter @inmolink/db db:generate`. Worked first try once nothing held the DLL.

**Side effect**: kills *every* `node.exe` on the box — including `claude-code` MCP servers (we lost the `context-mode` plugin until next session restart). Only run when you can afford to lose all Node processes.

**Less destructive alternatives**:
1. **Stop only this repo's dev servers** before running migrate/generate (`pnpm dev` Ctrl+C, plus check for orphaned `tsx`/`next-server` PIDs in Task Manager).
2. **Add `db:generate:safe` script** that does it in a freshly-spawned shell with all watchers down — not yet wired up.
3. **Migrate inside the repo's docker-compose** (Postgres) but run `prisma generate` from a one-shot container with no shared volume on the dll path. Heavier.
4. *(Long-term)* On Windows-heavy teams, bump to Prisma's WASM driver adapter (`@prisma/adapter-pg` + `prismaSchemaFolder` preview) — eliminates the native DLL altogether. Requires schema changes and isn't drop-in today.

**Prevention**:
- Treat any `pnpm db:migrate:dev` / `pnpm db:generate` on Windows as an operation that needs **no dev watchers running**. Add a heads-up to the README's local-dev section.
- If the migration SQL has already applied to Postgres but `generate` failed, you can re-run `pnpm db:generate` standalone after stopping watchers — no need to re-run the migration. The `prisma_migrations` table tracks state and won't double-apply.

---

## 2026-05-09 — Git push hangs silently with Windows Git Credential Manager

**Symptom**: After the first successful `git push` (which used cached creds), subsequent pushes hang indefinitely with no terminal output. `GIT_TERMINAL_PROMPT=0` doesn't surface any error.

**Root cause**: Git remote uses HTTPS with `credential.helper=manager` (Windows Git Credential Manager). When credentials expire or aren't cached, GCM shows an interactive popup window — invisible to non-interactive shell sessions (Claude Code Bash tool, CI runners, headless terminals). The git process blocks waiting for popup interaction that can never come.

**Confirmation**: Forcing `-c credential.helper=` to bypass GCM produced the actual error immediately:
```
remote: No anonymous write access.
fatal: Authentication failed for 'https://github.com/gr8xpert/inmolink.git/'
```

**Fix (this session)**: Continued autonomous work as local commits only. User pushes manually when they return — single `git push origin main` sends all queued commits.

**Permanent fix options (pick one when convenient)**:
1. **Personal Access Token (PAT)** — set once, never blocks. Generate at https://github.com/settings/tokens (classic, scope `repo`), then:
   ```
   git config --global credential.helper store
   git push  # enter username + PAT once when prompted; cached forever
   ```
2. **SSH remote** — change remote URL and use SSH keys:
   ```
   git remote set-url origin git@github.com:gr8xpert/inmolink.git
   ```
   Requires `ssh-keygen` + adding public key to https://github.com/settings/keys.
3. **gh CLI auth** — install GitHub CLI, run `gh auth login`. CLI handles auth refresh transparently.

**Prevention**: For automation / CI / agent-driven workflows, always use PAT or SSH. GCM is for interactive humans only.
