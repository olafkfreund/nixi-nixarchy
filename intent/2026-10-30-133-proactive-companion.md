---
status: draft
issue: 133
author: olafkfreund
---

# Intent: A proactive companion that notices what happens on the desktop

## Problem

The snowflake companion (#94) only speaks when you speak to it. The user wants it
to notice things and react with some humour:

- new mail, Teams messages, meeting requests, YouTube and other app notifications
- a warning before a meeting
- RAM running high, or the CPU working hard
- a nudge to get up and move once an hour
- something finished in the background: a download, a long command, a build
- light comments on what the user is doing, and suggestions

Today:

- `nixi-watch` sends at most one workflow tip a day, from Hyprland window events.
- The companion's `Ambient` class (nixoarchy-snowflake `app/server.py:994`)
  already polls failed units, the weather and `gog` calendar. It flags the next
  meeting 10 minutes ahead, but that is off by default, and it never speaks.
- Nothing listens to desktop notifications. Nothing watches load, breaks or
  finished jobs.

## What the machine already gives us (verified 2026-10-30)

- **Every desktop notification**, with app name, title and body. A
  `dbus-monitor` on the session bus, running as the user, sees each `Notify` call
  that reaches omarchy-shell. teams-for-linux, browser tabs (Gmail, YouTube),
  downloads and `notify-send` all arrive this way. One listener covers most of
  the request.
- **Calendar**: `gog --readonly calendar events` (already used by `Ambient`).
  **Gmail**: `gog gmail`, read-only.
- **Do Not Disturb**: `omarchy-shell notifications isDnd`. Meeting Mode turns it on
  during calls, so honouring it also keeps the companion quiet during calls.
- **Load**: `/proc/meminfo`, `/proc/loadavg`. **Activity**: the Hyprland event
  socket that `nixi-watch` already reads.
- **Speech, moods, captions and rate-limited attention** already exist in the
  companion: `Speaker.say`, `BUS.pub`, `attention_accept`.

## Proposed outcome

- The companion can react to:
  - notifications, by category: mail, chat/Teams, meetings, video, downloads,
    other
  - the next meeting, 10 minutes ahead
  - high RAM or sustained CPU load
  - an hour of *active* work, which earns a "get up" nudge
  - a finished download or a long shell command
- Each category has its own on/off switch in the companion's settings, and one
  master switch turns all of them off. Everything is **off by default**. A
  user who turns nothing on sees no change.
- It reacts with a mood, a caption and a short local quip. It speaks only for
  categories the user marked as spoken (default: meetings only).
- It stays quiet while:
  - Do Not Disturb is on (which covers calls)
  - it is hidden
  - the user is talking to it
  - a fullscreen window has focus

  One shared interruption budget, with deduplication and burst merging, keeps it
  from nagging. A meeting warning outranks everything else.

## Affected users and systems

- nixoarchy-snowflake: `app/server.py` (a notification listener, new `Ambient`
  sources, a shared quiet/budget policy, quips), `app/static/index.html`
  (settings toggles, reactions). Its issues are disabled; #133 tracks the work.
- nixi: `nix/hm-module.nix` (an optional shell hook for long commands, and any
  new package the companion needs at runtime), README/docs.
- `bin/nixi-watch` is unchanged unless the spec puts the active-time break
  counter there.
- Only users who opt in to `services.nixi.companion` and then turn a category on.

## Constraints

- **Notification text is untrusted.** Anyone can write an email subject. Its title
  and body never reach the agent or the bridge, never go into a log or onto
  disk, and are never read aloud by default. Announcements say the category and
  app ("New Teams message"). Showing the sender or the title is a separate
  opt-in, and even then the existing `SECRET_LINE` and an OTP/2FA filter apply.
  Password managers and polkit are never announced.
- **Nothing leaves the machine unasked.** Quips and suggestions come from local
  templates. Window titles and notifications are never sent to a cloud model
  automatically. The agent is reached only when the user clicks or answers, as
  `nixi-watch`'s `--ask` tips do, and then through the bridge
  (`docs/architecture.md` invariant 1).
- **No screen reading.** No accessibility-tree or screenshot polling of Teams,
  Gmail or other apps.
- The companion ignores its own notifications and nixi's, so it cannot react to
  itself in a loop.
- No new flake input. Nothing changes for users who leave it off. No transcript
  and no stored notification history.
- Cheap: no `/proc` scanning every second, and no polling faster than what is
  being watched changes.

## Pushed back on (dropped unless the approver wants them back)

1. **Reading the Teams window.** teams-for-linux already sends a desktop
   notification for each message and meeting. Scraping its window is fragile and
   invasive, and adds nothing.
2. **Live AI commentary on what you are doing.** It would send window titles to
   a cloud model all day. That costs tokens, ties up the single-flight bridge
   (you would get "still working" when you call it), and leaks private titles.
   Local templates give the humour without the cost.
3. **"Any app or process finished."** The compositor cannot tell that a job
   succeeded from a window closing. Downloads (browser notifications, or
   `.part`/`.crdownload` files settling) and long shell commands (a shell hook)
   can be detected reliably. Arbitrary processes cannot, so that part is
   dropped.

## Open questions

1. **Gmail:** rely on browser/app notifications only (proposed), or also poll
   `gog gmail` for unread mail when no mail tab is open?
2. **Spoken by default:** meetings only (proposed), or meetings plus direct
   messages?
3. **Showing the sender or title** on screen, never spoken: a separate opt-in
   (proposed), or never?
4. **Shell hook for long commands:** ship it in the HM module behind its own
   option (proposed), or leave it out and rely on apps that already notify?
5. **Delivery:** one PR for everything, or in phases (proposed): (a) the
   notification listener, quiet rules and meetings; (b) load, breaks and
   downloads; (c) the shell hook and quips.
