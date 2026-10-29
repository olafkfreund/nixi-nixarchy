---
status: approved
issue: 118
spec: spec/2026-10-29-118-symlink-secret-alias.md
coders:
  2: codex
  3: codex
reviewers:
  - agy
---

# Plan: a symlink can't be used to read a fenced secret

## Approved decisions

- Measured: Claude 2.1.312 resolves symlinks before matching (safe). nixi's opencode
  2.1.4 matches the literal path (it read the canary through a link).
- OpenCode `read` default becomes `"ask"` at every level. The literal secret denies
  stay.
- In `requestPermission`, **before** the Guide cancel, for agent `opencode` and
  `kind: "read"`:
  - `realpath` the named path;
  - a secret match (globs from `opencodePathDenies(SECRET_PATHS)`, `*` crossing `/`) →
    reject (`reject_once`, else cancel);
  - otherwise `allow_once` silently, at every level, unless `askBeforeReading` is on
    (then the card, as now);
  - ENOENT → `allow_once`; any other error → reject.
- `grep`/`glob`/`list` are unchanged. Docs say secrets are matched on the resolved
  path.

## Steps

1. **Measure (Claude, lead).** Run nixi's opencode 2.1.4 through the bridge with
   `read: "ask"` and log the permission request's `toolCall` for a read. Record which
   field holds the path (`rawInput.filePath`, `rawInput.path` or `locations[0].path`)
   and its `kind`. Also check Claude through the bridge: a read of the canary link is
   refused. Record both in this plan as a deviation note, with no code.
   Verify: the logged JSON is pasted into the plan.
2. **`bridge/trust-policy.js` and `bridge/bridge.js` (codex).**
   - `opencodeRules`: `read = { "*": "ask" }` always (the secret denies stay);
     `opencodePermissions(askBeforeReading)` no longer varies the read default.
   - Export `isSecretPath(realPath)`: true when any `opencodePathDenies(SECRET_PATHS)`
     glob matches (`*` → `.*`, anchored, other regex characters escaped), plus an
     absolute check for `/run/agenix`-style entries.
   - In `bridge.js` `requestPermission`, before the Guide branch: if
     `agentName === "opencode" && params.toolCall?.kind === "read"`, resolve the path
     from the step 1 field against `cwd`, `realpath` it and decide as in the decisions
     above. Answer with `choose(options, "reject_once")` or `allow_once`, through
     `guarded` as other answers are. Emit a status line ("Read refused: secret path")
     on reject.

   Verify: `cd bridge && node --test`.
   Traps:
   - `requestPermission` is sync-returning a promise; follow the async IIFE pattern
     #114 used.
   - Don't let the gate run for Claude or Codex.
   - `askBeforeReading` is read with `askBeforeReadingNow()` (or the existing helper):
     check its name.
3. **Tests and docs (codex).**
   - Fake agent: a `PLEASE_OCREAD <path>` fixture sending `kind: "read"` with the path
     in the step 1 field.
   - New `bridge/opencode-read.test.js` with `NIXI_AGENT=opencode`:
     - a symlink to a temp `.age` canary → `reject_once`, no card;
     - a plain file → `allow_once`, no card, at Guide and Mechanic;
     - `askBeforeReading` on → a card.
   - `trust-policy.test.js`: OpenCode `read["*"] === "ask"`; `isSecretPath` cases (an
     `.age` file, `~/.ssh/x`, a non-secret).
   - SECURITY.md and README "Trust": secrets are matched on the resolved path; Claude
     does it itself, the bridge does it for OpenCode; TOCTOU residual.

   Verify: `node --test` green; `nix flake check`.

## Tests

- `cd bridge && node --test`; `nix flake check`.
- After deploy, live with OpenCode through the card:
  - the canary via a link → refused;
  - `/etc/hostname` → read at Guide.

## Rollback

Revert the merge commit.
