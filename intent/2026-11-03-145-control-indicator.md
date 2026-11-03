---
status: draft
issue: 145
author: olafkfreund
---

# Intent: Nixi shows who controls the desktop, and gives control back

Code: the companion (`nixoarchy-snowflake`). Artifacts: this repo. Source:
the four-product review (Codex and agy, 2026-11-02), issue #145.

## Problem

- **An AI agent can take control of the desktop through ai-mirror,** with
  the user's grant: it moves the mouse, types and clicks. Today the only
  signs are ai-mirror's own bar widget and dialog. Nixi, who sits on screen
  all day and is the thing the user looks at, shows nothing.
  - A request waiting for consent looks the same as no request.
  - An agent holding control looks the same as no agent.
  - An agent watching the screen (screenshots, OCR) looks the same as
    nothing.
- **Taking control back** means finding the bar widget, pressing the
  physical kill switch (SUPER+SHIFT+ESC), or typing `ai-mirror control off`.
  Nixi can't do it by voice or with a click, although he's the obvious
  place to ask.
- **ai-mirror already publishes its state locally**, so this needs no new
  connection:
  - `$XDG_RUNTIME_DIR/ai-mirror/state.json`: `owner` (`off`, `pending` or
    `agent`), `generation` and `since`. It's the file ai-mirror's bar widget
    reads.
  - A `watching` marker file in the same folder (a timestamp).
  - `ai-mirror control off` revokes control and releases held keys.
- **The companion has no ai-mirror code today.**

## Proposed outcome

1. **He shows the desktop's control state, at a glance:**
   - a request is waiting for consent → a waiting look: he watches the
     dialog, curious;
   - an agent holds control → a clear red mark on him, and a worried face,
     the whole time;
   - an agent is only watching → a "looking" face;
   - control is off → normal.
2. **You can take control back from him,** in any of these ways:
   - say it ("take control back", "stop the agent");
   - click the red mark;
   - use a Settings or menu item.
   Each runs `ai-mirror control off`. He then confirms it visibly at once
   (the mark goes, relief) and says it aloud if voice is on.
3. **The physical kill switch stays the real one.** SUPER+SHIFT+ESC is
   unchanged, and Nixi says so where it matters.
4. **Without ai-mirror, nothing changes:** with no state file, there's no
   mark, no menu item and no errors.
5. **Honest wording.** The grant binds agents that work through ai-mirror's
   MCP tools; an agent with a shell isn't bound by it. Nixi's wording never
   claims more. For example: "No agent is controlling the mouse and
   keyboard through ai-mirror", not "the desktop is safe".

## Affected users and systems

- **Users with ai-mirror** (p620 today; razer if installed).
- **The companion server:** reading the state file, and running `ai-mirror
  control off`.
- **The page:** the mark, faces, click, Settings or menu item, and voice
  phrases.
- **Not ai-mirror itself,** and not nixi's bridge.

## Constraints

- **No second grant and no new ai-mirror client in the companion.** Read
  the state file, and run only `ai-mirror control off`. Never `agent`,
  `confirm` or `deny`: the companion must never be able to *grant* control.
  - Its own screen capture stays its own.
  - ai-mirror's tools stay the agent's, through nixi's bridge.
- **Taking control back always works,** whatever Nixi's trust level
  (Guide, Mechanic or YOLO). Revoking is never gated.
- **Cheap to watch:** read a small local file (an inotify watch or a
  1–2 s poll), with no subprocess per tick.
- **A stale state** (ai-mirror crashed, file left behind) must not leave a
  red mark forever. How to tell is for the spec, for example by checking
  the `since` and `generation` values.
- **GPU safety** for any new mark or animation: flat colours, no filters,
  and the usual GPU-off previews and live `journalctl -k` check.

## Open questions

1. **Where is the "take control back" button?** My suggestion: the red mark
   itself (click), plus a menu item while an agent holds control. No new
   Settings switch: the indicator is on whenever ai-mirror is installed.
2. **Should a pending request also be answerable from Nixi** (allow or
   deny)? My suggestion: no. The consent dialog stays ai-mirror's own, so
   the companion can never grant. Nixi only shows that one is waiting.
3. **The watching look:** show it only while `watching` is fresh, say
   within the last 10 s? My suggestion: yes, 10 s.
