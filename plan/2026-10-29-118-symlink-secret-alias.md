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
   **Step 1 result (2026-10-29, measured through the bridge):**
   - **OpenCode 2.1.4, with `read: "ask"`:** the request for `notes.txt` arrived as
     ```json
     {"kind":"read","name":"read","title":"notes.txt",
      "locations":[{"path":"<cwd>/notes.txt"}],"rawInput":{"path":"notes.txt","limit":1}}
     ```
     The path is in `locations[0].path` (absolute, the **literal link path, not
     resolved**). `rawInput.path` is relative to `cwd`. The gate uses
     `locations[0].path`, falling back to `resolve(cwd, rawInput.path)`.
   - **Claude (claude-agent-acp 0.93.0) through the bridge:** the alias read became a
     permission request (Claude resolved the link and matched the secret ask rule).
     With the user's saved YOLO it was auto-allowed and the canary printed. At Guide
     it would be cancelled and at Mechanic a card. That is the current design:
     SECURITY.md puts what an agent does in YOLO out of scope. **Not changed here;
     reported to the user as a separate question.**
   - So OpenCode's gate *rejects* a secret read at every level (as its literal config
     deny does), which is stricter than Claude in YOLO. Kept as the spec decided.

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

## Deviations

- **Opus review, HIGH (fixed):** with `askBeforeReading` at Mechanic, the OpenCode read card
  offered "always", which OpenCode keeps as `read *`. Later reads would then never reach the
  gate, and a symlink to a secret would be read. `allow_always` is now dropped for OpenCode
  reads (#116 hides it for every read; this keeps #118 safe on its own). Test added.
- **Opus review, Low (fixed):**
  - a missing file now falls through to the ordinary-read handling, so `askBeforeReading`
    still shows the card;
  - the gate no longer sets `refusedThisTurn`, which made the "at Guide… try Mechanic"
    notice appear at Mechanic;
  - `isSecretPath` uses the `s` flag (a path with a newline);
  - `locations[0].path` is resolved against `cwd`;
  - the trust-policy comment names the exemption exactly.
- **Out of scope, reported:** `/run/secrets-for-users` (sops-nix `neededForUsers`) isn't in
  `SECRET_PATHS`. It predates this branch.
- **Unverified:** whether OpenCode keeps an "always" across sessions, which would matter for
  approvals given before this change. Live check after deploy.

## Tests

- `cd bridge && node --test`; `nix flake check`.
- After deploy, live with OpenCode through the card:
  - the canary via a link → refused;
  - `/etc/hostname` → read at Guide.

## Rollback

Revert the merge commit.
