---
status: draft
issue: 142
intent: intent/2026-11-02-142-notification-app-icons.md
---

# Spec: Show the sending app's icon on every notification

Code is all in `olafkfreund/nixoarchy-snowflake`. **No shell change.**

## Decisions on the intent's open questions

| # | Question | Decision |
|---|---|---|
| 1 | Icon source | **B only: Nixi looks the icon up itself.** The shell already records `appIcon`, and in its history (100 rows) it is **empty for every sender except Meeting Mode** (`camera-video`): Chrome web apps, Omamail and Herdr all send none. So passing it on (A) adds nothing worth a `nixarchy` change. |
| 2 | Badge | A round 22 px icon at the start of the caption for every notification. On the mail envelope, the icon replaces the app line's text. On the chat bubble and the feed TV, a small 14-unit icon sits on the prop's corner. |
| 3 | Notification images | Not shown. App icons only. |

## Design

**1. The resolver: `class Icons` in `app/server.py`, next to `Inbox`.**

- **The index** is built once, then rebuilt at most every 10 min and only
  when a lookup misses. It reads every `*.desktop` in
  `~/.local/share/applications` and `$XDG_DATA_DIRS/*/applications`. For
  each entry it keeps the `Icon=` value, keyed by:
  - its file id (`slack.desktop` → `slack`), in lower case;
  - its `StartupWMClass`, in lower case;
  - its `Name=` in lower case, plus the part before " - " or " — "
    ("Gmail - Freundcloud" → `gmail`);
  - for Quick Web Apps (`io.github.*.QuickWebApps.<host-slug>-<id>.desktop`),
    the host slug (`mail-google-com`).
- **`Icons.lookup(app, source)`** returns a file path or `None`, trying in
  order:
  1. **Browser notifications** (app is a browser, `source` is a host):
     - the Quick Web Apps slug for that host;
     - otherwise a small, fixed host→name table, matched against the
       `Name=` keys: `mail.google.com`→`gmail`,
       `outlook.*`→`outlook`, `web.whatsapp.com`→`whatsapp`,
       `teams.microsoft.com`→`teams`, `*.youtube.com`→`youtube`,
       `*.reddit.com`→`reddit`, `*.messenger.com`→`messenger`,
       `discord.com`→`discord`, `app.slack.com`→`slack`;
     - otherwise the second-level label of the host (`claude.ai` →
       `claude`).
  2. **Everything else:** the app name (and `source` when it differs), by
     file id, `StartupWMClass` or `Name=`.
  3. Nothing found → `None`.
- **An `Icon=` value** is used directly when it's an absolute path to an
  existing `.png` or `.svg`. Otherwise it's a name, searched in
  `~/.local/share/icons`, `$XDG_DATA_DIRS/*/icons` and
  `/run/current-system/sw/share/icons`:
  - in `hicolor`, `Papirus` and `Adwaita`;
  - at sizes `128x128`, `256x256`, `96x96`, `64x64`, `48x48`, then
    `scalable`;
  - in `apps`;
  - then in `…/share/pixmaps`.
- **Results are cached per `(app, source)`**, misses included (for 10 min).
  Only regular files of at most 512 KiB with an image type are accepted.

**2. Serving the icon.**
- `Inbox.rows()` adds `"icon": "<id>"` to a row when `lookup` finds a path.
  `<id>` is the first 16 hex characters of `sha1(path)`, and the server
  keeps `id → path` in `Icons.served`.
- New route `GET /api/icon/<id>`: the id must match `[0-9a-f]{16}` and be in
  `Icons.served`. The response is the file, with `Content-Type` `image/png`
  or `image/svg+xml` and `Cache-Control: max-age=86400`. Anything else gets
  a 404.
- **No token on this route.** An `<img>` can't send a header, so the
  security is that ids are hashes the server itself handed out, for files it
  chose from known icon folders. No path ever comes from the page or from a
  notification. SVGs are only ever loaded as `<img>`/`<image>`, where they
  can't run scripts.
- **No network:** nothing is fetched from the web.

**3. The page: `app/static/index.html`.**
- **Caption badge:** `notifyShow` puts
  `<img class="nicon" src="/api/icon/<id>" alt="">` before the text
  (22×22, `border-radius:50%`, a 1 px light ring). It pops in with the
  caption (scale .6→1, 200 ms). `onerror` removes it, which leaves today's
  look.
- **Mail envelope:** a 20 px icon before the app name on the letter.
- **Chat bubble and feed TV:** an SVG `<image>` (14×14) on the prop's top
  corner, whose `href` is set when the prop starts. It's hidden without an
  icon.
- **Grouped notifications** ("3 new in Slack") show the latest row's icon.
- **Notch mode:** the caption is unchanged; the props are already hidden.

**4. Guard tests:**
- `tests/test_icons.py`, using a temp `XDG_DATA_DIRS` and `HOME`:
  - a native app by id;
  - by `StartupWMClass`;
  - a Chrome web app by its "Gmail - …" name for `mail.google.com`;
  - a Quick Web Apps slug;
  - an absolute `Icon=` path;
  - a theme lookup;
  - missing → `None`;
  - an oversized or non-image file refused.
- **Route tests:** an unknown id, `../`, a bad id format and an id not in
  `served` all get 404; a good id gets the bytes and the right type.
- `tests/accessories_fit.mjs` still ends in **all fit**, with the prop
  icons on.

## Alternatives rejected

- **Shell patch 903 passing `appIcon` (A):** empty for nearly every real
  sender (measured), so it's a cross-repo change for almost no gain.
- **Web favicons:** a network fetch per site, and a privacy leak.
- **Reading Chrome's Favicons database:** it's browsing history, and the
  file is locked while Chrome runs.
- **Bundled brand logos:** trademark use, and they don't match the user's
  own apps.

## Risks

- **Wrong-icon guesses** for browser notifications from sites with no web
  app (they fall back to the site-name match, or no icon). That's
  acceptable: no icon is today's behaviour.
- **Icon themes vary;** a missing icon simply shows no badge.
- **CPU:** the index scan is a few hundred small files, rebuilt at most
  every 10 min. Lookups are cached, and nothing new happens per frame.

## Verification

- `python3 -m unittest discover -s tests -q` is green (including the new
  tests).
- **GPU-free headless Chromium** (never the user's Chrome): a screenshot of
  each of mail, chat, feed and "other" with an icon, and one with a missing
  icon.
- **Live on p620** after deploying: one real Gmail web-app notification and
  one Slack, Teams or WhatsApp notification show their icons. Checked with
  a `grim` screenshot, and the kernel log stays free of ring timeouts.
