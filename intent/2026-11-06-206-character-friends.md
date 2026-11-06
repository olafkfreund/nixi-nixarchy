---
status: draft
issue: 206
author: olafkfreund
---

# Intent: Nixi reacts to what is happening, and lets you act on it

## Problem

The user likes today's characters, Snowflake, Terminal, Robot and Devil: cute, with big
eyes. They rejected new toy animals and anime redesigns: "I like our version that exists
much more". What they want is more animation and more reactions to what's happening on the
machine and in connected services, and more that they can do from there.

An audit of the code on 2026-11-06, corrected by review, found three problems.

1. **He senses a lot but barely shows it.** High load is a squint and sweat. A meeting soon
   is a small 📅 on one tip of his crown. A new message is a curious look. Most of it is
   off until `proactive` and its own setting are switched on.
2. **He announces, but you can't act.** He can't reply to a message or read an email out
   loud; the most he does is open the app. Approve and deny work only for his own turns. For
   Claude, Codex and agy running elsewhere he says "needs you" and jumps to the pane, and
   there is no approved or denied state.
3. **Much of what's collected never reaches him.**
   - Failed system services, disk, network and whether another host is up are collected
     for boards you ask for, but he doesn't react to them.
   - Heat shows only as a warm tint, and a storm counts as rain.
   - The break reminder is one fixed 60-minute stretch, with no workout schedule and no snooze.
   - Nothing reads the journal.
   - Plugins can't trigger a mood, a nudge or a prop, so nobody can add a reaction.

desk-pets and familiar inspired the idea of reactions that read with the sound off. We take
no art from either.

## Proposed outcome

- **Today's characters look as they do today.** Snowflake's resting look is untouched. No
  new eye system, no mouths they don't have.
- **Eighteen reactions, each with a prop, a body movement and each character's own touch,**
  readable from across the room with the sound off:

  | Group | Reactions |
  |---|---|
  | Machine | high load, low memory, system error |
  | Calendar | meeting soon, in a meeting |
  | Messages | new message, new email |
  | Agents | needs approval, approved, denied, finished |
  | Apps | opening an app |
  | Weather | rain, snow, hot and sunny, windy |
  | Breaks | workout, drink water |

- **Reactions build on what's there, and don't duplicate it.** Nixi already has a tie for
  meetings, headphones for music, shades for fullscreen, a beanie, a scarf, weather marks, a
  chat bubble and a mail envelope. An event plays a short reaction, then settles into the
  existing look. Weather, load and meetings can last for hours, so he doesn't keep acting
  through them.
- **You can act on them,** from a small chip beside him, which opens a card only when you
  click it or ask, so nothing covers your work or an open board unasked:
  - hear a message, or a summary of an email;
  - reply to an email, and later to chat apps that have a safe way to send;
  - approve or deny for Claude, Codex and agy, not only his own turns;
  - open an app, which already works;
  - snooze or dismiss a reminder, or join a meeting, which already exists on the day board.
- **A new character, "You":** a small, cute version of the user with Nixi's big eyes. How it looks is kept out of this repo (#213).
- **Any character can have its own voice:** a picker per character, "My voice" by default,
  worked out when he speaks, never overwriting the Voice tab or `voice_by_lang`. A character's
  preset wins over the language's saved preset, and speaks through that language's voices. A
  pinned Piper voice and the cloud voice stay in charge, and the picker says so. The Voice tab
  says when a character's voice is in charge. Agent announcements follow it too.

Mockups: `mockups/206/characters.html`, using Nixi's real art and real eye code.

## Affected users and systems

- Fork `olafkfreund/nixoarchy-snowflake`: `app/static/index.html`, `app/server.py`,
  `app/approve.py`, `app/plugins.py`, `tests/character_fit.mjs`, and new sensors and routes.
- `olafkfreund/nixos_config`: the Claude, Codex and agy hooks, for approval.
- External services: Google through `gog`, and any chat app with a safe way to send.
- Everyone who uses the companion, on p620 and razer.

## Constraints

- **Must:** today's art and eyes stay as they are, and Snowflake's resting look stays
  pixel-identical. Reactions are added on top, and go away when they end.
- **Must:** he stays calm. A new gate has to check Do Not Disturb, because today Nixi's reactions
  and speech don't look at it. Reactions also respect fullscreen, a meeting, the lock screen and
  reduced motion. They don't appear in the notch, bar and pop-out modes unless they can be drawn
  there. Approval requests keep getting through, as they do today.
- **Must:** performance stays as today: no SVG filters and no constant heavy repainting. Reaction
  art animates only `transform` and `opacity`.
- **Must:** props respect each body's `fits`: nothing through Robot's antenna or over the "You"
  hat. Sunglasses keep meaning fullscreen, so "hot and sunny" and "finished" need another look on
  today's characters.
- **Must: a voice yes never sends anything.** Sends stay click-to-confirm, as #95 decided. The card
  binds the verified account, recipients, thread and exact words to that one action, and a newer
  notification can't change it. Reply-all and `Reply-To` differences are shown.
