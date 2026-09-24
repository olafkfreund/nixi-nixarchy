---
status: approved
issue: 41
author: olafkfreund
---

# Intent: Guide must behave the way Guide is documented to behave

## Problem

Guide is the default trust level and is described, in the README and in
`bridge/trust-policy.js:5-9`, as a level where the agent may explain but never
change the machine, because "the bridge CANCELS every permission request".

The bridge does cancel every request it receives. Three tools no longer generate
one.

`claudePermissions(askBeforeReading)` (`trust-policy.js:69-74`) takes no trust
argument, and `bridge.js:261` calls it unconditionally when the session is
created. Guide and Mechanic therefore hand Claude Code an identical permissions
object, including `allow: ["Read", "Grep", "Glob"]`. Claude Code applies that
allowlist itself, so those three tools never reach ACP as a permission request,
so Guide's cancel never sees them.

The practical result is that the default trust level performs filesystem reads
with no prompt and no approval -- only a transient status line that scrolls away.

`CLAUDE_SECRET_READS` (`:57-66`) narrows this but does not close it, for two
reasons. It is an enumeration rather than a boundary, so anything not listed is
readable. And every entry is a `Read(...)` pattern: there is no `Grep(` or
`Glob(` rule anywhere in the repo, so even the enumerated paths are unprotected
against the other two allowed tools.

This is traceable to a deliberate change. The comment at `:59-64` records that
the allowlist was added for #27, to stop Mechanic asking five or six times
before a single edit until "Allow" became a reflex. That reasoning is sound and
applies to Mechanic. The change landed on both levels.

Separately, this widens the impact of #42: agent-authored Markdown is rendered
with an automatic resource fetcher, so unprompted reads and an outbound channel
exist in the same default trust level.

## Proposed outcome

Either:

- Guide prompts for reads, and Guide's existing cancel turns every prompt into a
  refusal -- so Guide's documented guarantee becomes true; or
- The documentation and the `trust-policy.js` header comment are corrected to
  describe what Guide actually does, and the read allowance in Guide becomes a
  stated, deliberate design decision rather than an accident of #27.

Whichever is chosen, the code and the promise must agree.

## Affected users and systems

- Every user on the default trust level, which is every user who has not changed
  it.
- `bridge/trust-policy.js` and its one call site at `bridge/bridge.js:261`.
- `bridge/trust-policy.test.js`, which asserts what the bridge actually sends at
  `newSession` and will need a Guide case.
- Documentation: `README.md` and `docs/` wherever Guide's guarantee is stated.

## Constraints

- Must not reintroduce the #27 prompt fatigue in Mechanic. Mechanic keeps the
  allowlist.
- Must not weaken `CLAUDE_SECRET_READS` for Mechanic.
- The user's own `ask`/`deny` rules must continue to win, as they do today.
- Whatever the outcome, the `Grep`/`Glob` gap in the secret-path list should be
  closed for whichever levels retain the allowlist -- a denylist that covers one
  of three allowed read tools is not doing its job.

## Open questions

1. Which outcome: make Guide match the docs, or make the docs match Guide? This
   is a product decision about what Guide is for, and is the one thing the
   approver must settle before a spec can be written.
2. If Guide keeps reads, does it keep them for `Grep` and `Glob` too, or only
   `Read`? The secret-path list currently assumes `Read` only.
3. Does the same gap exist for the Codex and OpenCode adapters? `MODES` treats
   all three, but only Claude gets a permissions object; `OPENCODE_PERMISSIONS`
   sets `read`/`grep`/`glob`/`list` to `allow` by default, which looks like the
   same question in a different shape.
