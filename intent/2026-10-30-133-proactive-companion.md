---
status: approved
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
- **While the snowflake is visible, it shows notifications, not omarchy-shell.**
  There is one thing on screen reacting, not two. The shell still receives every
  notification, cleans it, keeps it in history, and runs its click action. It
  only stops drawing its own popup, and only while the companion holds a
  short lease that it renews while visible. When the companion is hidden,
  turned off or crashes, the lease lapses within seconds and the normal
  popups return by themselves. Do Not Disturb is never touched.
  The shell keeps its own popup for:
  - critical notifications
  - anything carrying a code (2FA, OTP)
  - Omarchy's own action messages

  Clicking a notification on the snowflake asks the shell to do what clicking
  its popup would do. Popups already on screen when the snowflake appears
  finish their few seconds; only new ones are handed over.
- **Speaking never opens the microphone.** Today every sentence the snowflake
  speaks opens a follow-up listening window afterwards (`Wake.talking_until`,
  `app/server.py:1559`, called from `Speaker` around line 2320). Anything it says
  on its own does not open that window, including:
  - notifications
  - meeting warnings
  - load warnings
  - break nudges
  - agent attention nudges

  The window opens only after an answer to something the user asked.
- **A notification arrival animation in the snowflake's own style.** It glances
  toward the caption, squishes once, throws two or three aura sparks, and the
  row settles into the caption or notch panel. In notch mode, the notch pulses
  once and opens. Each category gets its own short variant, built from the
  existing moods and effects (`MOODS`, `AURA`, `shock`, `burstLines`,
  `notchPulse`, `sfx`) rather than a new animation system:

  | Category | Variant |
  |---|---|
  | Mail | eyes sweep as if reading; one pale spark; soft pop |
  | Chat / Teams | a curious double glance; a two-note bubble sound |
  | Meeting reminder | amber sparks, a serious face, and the time stays on screen |
  | Video | star pupils and a short bob |
  | Download done | a proud `^ ^` face and green sparks |
  | Critical (the shell keeps its own popup too) | a short shake and a red flash |

  A notification that replaces an earlier one updates the row without playing
  the arrival again. A burst plays one arrival with a count. The arrival gives
  way at once to speech, listening, an approval card, or the agent working.
- **Situational looks show what the user is doing.** A new layer of things the
  snowflake wears, separate from the skin the user picked (halo, crown, sprout,
  bow), so both show at once. It is drawn in the same flat SVG style as the
  skins. Each look sits in its own zone, so looks do not collide with a skin:

  | Zone | Looks |
  |---|---|
  | Chin | a tie (in a meeting) |
  | Sides | headphones (music playing) |
  | Eyes | sunglasses or glasses |

  Eye-covering looks lift onto the forehead while the snowflake talks or
  listens, so its eyes still show. A look springs on and off. It must hold for
  a few seconds before it changes, so switching windows quickly does not make it
  flicker.
- Looks and reactions, ranked, each with its own switch:

  | # | Signal (verified on this machine unless noted) | Look / reaction | Why |
  |---|---|---|---|
  | 1 | Meeting Mode `~/.local/state/meeting-mode/active` | **tie**; no speech, no wake word | helpful |
  | 2 | `playerctl` status Playing (MPRIS) | **headphones**; a slow sway when idle | fun |
  | 3 | gog calendar, 10 min then 1 min ahead | calendar mark and time; the tie goes on a minute early | helpful |
  | 4 | sustained `/proc/loadavg` above the core count | a sweat drop and a squint | helpful |
  | 5 | `/proc/meminfo` MemAvailable under 10% | puffed cheeks and one warning, with hysteresis | helpful |
  | 6 | Hyprland fullscreen | **shades**; animation stops, everything quiet | helpful |
  | 7 | an hour of active time | a stretch and a "get up" nudge | helpful |
  | 8 | unlock after 30+ min away | a bounce and one line: missed notifications, next meeting | helpful |
  | 9 | download or long command finished | proud face (the arrival variant above) | helpful |
  | 10 | failed user unit (exists) | a confused glance when the count rises | helpful |
  | 11 | new NixOS generation (the glint exists) | a proud `^ ^` | fun |
  | 12 | editor or terminal focused for 60+ s (window class only) | round **glasses** | fun |
  | 13 | late night, 23:00 to 05:00 (`nightTime` exists) | a nightcap and more yawns | fun |
  | 14 | battery under 15% or 5% (`/sys/class/power_supply`) | sleepy, then pleading; joy when plugged in | helpful, laptops only (none on this desktop) |
  | 15 | weather (exists) | frost or warm tips; an umbrella when it rains | fun |
  | 16 | birthday or holiday from the calendar | a party hat, rarely | fun |
