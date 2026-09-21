---
status: approved
issue: 31
author: olafkfreund
---

# Intent: The card's manual excerpt must not override "prefer nixarchy's own tools"

## Problem

#23 taught Nixi to lead with nixarchy's own panels (the package manager, Dev
environments, MicroVMs, Podman, Distrobox). In the card, it does not. Asked
"how do I install an app?" in Guide on razer with nixi `master` 1c3fc7c, the
card answered with the Omarchy **Install** menu, `apps.nix` and
`nixarchy apply`. It never mentioned the package manager panel, and it
invented a key ("Super + Alt + Space"; the menu is SUPER+SPACE).

The same question, from the command line with the same files
(`cd ~/.config/nixi && claude -p --permission-mode plan …`), gets the right
answer: SUPER+SPACE ▸ Install ▸ Packages first, then the terminal commands.

The difference is the grounding step. Before every question,
`bridge/grounding.js` appends `nixi-context`'s best-matching manual section,
framed as *"answer directly from this when it suffices, verify live only if
it doesn't"*. For this question the section is the manual's troubleshooting
entry "I picked an app in Install and it never appeared". Adding that exact
excerpt to the command-line run reproduces the card's answer. So the excerpt,
and the instruction to answer from it, outrank the skill.

Two things made this possible:

- **The instruction.** "Answer directly from this when it suffices" tells the
  agent to stop at the excerpt. It was written for an older server
  (`// Same wording nixi-server used`), before Nixi had a knowledge table or
  a method that says which tool to lead with.
- **The ranking.** `nixi-context` scores sections by word overlap. The
  troubleshooting entry matches "install" and "app" strongly, while
  KNOWLEDGE.md's "nixarchy's own tools" table does not win. Nothing marks
  that table as the preferred answer for the five jobs.

And one thing let it through: #23's before/after test gave Claude the skill
and KNOWLEDGE.md directly and never went through the bridge, so it tested a
path users do not use.

The invented key also matters in its own right. The excerpt says nothing
about keys, yet the answer states one with confidence, and the skill's
"verify live" rule was not followed.

## Proposed outcome

- Asked in the card (through the real bridge, grounding included), the
  five #23 questions lead with the right panel and match the machine's
  real plugin state, as the command-line run already does.
- The manual excerpt still helps. It stays as background the agent can use,
  not a script it must stop at, and questions it answers well today (the
  troubleshooting case: "I installed X and it never appeared") still get it.
- An answer never states a key it has not checked.
- There is a test for the real path: the bridge with the grounding step, not
  a raw `claude -p`, so this cannot regress unnoticed.
- Then #26 re-records scene 2.

## Affected users and systems

- Everyone using the card, in Guide and Mechanic. Every question goes through
  grounding.
- `bridge/grounding.js`, and possibly `bin/nixi-context` (ranking) and
  `share/KNOWLEDGE.md`; bridge tests; `tools/test_nixi.py`.
- The `nixi --tui` path has no grounding step, so it is not affected.

## Constraints

- Grounding stays an optimisation: a missing or failing `nixi-context` must
  still leave the question as typed (the current contract).
- Must not make ordinary answers slower or longer: no extra tool calls for
  questions the excerpt already answers.
- Guide still changes nothing.
- It is tested on razer through the card, the same way as #19–#21.

## Open questions

1. **Where to fix it:** the wording in `grounding.js` only, `nixi-context`'s
   ranking only, or both? The wording is one line and fixes the priority for
   every question; the ranking fixes which excerpt is chosen.
2. **The invented key:** is it enough to fix the priority (the skill already
   says verify keys live), or should the grounding also say that keys must be
   checked with `omarchy menu keybindings --print` before being stated?
3. **The regression test:** a bridge test with the fake agent can only check
   what prompt the agent receives, not what Claude answers. Is that enough in
   CI, with the real-answer check done on razer, or should there be a
   scripted real-Claude check (not in CI, since it needs a login) like
   `bridge/model-smoke.js`?