- **Must: approving another agent is click-only at first.** The microphone isn't gated on media,
  so a video or a call saying "okay" could approve something while you're away. "Always" is never
  available by voice.
  - The card shows the real command, never the agent's own description of it, because a compromised
    agent could describe `curl … | sh` as "run the tests".
  - Each answer goes to one specific request in one specific session. A second card can't catch it.
  - "Approved" and "denied" show the agent's actual result, not the click.
  - No answer, an unknown agent or a lost connection means no approval. The agent's own guards still run.
  - He asks only when the agent itself would ask, or every edit would stop for a card. Answering in
    the terminal dismisses his card.
- **Must: mail and message text is data, never instructions.** Summaries run in a separate
  stateless call with no tools, never in his session and never in `history.json` or recall, and they
  can't trigger an action. A summary states who wrote it and that it's a summary, and one-time codes
  and reset links are removed first. Nothing is logged, including transcripts and model requests.
- **Must:** what he reads aloud respects who may be listening: nothing sensitive while locked or
  in a meeting, and a clear rule for which model and voice may receive it (see open question 2).
- **Must:** the "You" character is the user's own likeness, used with their consent, and is a
  personal option, not a default for other users (see open question 4).
- **Must:** original art only, with no logos, brands or existing characters.

## Open questions

1. **Which art?** See the mockup page: agy, Codex or Claude, or a mix. Your choice.
2. **Who may read your mail?** Recommended: a local model through Ollama by default, as `agent-say`
   does, with cloud models and the cloud voice only if you switch them on. **Which accounts?**
3. **How does approving Codex and agy work?** Both run a blocking `PreToolUse` hook on this system, so
   a yes or no can be returned. Not verified: whether that also answers their own terminal prompt, or
   only runs before it. Recommended: a spike first, and "open the session" for anything that can't be
   answered safely.
4. **Does "You" ship in the public repo?** Recommended: no. It goes in a private plugin or your
   nixos_config, once a character can come from a plugin.
5. **Should reactions be on by default?** Recommended: on for you, off for a new install, as
   today, with one simple switch instead of many flags.
6. **Which chat apps?** The notification bridge has no reply action, and web apps have no shared way to
   send, so each is its own integration. Recommended: email through `gog` first. **Which chat app do
   you use most?** Not checked yet: which ones allow it.
7. **What can plugins do?** Recommended: let a plugin fire a reaction, so a service like your
   media stack can have its own, under the existing consent rules.
8. **How is this split?** Recommended: separate issues, each with its own intent, spec and plan,
   because this is too large for one:
   1. the voice link, on its own;
   2. reactions, using signals that exist today, with chips;
   3. wiring what's already collected (services, disk, network, hosts, heat, storm), plus DND, snooze
      and a workout schedule, with their reactions;
   4. reading mail aloud and email replies;
   5. approval for other agents, after the spike, with approved and denied;
   6. chat replies, only for apps with a safe way to send;
   7. the "You" character and plugin reactions.

## Reviews (2026-11-06)

Their findings don't approve anything. Codex reported `gpt-6-sol`; agy reported no model. Earlier
drafts and their reviews are in this file's git history.

**Confirmed against the code and applied:**

- Both: voice can't safely approve another agent. `voiceAnswer` accepts "okay" and "sure", and the mic
  isn't gated on media (`index.html:2885`).
- Both: approval needs a real decision path with a request ID and the agent's real result.
- agy: spoken approvals use the agent's own `description`, not the command (`server.py:725`).
- Both: sends must stay click-only (`index.html:2890`, #95), bound to an exact destination.
- Both: summaries need isolation; "untrusted" alone isn't enough.
- Both: the audit overstated what's unsensed. Services, disk, network and hosts are collected but
  only shown on boards (`plugins.py:722`, `peers.py`). This makes that slice smaller.
- Both: reactions duplicated existing props and could clobber an open board, so they now extend, and
  a chip opens the card.
- agy: nothing in Nixi checks Do Not Disturb; a search of `server.py` and `index.html` finds no `isDnd`.
- agy: Codex and agy do have blocking `PreToolUse` hooks here (`claude-code-managed.nix:1031`, `:1067`).
- agy: sunglasses already mean fullscreen.
- Codex: the voice link doesn't depend on reactions, so it's now its own slice.
- agy: approved and denied have no signal yet, so they move to the approval slice.
- agy: chat replies are a separate, harder problem, with no reply action in the notification bridge.

**Corrected:** Codex said a Codex connection has no approval hook, citing the guide's notify line. That
line is about notifications; the separate `PreToolUse` hook exists, as agy found. Whether it also
answers Codex's terminal prompt is unverified.

**Not verified:** Codex's and agy's terminal prompt behaviour, chat app APIs, live config flags, and
whether the mic picks up speaker audio on your hardware.
