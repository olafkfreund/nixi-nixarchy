---
status: draft
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

1. **Refuse to start, or warn and continue?** Refusing is the stronger
   guarantee and the ruder default; warning keeps the card usable while making
   the situation visible. The file is inert unless the directory is also
   trusted, which argues for warning — but the warning is only useful if
   someone reads it, and the card's `diagnostic` stream is not prominent.
2. **Warn for every agent, or only Codex?** Only codex reads that path, so a
   warning under Claude or OpenCode is noise — but a file appearing there is
   worth knowing about whichever agent is selected, precisely because it is
   unexplained.
3. **Does the check belong at the same place as the residual variables?**
   `NIXI_DIR`, `NIXI_FALLBACK_DIR`, `NIXI_DATA` and `NIXI_CWD` remain
   environment-settable after #76 and #77. If the cwd is redirected by
   `NIXI_CWD`, this check follows it, which is correct — but it is worth
   deciding whether those variables deserve the same treatment rather than
   leaving them noted in a spec nobody reopens.
