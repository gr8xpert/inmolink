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
