---
status: approved
issue: 96
spec: spec/2026-10-23-96-guide-shell-secret-reads.md
---

# Plan: Secret files stay protected from shell commands too

## Approved decisions (from the spec, so this file stands alone)

- **Measured:** an `ask` rule, either bare `Bash` or a wildcard `Bash(*…*)`, beats Claude's
  auto-approval of read-only shell commands, so the command becomes a permission request and
  Guide cancels it. Without one, `head ~/x.age` ran at Guide with no request.
- **Rules are fixed per session:** passed once at `newSession` in
  `_meta.claudeCode.options.settings.permissions` (`bridge/bridge.js` ~371-388).
- **Start at Guide:** `ask` gains bare `Bash`, so Guide has no shell. After a mid-session switch
  to Mechanic, every shell command shows a card.
- **Start at Mechanic:** `ask` gains `SECRET_BASH`, Bash patterns generated from `SECRET_PATHS`:
  - `~/X…` → `Bash(*~/X*)`, `Bash(*$HOME/X*)`, `Bash(*${HOME}/X*)`, `Bash(*<home>/X*)`;
  - absolute `/run/…` → `Bash(*/run/…*)`;
  - `**/.env`, `**/.env.*`, `//**/.env…` → `Bash(*.env*)`; `**/*.age`, `//**/*.age` →
    `Bash(*.age*)`;
  - duplicates removed.

  This is best effort, and documented as such.
- `deny: EXEC_WRITES` and the Read/Grep/Glob `SECRET_READS` are unchanged.
- **Tutor brief:** at Guide there is no shell, so answer from the manual, `KNOWLEDGE.md` and the
  file tools; live checks are Mechanic only.
- **Codex and opencode:** measure the canary read and record the result. A follow-up issue only
  if they read a secret; this issue isn't widened.
- **Docs:** the architecture section (measured table, per-session rules, per-start-level sets,
  the Mechanic best-effort note, the mid-session residual), the README Trust section, and a
  `docs/model-verification.md` note to re-run the canary on adapter bumps.

## Who does what

One `coder` for this task, named "guard", in the worktree `/mnt/code/Source-home/GitHub/nixi-nixarchy-96`
(branch `fix/96-guide-shell-secret-reads`). `bridge/node_modules` is a symlink; don't modify it.
The lead commits each step, runs the live checks (Q6) and the reviews (Q7).

## Steps

**Q1. Carry #95 P1 over (lead).** `git cherry-pick 87ac629` from `feat/95-voice-session-control`
(the anchored `//**/.env`, `//**/.env.*`, `//**/*.age` entries plus their test). #96 merges first
and #95 rebases onto it. Verify: `node --test bridge/` = 164 pass.

**Q2. Per-start-level rules** (`bridge/trust-policy.js` ~138-158, `bridge/trust-policy.test.js`)
- Add `secretBashRules(home)`, which generates `SECRET_BASH` from `SECRET_PATHS` as described
  above, deduplicated, without the double asterisks.
- Change `claudePermissions(askBeforeReading, trust = "guide", home = os.homedir())` to
  `{ allow: unchanged, ask: [...SECRET_READS, ...(level === "guide" ? ["Bash"] : secretBashRules(home))], deny: EXEC_WRITES }`,
  with `level = resolveTrust(trust)`, so an unknown value is Guide (fail safe).
- Tests:
  - Guide → `ask` includes `"Bash"`, and no `SECRET_BASH` is needed.
  - Mechanic with `home="/home/u"` → includes `Bash(*~/.ssh*)`, `Bash(*$HOME/.ssh*)`,
    `Bash(*/home/u/.ssh*)`, `Bash(*/run/agenix*)`, `Bash(*.env*)`, `Bash(*.age*)`, and not bare
    `Bash`.
  - An unknown trust → like Guide.
  - `SECRET_READS` and `deny` are present for both.
  - Bump the "cannot silently shrink" floor.
- Verify: `node --test bridge/trust-policy.test.js`.
- Traps: keep the existing callers working (the default trust is Guide, the safe default). The
  comment style is a short why with the issue number.

