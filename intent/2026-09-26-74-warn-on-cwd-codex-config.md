---
status: approved
issue: 74
author: olafkfreund
---

# Intent: A config file Nixi never writes, in the directory Nixi chose

## Problem

`codex` loads `<cwd>/.codex/config.toml` as a project config layer. That layer
is disabled unless the directory is trusted in the user's own
`~/.codex/config.toml`, and trust is looked up by exact match with no ancestor
walk — all established in `codex-rs/config/src/loader/mod.rs:127-129`,
`:1081-1100` and `:1396-1412`, and confirmed both directions on a live desktop:

- cwd explicitly trusted → the planted `mcp_servers` command **spawned at
  session start**, outside any ACP permission request;
- cwd under a trusted `$HOME` with no explicit entry → **did not spawn**.

Nixi's ACP cwd is `~/.config/nixi` (`bridge/bridge.js:42-45`). So the exposure
is conditional on two things Nixi does not control:

1. someone or something placing a `.codex/config.toml` there — **not the agent
   itself**, since #75 is refuted and Guide cancels that write; and
2. the user having trusted `~/.config/nixi` in their own codex config.

Neither holds on p620 or razer today. But if both ever hold, the consequence is
unmediated: a command in `mcp_servers` runs at session start, so neither Guide
nor Mechanic ever sees it, and the card shows its usual trust badge throughout.

**The asymmetry worth acting on:** Nixi chose that directory and never writes
`.codex/` into it. Its presence is therefore always either a mistake or an
attack — there is no legitimate case for it that Nixi is aware of. That makes
it cheap to notice, and noticing costs nothing when the file is absent, which
is every normal session.

## Proposed outcome

When `<cwd>/.codex/` exists, the user is told, in the card, before it can
matter. Nixi does not silently run a session whose configuration it cannot
account for.

Nothing changes for the overwhelming majority of sessions, where the directory
does not exist.

## Affected users and systems

- Codex users only in terms of real exposure, but the check itself is
  agent-agnostic and costs one `existsSync` at startup.
- `bridge/bridge.js`, which already resolves the cwd and already has both
  `diagnostic` and `fatal` event types (`:188`, `:26`).
- Nobody's working setup, unless they have deliberately placed a codex project
  config in `~/.config/nixi`, which is the case worth surfacing.

## Constraints

- **Must not break a legitimate setup silently.** If someone *has* put a config
  there on purpose, the behaviour has to be legible and its reason stated.
- The check runs at startup, before the first prompt; it must not add a
  measurable delay or a failure mode of its own when the path does not exist.
- No dependency on codex internals. The check is "does this path exist",
  not "parse it and decide whether it is dangerous" — Nixi should not be in
  the business of interpreting another tool's config format.
- Bridge-side, so it covers the card and any other front end equally.

## Open questions

Answered by the approver on 2026-09-26.

1. **Refuse to start, or warn and continue?** **Warn and continue.** The file
   is inert unless the directory is also trusted, so refusing would block
   sessions that are provably safe. A `diagnostic` naming the path, once, at
   startup.

2. **Every agent, or only Codex?** **Every agent.** Only codex reads that path,
   but a file appearing in a directory Nixi owns and never writes is worth
   surfacing whichever agent is selected — and it is one branch fewer.

3. **Do the residual path variables get the same treatment?** **Yes — folded
   into this change**, rather than filed separately as I proposed:
   `NIXI_DIR`, `NIXI_FALLBACK_DIR`, `NIXI_DATA`, `NIXI_CWD`.

   **Correction to what I told the approver while asking.** I said `NIXI_CWD`
   is used by `bridge/testing/run-bridge.js` and that pinning it "needs care".
   It is not: `grep -c NIXI_CWD bridge/testing/run-bridge.js` is **0**, and the
   only reader is `bridge.js:43`. The heavy `NIXI_CWD` use during this
   investigation was in ad-hoc probes, not the test suite, and I conflated the
   two while writing the option. The caution was attached to the option that
   was chosen, so it is corrected here rather than quietly dropped.

   The real constraints, checked:
   - `NIXI_DIR` and `NIXI_DATA` **are** set by `tools/test_nixi.py:81,767`,
     but that test imports `bin/nixi-context` as a module and sets them in its
     own process — a wrapper `--set` never reaches it.
   - `NIXI_FALLBACK_DIR` is the only one the wrapper sets today
     (`--set-default`, `nix/package.nix:115`).
   - `NIXI_CWD`, `NIXI_DIR` and `NIXI_DATA` are set by nothing in the build.

   So the spec has to decide, per variable, whether the build should pin a
   value at all — which is a different question from flipping an existing
   `--set-default`, and is the substance of this half.
