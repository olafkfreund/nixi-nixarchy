---
status: approved
issue: 63
author: olafkfreund
---

# Intent: The agent must not be able to rewrite the rules that govern it

## Problem

The bridge starts the agent with `cwd = ~/.config/nixi` (`bridge/bridge.js:42-45`)
so Claude Code loads Nixi's `CLAUDE.md` as its tutor brief. That is deliberate
and good.

But Claude Code also reads **project-level settings and hooks** from its working
directory: `.claude/settings.json`, `.claude/settings.local.json`, and hook
definitions including `PreToolUse`, which runs a shell command.

Three facts combine, each verified:

- `cwd` is `~/.config/nixi` -- `bridge.js:42-45`.
- **No `settingSources` restriction exists.** `grep -rn settingSources bridge/*.js`
  returns nothing, so the adapter's default `["user","project","local"]` applies.
- **`.claude/` there is unmanaged.** `nix/hm-module.nix:173-179` manages five
  *leaf files* -- `faq.json`, `KNOWLEDGE.md`, `CLAUDE.md`, `AGENTS.md`,
  `SKILL.md` -- not the directory. The imperative path does not place it either.

So in Mechanic, one approved Write to `~/.config/nixi/.claude/settings.json`
lets the agent grant itself standing permissions, or install a `PreToolUse` hook
that runs a shell command with no prompt. Effective from the next card open.

This outranks #52, which is the same shape at lower stakes. #52 is an approved
write that escalates to *running commands*; this is an approved write that
escalates to *rewriting what decides whether commands need approval at all*. It
disables the check rather than using it once.

## Proposed outcome

- What the agent may do is decided by Nixi's own trust policy and the user's own
  settings, and cannot be changed by anything the agent writes.
- The tutor brief keeps working: `CLAUDE.md`, `AGENTS.md` and the skill in that
  directory are why the cwd is set there at all.
- The user's own Claude Code configuration keeps applying, so someone who has
  deliberately customised their agent is not silently overridden by Nixi.

## Affected users and systems

- Every user running the Claude harness, in Mechanic. Guide is unaffected -- it
  cancels every request it receives.
- `bridge/bridge.js`'s `newSession` options; `bridge/trust-policy.test.js`,
  which asserts what is actually sent at `newSession`.

## Constraints

- Must not break the tutor brief. `CLAUDE.md` in the cwd is loaded as project
  *context*, which is a different mechanism from project *settings*; the fix
  must not assume they are the same and must be verified, not reasoned about.
- Must not silently discard the user's own settings. Nixi is a card on someone
  else's machine, not the owner of their agent configuration.
- Must not add a second enforcement mechanism where an existing option
  expresses the rule -- the #41 lesson.
- Codex and OpenCode take no `claudeCode` meta, so whatever is done must not
  assume the Claude shape applies to them.

## Open questions

1. Does restricting settings sources also drop `CLAUDE.md`? If it does, the fix
   trades the tutor brief for the boundary and needs rethinking. This must be
   checked by running it, not inferred.
2. Do Codex and OpenCode have an equivalent exposure? Their adapters take
   different options and this issue was found in the Claude path; leaving the
   other two unexamined would be fixing the instance again.
3. Should `~/.config/nixi/.claude/**` *also* be denied on the write side, as
   defence in depth, or is that the denylist-of-one the enumeration warned
   against?
