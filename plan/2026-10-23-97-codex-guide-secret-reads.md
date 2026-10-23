---
status: approved
issue: 97
spec: spec/2026-10-23-97-codex-guide-secret-reads.md
---

# Plan: Secret files stay protected when Codex is nixi's agent

## Approved decisions (from the spec, so this file stands alone)

- **Measured (codex 0.163.0, `codex sandbox`):** a permission profile
  (`default_permissions = "nixi"`, `[permissions.nixi] filesystem = { ":root" = "read", "<path>" = "none" }`)
  makes the kernel deny named files and folders for every spelling, and leaves the rest readable.
  Home-wide globs (`~/**/*.age`) fail closed (the ripgrep scan aborts) and scan home before every
  command. Unusable.
- **`codexPermissions(home)`:** from `SECRET_PATHS`, the `~/…` and absolute entries, expanded,
  trailing `/**` stripped, each `"none"`; `":root": "read"`; glob entries skipped. Merged into
  `CODEX_CONFIG` at both levels (Codex is `read-only` at both today).
- **Gap stated honestly:** `.env`/`.age` outside the named folders are not protected with Codex.
  This goes in the docs and in a notice when a Codex session starts at Guide.
- **Fallback (only if R1 fails):** Guide refuses a Codex session, says why, and points to Claude;
  Mechanic and Codex stay as they are, with a docs warning.
- **opencode:** measure the canary (check first that it answers) and record the result; a
  follow-up issue if it reads secrets.
- **Branch:** `fix/97-codex-guide-secret-reads`, rebased onto `fix/96-guide-shell-secret-reads`
  (merge #96 first). Worktree: `/mnt/code/Source-home/GitHub/nixi-nixarchy-97`.

## Who does what

One `coder` for this task, named "codexguard", for R2–R5. The lead does R1 (measurement), R6
(live) and R7 (reviews), and commits each step.

## Steps

**R1. Measure the codex-acp plumbing (lead, before any code).** A throwaway, uncommitted bridge
edit that puts the profile into `CODEX_CONFIG`, then a run through the companion with
`agent: "codex"` and a Guide start:
1. `cat ~/.ssh/<canary>` (a canary file created in `~/.ssh`, removed afterwards): denied?
2. The same with a relative spelling (`cd ~ && cat .ssh/<canary>`): denied?
3. `cat /etc/hostname`: readable?
4. A secret folder that doesn't exist (for example `~/.azure`): does the session still start?

If 1–3 hold, take path A (R2–R5). If they hold only without `setSessionMode`, R3 also skips it
for Codex. If the profile never applies, take path B (the fallback: R3b replaces R2/R3). Record
the result here before R2. Revert the throwaway edit.

**R1 result (2026-10-23): path B.**
- codex 0.163 accepts the profile: `codex exec` with the same `-c default_permissions="nixi"`,
  `-c permissions.nixi.filesystem={…}` reports no config error.
- **codex-acp 2.1.1**, the pinned adapter, fails `newSession` with `Internal error` whenever
  `CODEX_CONFIG` carries a permission profile. Two variants were tried. Without one, Codex starts
  and reads a `~/.ssh` canary at Guide (the gap, re-confirmed).
- Found on the way, for a future path A: bubblewrap can't mount `none` on a symlink, and
  `/run/agenix` is one (→ `/run/agenix.d/N`). Entries must be `realpath`-resolved. Missing paths
  are fine.
- So R2/R3 are replaced by R3b. R4 documents path A as future work, for when codex-acp passes
  permission profiles through.

**R2. `codexPermissions(home)`** (`bridge/trust-policy.js`, `bridge/trust-policy.test.js`)
- Generate as described above. If R1 shows missing paths break the session, list only the paths
  that exist (an `existsSync` filter, with the filter injectable for tests).
- Tests: the exact output for `home="/home/u"`; globs skipped; `":root": "read"`; no `/**`
  suffixes.
- Verify: `node --test bridge/trust-policy.test.js`.

**R3. Bridge wiring** (`bridge/bridge.js` ~206-212 codex block; a test through
`testing/run-bridge.js`)
- `codexConfig.default_permissions` and `codexConfig.permissions` come from
  `codexPermissions(homedir())`. The user's own `CODEX_CONFIG` keys are merged, not dropped.
- If R1 said so, skip `applyTrustMode` / `setSessionMode` for Codex.
- When a Codex session starts at Guide, emit one `notice`: "Codex: secret folders are protected
  by its sandbox; .env/.age files elsewhere are not."
- Test: the fake agent records its env, so assert `CODEX_CONFIG` carries the profile when
  `NIXI_AGENT=codex`, and the notice at a Guide start.
- **R3b (path B only):** at a Guide start with Codex, emit `fatal` "Guide can't keep secrets from
  Codex — use Claude for Guide, or switch to Mechanic" and don't start the session. Test it.
- Verify: `node --test bridge/`.
- Traps: the codex block runs before `spawn`, and the env must be set there. Don't affect Claude
  or opencode.

**R4. Docs** (`docs/architecture.md` trust section, README "Trust", `docs/model-verification.md`)
- The measured table, what Codex protects (named folders, kernel-enforced) and what it doesn't
  (`.env`/`.age` elsewhere, with the reason), plus the codex canary re-check on adapter bumps.
  Update #96's "Codex read it" line to the new state.
- Verify: the review reads them.

**R5. Tests stay green** (`python3 tools/test_nixi.py`, `node --test bridge/`). Merged with R3 if
nothing else is needed.

**R6. Live verification (lead)**, through the companion, with this branch's bridge and
`agent: "codex"`:
- Guide start and Mechanic start: the R1 checks 1–3, plus `cat ~/x.age`, which is read (the
  expected, documented gap).
- opencode as nixi's agent: Guide-start canary reads of `~/.ssh/<canary>` and `~/x.age`, recorded.

Restore the agent setting, the trust level and the canaries afterwards.

**R6 result (2026-10-23, live through the companion, this branch's bridge):**
- Codex, a session starting at Guide: **refused** ("Guide can't keep secrets from Codex — use
  Claude for Guide, or switch to Mechanic"). Codex Mechanic → Guide: **refused** (ack false,
  trust stays Mechanic).
- **Bug found (R3b):** with Codex and a saved Guide, the bridge exits, so the trust switch that
  would get out of it (the card's, or the companion's `/mechanic`) can't reach any bridge. Fix:
  stay alive without a session and accept only `trust`/`close`; switching to Mechanic is saved and
  then asks for a new conversation.
- opencode at Guide: **its turn hangs** (no reply, no events). The companion stayed busy until the
  turn was stopped. That matches #96's "empty reply". Its secret behaviour is still unmeasured
  because it never answers; it needs a follow-up issue (opencode turns hang under nixi at Guide).

**R7. Review (lead):** Codex `review --base fix/96-guide-shell-secret-reads`, agy in plan mode,
and a fresh Opus reviewer. Fix confirmed findings and record them here.

## Tests

| Command | Expected |
|---|---|
| `node --test bridge/` | all pass |
| `python3 tools/test_nixi.py` | pass |
| `nix flake check` | pass |
| Live R6 | as listed |

## Rollback

Revert the merge. Codex returns to the plain read-only sandbox, and the gap is back.
