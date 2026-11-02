---
status: approved
issue: 146
author: olafkfreund
---

# Intent: Every nixi bridge follows the trust level you set

Code and artifacts: this repo (`bridge/bridge.js`). The companion
(`nixoarchy-snowflake`) only gains a test, if one is needed.

## Problem

nixi's trust lives in one file, `~/.config/omarchy/nixi.json`, with `trust`
(Guide or Mechanic) and `permissionMode` (YOLO or ask). Each bridge reads it
**once, when it starts** (`loadSettings()`, `bridge.js:98`, called at `:499`).
After that, a bridge only learns about a change if the change arrives on its
own stdin (`trust` and `permission_mode` messages, `:881`, `:915`).

**Two bridges run:** the card's, and the Nixi companion's. A switch made in
the card reaches the card's bridge and the file, **but not the companion's
bridge.**

**Seen live on p620 (2026-11-02):**
- the companion's bridge started while nixi was on YOLO;
- you switched the card to Mechanic with asking;
- the companion went on running changes without a card until it was
  restarted.

**Why it matters:** you believe Mechanic is asking first, and it isn't. It
also undermines #144: the board's footer says what the file says, while the
companion's bridge does something else.

## Proposed outcome

- **Every running bridge follows the file.** A change to `trust` or
  `permissionMode`, made from the card, from the companion, or by editing the
  file, takes effect in every bridge within about a second, with no restart.
- **The stricter direction counts at once.** Switching to Guide, or out of
  YOLO, applies before the next permission request. A request already waiting
  for an answer gets the new rules, as when the card's own switch happens
  mid-request today: a switch to Guide cancels it (#106).
- **The looser direction never happens by accident.** A file that's
  unreadable, half-written or invalid never loosens anything. The bridge keeps
  its current level, or falls back to Guide, as `loadSettings` already does.
- **The companion shows the level its bridge actually uses.**

## Affected users and systems

- Everyone who runs the Nixi companion alongside the card.
- `bridge/bridge.js` and its tests.
- p620, for the live check.

## Constraints

- **The card's own switch flow stays the same:** the order of acks, and
  applying the ACP mode before writing the file (#40).
- **No polling loop that wakes the CPU every few seconds.** Use a file watch,
  or something equally cheap.
- **A Codex bridge at Guide keeps refusing,** as today (`CODEX_GUIDE_REFUSAL`).
- **Following the file must never turn YOLO on in a bridge whose session is
  at Guide.** The rule that YOLO needs Mechanic still holds.

## Open questions

None. The fix belongs in the bridge, so every client of nixi benefits, rather
than in the companion restarting its bridge.
