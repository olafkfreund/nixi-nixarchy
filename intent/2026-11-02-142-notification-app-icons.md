---
status: draft
issue: 142
author: olafkfreund
follows: intent/2026-11-02-138-nixi-alerts-and-props.md
---

# Intent: Show the sending app's icon on every notification

Code: `olafkfreund/nixoarchy-snowflake` (Nixi) and, if the shell has to send
the icon, `olafkfreund/nixarchy` (omarchy-shell patch 903). Artifacts live
here.

## Problem

- **You can't tell at a glance which app sent a notification.** Nixi shows
  a generic animation per kind: an envelope for mail, a bubble for chat, a TV
  for feeds, a bell for the rest. Gmail and Outlook get the same envelope;
  Slack, Teams and WhatsApp get the same bubble.
- **The only clue is text:** the app or site name in the caption, which
  takes reading.
- **No icon reaches Nixi.** The shell's notification delegate (omarchy-shell
  patch 903) sends `key, app, source, summary, body, urgency, category`. It
  has the notification's `appIcon` and `image` but drops them.
- **Browser and web-app notifications are the hard case.** They all report
  the app as "Google Chrome"; only the site (`mail.google.com`,
  `web.whatsapp.com`, …) tells them apart.

## Proposed outcome

- **The real icon on every notification.** Each notification Nixi shows
  carries the sending app's real icon:
  - on the envelope (mail), the chat bubble and the feed TV;
  - as a small badge next to the caption for every other notification.
- **Web apps get their own icon:** Gmail's for Gmail, WhatsApp's for
  WhatsApp, not Chrome's.
- **A missing icon falls back cleanly** to the current animation, with no
  broken image or empty square.
- **The icon animates in** with the notification and is readable at Nixi's
  size.

## Affected users and systems

- **`nixoarchy-snowflake`:**
  - `app/server.py`: finding the icon and serving it to the page safely;
  - `app/static/index.html`: drawing it on the props and the badge;
  - the tests.
- **Possibly `nixarchy`:** a small addition to patch 903 so the delegate
  also passes the icon name or path. That means a nixarchy rebuild.
- Everyone using Nixi's notification takeover.

## Constraints

- **Privacy and security:** the page must never load an arbitrary file path
  or URL from a notification. Icons are resolved and served by Nixi's server
  from known places only (icon themes, `.desktop` entries, the browser's own
  web-app icon folders), size-capped, as image types only. No network
  fetches; in particular, no fetching favicons from the web.
- **CPU:** icons are looked up once per app and cached. Nothing new happens
  per frame.
- **Previews:** any visual check runs only in the GPU-free headless
  Chromium (`--disable-gpu`, SwiftShader), never in the user's Chrome.
- **Existing behaviour stays** when there's no icon: the animations,
  burst grouping, click-to-open and the hide/peek/doze modes.

## Open questions

1. **Where the icon comes from.** My recommendation is **A, then B as a
   fallback**:
   - **A.** Extend shell patch 903 to pass `appIcon`/`image`. That's exact,
     but it needs a nixarchy change and rebuild.
   - **B.** Nixi looks the icon up itself from the app or site name, using
     `.desktop` entries, the icon theme and Chrome/Quick-Web-Apps web-app
     icons. No shell change, but it can guess wrong.
2. **The size and place of the badge** for "other" notifications. Proposed:
   a round 22 px icon at the caption's start, plus a small icon on the prop
   for mail, chat and feed.
3. **Notification images.** Should a notification's own `image` (for
   example a sender's avatar in chat) be shown? It's personal data. Proposed:
   **no**, only the app icon.
