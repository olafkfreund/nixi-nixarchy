---
status: draft
issue: 138
author: olafkfreund
follows: intent/2026-10-30-133-proactive-companion.md
---

# Intent: Honest agent alerts, better-looking props, a mic bar and a cartoon per notification

Code lives in `olafkfreund/nixoarchy-snowflake` (branch from `origin/main`; the
local `fix/94-speak-theme` checkout is 29 commits behind). Artifacts live here.

## Problem

1. **"Claude / Codex / agy needs you" is usually not true, and never says why.**
   - Codex's `notify` runs on every finished turn, and agy's `Stop` hook runs at
     every turn end. Both send the fixed text "is waiting for you", so the screen
     reads "Codex needs you: is waiting for you" (`~/.codex/config.toml`,
     `~/.gemini/config/hooks.json`).
   - Claude's `Notification` hook covers both permission prompts and the
     about-60 s "idle" notice. The hook passes on the message, but nothing tells
     the two apart.
   - The spoken line leaves out the reason: `sayAside(ev.name+' needs you')`
     (`app/static/index.html:1605`).
   - Every alert gets the urgent treatment: the pleading face, the orange flash
     and the `!` badge.
   - The 30 s limit per agent (`app/server.py:~994`) lets a plain "finished"
     take the slot just before a real permission prompt, which is then dropped.
   - No alert names the project.
   - The three hook lines are hand-edited in the user's home folder. No repo or
     doc owns them.
2. **The headphones and coding glasses look poor** (screenshots on #138):
   - The glasses are two fixed circles (r 22 at ±27.5, −4.5) inside eyes that
     are tall ovals (47×81). They read as a second set of pupils, and they don't
     follow the gaze, the eye size or the eyes drifting apart (`drawSit`
     `index.html:827`; eye maths `:1232-1245`).
   - The headphone band and the cups are both drawn in front (`#sitFront`;
     `#sitBack` is never used). The band covers the snowflake arms, the flat cups
     clash with the eyes as they grow, and nothing moves once they're on
     (`:813-820`, `:1337`).
3. **There's no level feedback while the user talks.** Only the thin hearing
   ring (`#vring`) reacts to the voice.
4. **Notifications all look alike.** Mail, chat, meeting, video, download and
   other differ only in mood, sound and a text line (`notifyDrain`, `:1720`).
   - Nothing on screen says "an email" or "a Slack message".
   - YouTube and Reddit have no category of their own.
   - Agent alerts have no visual identity: Claude, Codex and agy all look the
     same.

## Proposed outcome

- **Agent alerts tell the truth.**
  - "Needs your input" (a permission prompt or a question) and "finished"
    (a turn ended) are different events that look and sound different.
  - Each shows the agent, the project and a one-line reason: Claude's prompt
    text, or the first line of Codex's / agy's last reply.
  - Only "needs your input" uses the urgent look and speaks the reason, e.g.
    "Claude needs you in snowflake: permission to run Bash". "Finished" is a
    calm ✓ and a chime.
  - A "finished" can never block a later "needs your input".
  - The hook setup is documented in `docs/GUIDE.md`.
- **Agent marks.** Each agent's alert comes with its own small animated mark
  for Claude, Codex and agy. Each mark is recognisable at Nixi's size, and the
  animation shows which kind of alert it is (it pulses for "needs you" and
  settles with a ✓ for "finished").
- **Glasses** sit around the eyes, not inside them. They follow the gaze, the
  eye size and the spacing through the same maths as the eyes, and they spring
  on and off as they do today.
- **Headphones** have a band behind the snowflake arms and rounded, angled cups
  that never touch the eyes. They have depth (the cups shift with the gaze) and
  a **beat pulse** while music plays. One cup tips back while he talks or
  listens.
- **A mic level bar** sits under Nixi while the user talks: a few rounded bars
  in the theme colours, driven by the same level as the hearing ring, and hidden
  in the top-bar (notch) mode.
- **A cartoon per kind of notification**, one at a time, with the readable text
  in the existing caption:
  - **Mail:** an envelope flies in, its flap opens and a letter rises. Nixi
    reads the subject aloud, within the privacy limits below.
  - **Chat** (Teams, Slack, Discord, Signal…): a cartoon speech bubble with
    typing dots. A burst becomes one bubble with a count, not a stack.
  - **Feeds** (YouTube, Reddit, Twitch, Mastodon…): a new `feed` category with
    its own prop.

## Affected users and systems

- `nixoarchy-snowflake`: `bin/nixi-companion` (`attention`),
  `app/server.py` (`attention_accept`, notification rows and categories,
  possibly an output-level stream), `app/static/index.html` (`drawSit`,
  `frame()`, `notifyDrain`, the attention handler, new props),
  `tests/`, `docs/GUIDE.md`.
- The user's hook lines in `~/.claude/settings.json`, `~/.codex/config.toml`
  and `~/.gemini/config/hooks.json` on this machine. Other machines only get
  the change if they're edited the same way.
- Wherever notifications get their `category` (the omarchy-shell delegate),
  if feeds are classified there rather than in Nixi's server.

## Constraints

- **Privacy:**
  - Subjects and messages appear only under the existing `notify_details` gate,
    and after the existing secret and one-time-code scrub (`rows()`,
    `server.py:~1441`).
  - Nothing is spoken in a meeting, while the screen is locked, or when muted.
  - Speaking a mail subject needs its own opt-in, separate from showing it.
- **Hooks must never break an agent:** `attention` stays fire-and-forget, never
  fails and never starts Nixi.
- **CPU:** the page repaints every frame. New props stay off the DOM work while
  they're hidden, as the looks do today (`sitSettled`), and use no SVG filters.
- **Artwork:** flat SVG in Nixi's own style. The agent marks are original
  stylised marks that hint at each tool. They are not copies of the
  Anthropic, OpenAI or Google logos.
- **Existing behaviour stays:** existing settings switches, skins, the 5 s
  notification hold, burst grouping and click-to-open/focus keep working.

## Open questions

1. **Beat pulse source.** The reviewers disagree:
   - **Real output level** (Codex): a short PipeWire monitor capture while music
     plays, publishing only a level number. It's honest, but it costs a capture
     process, and the monitor hears all desktop audio (calls included). Meetings
     already pause music mode.
   - **Fake pulse** (agy): about 130 BPM. It costs nothing, but it drifts against
     the actual song.
   - My recommendation: **real level, behind its own switch, off by default**,
     falling back to a slow non-beat bob. Your call.
2. **Feed classification.** In Nixi's server (by app name, then browser source
   host) or in the omarchy-shell delegate that sets `category` today? I
   recommend Nixi's server, so no shell change is needed. The delegate's payload
   still has to be checked for a usable source URL.
3. **Speaking the mail subject.** Is the opt-in "speak mail subjects" switch
   (off by default) what you want, or should it follow the existing per-category
   "speak" list?
4. **Agent marks.** Are original stylised marks fine? Proposed: a warm
   sunburst for Claude, a `>_` terminal for Codex, an orbit/arc for agy. Or do
   you have artwork to use?
5. **Delivery.** One PR, or two (alerts + agent marks first, then the looks and
   notification props)? I recommend two.
