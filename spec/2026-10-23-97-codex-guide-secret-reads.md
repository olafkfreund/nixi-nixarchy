---
status: draft
issue: 97
intent: intent/2026-10-23-97-codex-guide-secret-reads.md
---

# Spec: Secret files stay protected when Codex is nixi's agent

## What was measured (2026-10-23, codex-cli 0.163.0, `codex sandbox -- <cmd>`, no model involved)

Codex 0.163 has **permission profiles**: `default_permissions = "<name>"` plus
`[permissions.<name>] filesystem = {…}`, where each path maps to `read`, `write` or `none`.

| Profile (`":root"="read"` plus …) | Command | Result |
|---|---|---|
| none (as nixi runs today) | `cat ~/x.age` | read |
| `"/home/u/x.age"="none"` | `cat ~/x.age` | **Permission denied** (bubblewrap, enforced by the kernel) |
| `"/home/u/dir"="none"` | `cat ~/dir/key`, and `cd ~ && cat dir/key` | **Permission denied** for both spellings |
| `"/home/u/dir"="none"` | `cat /etc/hostname` | readable (only the carve-out is closed) |
| `"**/*.age"="none"` or `"deny"` | — | rejected: globs must be anchored and only take `deny` |
| `"/home/u/**/*.age"="deny"` | `cat ~/x.age` | **the command fails to start**: Codex scans the anchored tree with ripgrep before every command, and the scan aborts on an unreadable path under `~/.config` |

So, for Codex:
- **Named secret locations are enforceable, and strongly:** `~/.ssh`, `~/.aws`, `~/.gnupg`,
  `~/.kube`, `~/.config/{gcloud,gh,op,sops}`, `~/.azure`, `~/.docker/config.json`,
  `~/.local/share/keyrings`, `~/.claude/.credentials.json`, `~/.netrc`, `/run/agenix`,
  `/run/secrets`. Any spelling hits the kernel's denial. That is stronger than the Claude rules,
  which match command text.
- **Scattered files** (`**/.env`, `**/.env.*`, `**/*.age`) are not enforceable at an acceptable
  cost. A home-wide anchored glob scans the whole home before every command and fails closed on
  this machine.

**Not yet measured, and decided by plan step R1:** whether codex-acp 2.1.1 passes a permission
profile from `CODEX_CONFIG` into the sessions it creates, and whether nixi's ACP
`setSessionMode("read-only")` replaces it with the legacy read-only sandbox, which reads
everything.

## Design

### 1. A nixi permission profile for Codex (`bridge/trust-policy.js`, `bridge/bridge.js`)

- New `codexPermissions(home)` generates, from `SECRET_PATHS`:
  `{ default_permissions: "nixi", permissions: { nixi: { filesystem: { ":root": "read", "<home>/.ssh": "none", …, "/run/agenix": "none", "/run/secrets": "none" } } } }`.
  - The paths are the `~/…` and absolute entries, expanded and with the trailing `/**`
    stripped.
  - Glob entries (`**/…`, `//**/…`) are **skipped**, and the docs say so.
- `bridge.js` merges it into `CODEX_CONFIG` (next to the model and effort, ~206-212) at both
  levels. Writes stay impossible, because the profile grants only `read`. Mechanic's Codex is
  also `read-only` today (`MODES.codex`), so nothing loses capability.
- If R1 shows the profile is overridden by the ACP mode or the mode's sandbox: send the profile
  and stop calling `setSessionMode` for Codex, **or**, if codex-acp can't take a profile at all,
  fall back to section 3.

### 2. Honest docs and card for the remaining gap

- `docs/architecture.md` and README "Trust": with Codex, named secret folders are protected by
  Codex's sandbox (kernel-enforced). `.env`/`.age` files elsewhere are **not**, and the measured
  reason is given.
- At Guide with Codex selected, the card's harness line adds one short note: "Codex: secret
  folders protected; .env/.age files elsewhere are not."

### 3. Fallback, used only if R1 fails: block Codex at Guide (intent Q2)

If codex-acp cannot apply the profile, Guide refuses to start a Codex session. The bridge
reports "Guide can't keep secrets from Codex — use Claude for Guide, or switch to Mechanic", and
the card offers Claude. Mechanic with Codex keeps today's behaviour, with the docs warning.

### 4. opencode: measure and record (intent Q3)

`OPENCODE_PERMISSIONS` allows `read` for everything except `*.env`. `~/.ssh` and `.age` look
readable at Guide. Measure the canary through the companion with opencode as nixi's agent
(#96's attempt returned an empty reply, so check first that opencode answers at all). Record the
result. If it reads secrets, open a follow-up issue. opencode's rules use its own syntax, and
its fix isn't folded in here.

## Alternatives rejected

- **Home-wide anchored globs for `.env`/`.age`:** measured to fail closed on this machine (the
  ripgrep scan aborts), and cost a full home scan before every command. `glob_scan_max_depth`
  only bounds the depth; it doesn't fix the abort.
- **Codex `untrusted` approval policy at Guide:** Codex auto-approves commands it deems safe
  (`cat`, `head`, `ls`), so reads still wouldn't become requests. It also adds nothing over the
  sandbox for named folders.
- **Block Codex at Guide unconditionally:** gives up a kernel-enforced protection that works for
  the named folders. It stays as the fallback (section 3).
- **Wait for upstream Codex glob support:** stated as future work in the docs.

## Risks

- **codex-acp may drop or override the profile.** R1 measures it first, and section 3 is the
  fallback.
- **A future Codex release changes the profile schema.** The adapter pin (#76) bounds this, and
  the live canary is added to `docs/model-verification.md` for bumps.
- **A secret folder that doesn't exist on a machine.** Codex may reject or ignore a missing
  path. R1 checks this, and if needed `codexPermissions` only lists paths that exist.
- **The user's own `~/.codex/config.toml` profiles:** nixi sets `default_permissions` for its
  own sessions only, via `CODEX_CONFIG`. The user's file still loads.

## Verification

- **Unit:** `codexPermissions("/home/u")` output (exact paths, globs skipped, `:root` read);
  the bridge puts it in `CODEX_CONFIG` (fake agent records env or config).
- **R1, live:** with Codex as nixi's agent through the companion:
  - Guide start: `cat ~/.ssh/<canary>` and a relative spelling are both denied.
  - `cat ~/x.age` is still read: the documented gap, recorded as expected.
  - `cat /etc/hostname` is readable.
  - Mechanic start: the same results.
- **opencode:** the canary measured and recorded.
- **Throughout:** `node --test bridge/` and `python3 tools/test_nixi.py` green.