- It reacts with a mood, a caption and a short local quip. It speaks only for
  categories the user marked as spoken (default: meetings only).
- It stays quiet while:
  - Do Not Disturb is on (which covers calls)
  - it is hidden
  - the user is talking to it
  - a fullscreen window has focus

  One shared interruption budget, with deduplication and burst merging, keeps it
  from nagging. A meeting warning outranks everything else. Nudges with no
  deadline (breaks, load, tips) wait for a natural pause: an unlock, a
  workspace switch, or the end of a command. They do not land in the middle of
  typing. The research behind this is in the PR. Clippy failed on badly timed
  triggers. Studies of proactive assistants find that the same help is accepted
  about three times more often at a task boundary, and that users want to set
  the frequency themselves.

## Affected users and systems

- nixoarchy-snowflake: `app/server.py` (a notification listener, new `Ambient`
  sources, a shared quiet/budget policy, quips), `app/static/index.html`
  (settings toggles, reactions). Its issues are disabled; #133 tracks the work.
- nixarchy: a patch to the shell's notification service
  (`share/omarchy/shell/plugins/notifications/Service.qml`), next to the existing
  `pkgs/omarchy/902-notification-sender-close.patch`. It adds the lease, a feed
  of cleaned notifications, and click/dismiss by notification key over IPC.
  Offered upstream to Omarchy afterwards.
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
- **The takeover must fail safe.** No state that outlives the companion: no Do
  Not Disturb toggling, which is saved to disk and would leave the desktop silent
  after a crash. No taking over the `org.freedesktop.Notifications` bus name,
  which would cost history, click actions and code copy. A crash, a hide or a
  shell reload brings the shell's popups back.
- Speaking a notification must not open the companion's follow-up listening
  window (`Wake.talking_until`, `app/server.py:1559`). Otherwise the user's next
  sentence would go to the agent.
- The companion ignores its own notifications and nixi's, so it cannot react to
  itself in a loop.
- No new flake input. Nothing changes for users who leave it off. No transcript
  and no stored notification history.
- Cheap: no `/proc` scanning every second, and no polling faster than what is
  being watched changes. Read files (`/proc`, `/sys`, the Meeting Mode file)
  in-process; do not fork `hyprctl`, `playerctl` or `upower` each tick. Use the
  Hyprland socket for window events.
- The page already repaints every frame, and WebKit drops to low effects when a
  frame takes more than 32 ms (`lowFx`). Looks are flat paths moved by the
  existing springs. No new SVG blur filters, and no new timers or continuous
  animations per signal.
- Looks use the window class only. A window title is never read, stored or
  sent.

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
5. **Delivery:** one PR for everything, or in phases (proposed):
   (a) the speech-without-microphone fix, the shell lease and feed, the arrival
   animation, the look layer with the tie and headphones, and meetings;
   (b) load, fullscreen shades, breaks, the welcome back, and downloads (rows 4 to 9);
   (c) the fun looks (rows 11 to 16), the shell hook and quips.
6. **Sunglasses in meetings:** tie only (proposed, because sunglasses hide the
   eyes), or sunglasses as an alternative the user can pick?
7. **Sounds:** a short sound per notification category, on by default when not
   muted (proposed), or silent arrivals unless the user turns sounds on?

Resolved by the user (2026-10-30): popups already on screen when the snowflake
appears finish their few seconds. Speaking must never open the follow-up
listening window.

Resolved at approval (2026-10-30): the approver accepted every proposed answer.
1. Notifications only, no `gog gmail` polling.
2. Meetings are the only category spoken by default.
3. Sender or title on screen is a separate opt-in, never spoken.
4. The shell hook ships behind its own option.
5. Delivery in three phases (a), (b), (c).
6. Tie only in meetings; no sunglasses.
7. A short sound per category, on by default unless muted.