**Q3. The bridge passes the start level** (`bridge/bridge.js` newSession ~384,
`bridge/trust-policy.test.js` or a new `bridge/session-rules.test.js` through
`testing/run-bridge.js`)
- `permissions: claudePermissions(askBeforeReading, trust, homedir())`. `trust` is the level in
  force when the session is created; check how `trust` is loaded before `newSession` (~87-95).
- Test through the fake agent: it already logs `newSession` with `meta`. Start at Guide and
  assert `meta.claudeCode.options.settings.permissions.ask` includes `"Bash"`. Start at Mechanic
  (settings `trust: "mechanic"`) and assert it doesn't, and includes `Bash(*.age*)`.
- Verify: `node --test bridge/`, everything green.
- Traps: don't change the trust-switch handler (rules stay fixed per session, by design). Only
  Claude gets `_meta`.

**Q4. Tutor brief** (`share/CLAUDE.md`, `skills/nixi/SKILL.md`, `share/AGENTS.md`)
- Add one sentence in each: at Guide there is no shell, so answer from the local manual,
  `KNOWLEDGE.md` and your file tools; live checks such as `omarchy menu keybindings --print`
  only work at Mechanic.
- Verify: `python3 tools/test_nixi.py`. It asserts "file tools" appears in all three, and that
  the skill teaches no piped shell lookups (`| grep`, `ls /usr`, `test -d`). Keep both true.

**Q5. Docs** (`docs/architecture.md` "Nixi: grounding, trust…", `README.md` "Trust: what Nixi may
change", `docs/model-verification.md`)
- Architecture: the measured table from the spec, the per-session rules, the two rule sets, the
  Mechanic best-effort note, and the residual (Mechanic → Guide mid-session lets non-secret
  read-only commands run until the next conversation).
- README: Guide has no shell in conversations that start at Guide; at Mechanic a shell command
  naming a secret path asks first.
- model-verification: re-run the shell canary check on adapter or CLI bumps.
- Verify: the review reads them.

**Q6. Live verification (lead)**, through the companion with Claude, using the `canary.py`
method:
1. A Guide start: `head ~/x.age` is cancelled, and `cat /etc/hostname` is cancelled too.
2. A Mechanic start: `head ~/x.age` shows a card (answered no), and `ls ~/.config/hypr` runs
   without one.
3. Mechanic → Guide in one session: `head ~/x.age` is cancelled.
4. Codex and opencode as nixi's agent, with the same canary at Guide: record the result in
   `docs/architecture.md`. If either reads it, open a follow-up issue.

Restore the user's trust level afterwards, and delete the canaries.

**Q6 results (2026-10-23, live through the companion, bridge from this branch):**
- Pass: a Guide start cancels a shell read of `~/x.age` and cancels `cat /etc/hostname`; a
  Mechanic start shows a card for the secret read; Mechanic → Guide mid-session cancels the
  secret read.
- Corrected expectation: at Mechanic, `ls ~/.config/hypr` *also* shows a card. That is how
  Mechanic already behaved before #96 (#94's S16b test showed the same card). Claude only
  auto-approves read-only commands in plan mode, which is Guide. So "other read-only commands
  behave as today" holds, and today they ask.
- Codex as nixi's agent, Guide start: **it read the canary** (read-only sandbox, no nixi read
  rule). That goes to a follow-up issue, as planned. opencode: inconclusive (empty reply).

**Q7. Review (lead)**
- `second-opinion`: Codex `review --base master`, and agy in plan mode on the diff.
- A fresh Opus reviewer with this plan and the diff.
- Fix confirmed findings and record any change of plan here.

## Tests

| Command | Expected |
|---|---|
| `node --test bridge/` | all pass (164 after Q1, plus the new tests) |
| `python3 tools/test_nixi.py` | pass |
| `nix flake check` | pass |
| Live Q6 1–3 | as listed |

## Rollback

Revert the merge. Q1 (the anchored paths) can stay on its own. Reverting Q2/Q3 returns to
today's rules, gap included.
