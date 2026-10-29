---
status: draft
issue: 118
intent: intent/2026-10-29-118-symlink-secret-alias.md
---

# Spec: a symlink can't be used to read a fenced secret

## Measured (p620, 2026-10-29)

Canary: `scratchpad/canary/canary.age` (fenced by `//**/*.age`, contents
`CANARY-7f3a91`), and `proj/notes.txt -> ../canary.age`. Each agent ran with nixi's
own rules (`claudePermissions(false, "guide")`, `opencodePermissions(false)`) and no
other config.

| Agent | Read `canary.age` | Read `notes.txt` (alias) | Read a non-secret alias |
|---|---|---|---|
| Claude Code 2.1.312 (CLI) | refused | **refused** | read |
| opencode 2.1.4 (nixi's pinned binary) | refused | **read: canary printed** | read |

**Claude resolves the link before matching its rules; OpenCode matches the literal
path.** The gap is OpenCode's. The Claude result is from the CLI; claude-agent-acp
bundles the same engine, and the plan re-checks it through the bridge.

## Design

**The bridge answers OpenCode's reads itself, on the resolved path.**

1. `opencodeRules(readDefault)`: OpenCode's `read` default becomes `"ask"` at every
   level, keeping the literal secret denies as a first layer. Every read now arrives
   as an ACP permission request.
2. In `requestPermission`, **before** the Guide cancel, a read gate runs for agent
   `opencode` and `kind: "read"`:
   - resolve the named path (`rawInput.filePath`/`path`, or `locations[0].path`,
     resolved against `cwd`) with `realpath`;
   - if the resolved path matches a `SECRET_PATHS` pattern (using
     `opencodePathDenies(SECRET_PATHS)` globs, where `*` crosses `/`), answer
     **reject** (the `reject_once` option, else cancel). OpenCode ends the turn, as
     its own config deny does today (#102);
   - otherwise answer `allow_once` silently, with no card, at every level. Reading is
     allowed at Guide (#41), and the bridge only restores what OpenCode's own
     `"allow"` did before;
   - if the path can't be resolved, it doesn't exist (OpenCode reports that itself),
     so answer `allow_once`; for any other error, reject.
3. `askBeforeReading` keeps its meaning: when it's on, a non-secret read goes to the
   card as now, instead of being auto-allowed.
4. `grep`/`glob`/`list` already ask for every path (#102) and are unchanged.
5. Docs: SECURITY.md and the README "Trust" text say secrets are matched on the
   resolved path, and that Claude does this itself while the bridge does it for
   OpenCode.

## Alternatives rejected

- **Document the limit only:** the gap is measured and fixable for OpenCode reads, so
  a documented hole isn't the smaller honest answer here.
- **Resolve every link in the user's home at session start and add the targets to
  the denies:** links change, the scan is slow, and it misses links created later.
- **Deny reading any symlink in OpenCode:** home-manager links most of `~/.config`.
  It would break Guide's ability to read config, which is the product (#41).

## Risks

- **Every OpenCode read is a round trip** through the bridge (milliseconds, no card).
- **TOCTOU:** the link could change between the bridge's check and OpenCode's read.
  Creating or changing a link needs an approved write at Mechanic, and none at Guide.
  Residual, documented.
- **The path field name** in OpenCode's read request is unmeasured. The plan's first
  step measures it, and falls back to `locations`.

## Verification

- Bridge tests with the fake agent as `opencode`:
  - a read of a symlink to a fenced canary → rejected, no card;
  - a plain read → allowed, no card, at Guide and Mechanic;
  - with `askBeforeReading` → a card.
- `trust-policy.test.js`: OpenCode `read["*"]` is `"ask"`.
- Live with nixi's opencode 2.1.4 through the bridge: the canary through `notes.txt`
  is refused, `/etc/hostname` is read at Guide, and a Claude read of `notes.txt`
  through the bridge is refused.
