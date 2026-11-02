---
status: approved
issue: 142
spec: spec/2026-11-02-142-notification-app-icons.md
reviewers:     # the user asked for Codex and agy on Nixi work (2026-11-02); read-only, after the Opus review
  - codex
  - agy
---

# Plan: Show the sending app's icon on every notification

## Approved decisions (from the spec; this plan does not need it)

- **Repo:** `olafkfreund/nixoarchy-snowflake` only. No shell change.
  Worktree:
  `git -C /mnt/code/Source-home/GitHub/nixoarchy-snowflake worktree add ../snowflake-142 -b feat/142-notification-app-icons origin/main`
  (main at `7cf5026`). Line numbers below are from that commit; find anchors
  by name.
- **Icons are looked up by Nixi's server only.** No network fetches,
  favicon database or bundled logos. Notification images (avatars) are never
  shown.
- **The index:** every `*.desktop` file in `~/.local/share/applications` and
  `$XDG_DATA_DIRS/*/applications`, keyed by:
  - the file id (lower case);
  - `StartupWMClass` (lower case);
  - `Name=` (lower case), plus the part before " - " or " — ";
  - for `io.github.*.QuickWebApps.<host-slug>-<id>.desktop`, the host slug.

  Built on first use; rebuilt at most every 10 min, and only on a miss.
- **Lookup order:**
  1. **Browser notifications** (the app matches Markup's browser list:
     google chrome, chromium, brave, brave browser, microsoft edge, vivaldi,
     opera, helium, firefox, zen, librewolf; and `source` looks like a host):
     - the Quick Web Apps host slug (`mail.google.com` →
       `mail-google-com`);
     - otherwise the host→name table, matched against the `Name=` keys:
       `mail.google.com`→`gmail`; host starting `outlook.`→`outlook`;
       `web.whatsapp.com`→`whatsapp`; `teams.microsoft.com`→`teams`;
       `*youtube.com`→`youtube`; `*reddit.com`→`reddit`;
       `*messenger.com`→`messenger`; `discord.com`→`discord`;
       `app.slack.com`→`slack`;
     - otherwise the host's second-level label.
  2. **Everything else:** the app, then `source` if it differs, against the
     file id, `StartupWMClass` and `Name=` keys.
  3. Nothing found → `None`.
- **Resolving the `Icon=` value:**
  - an absolute existing `.png` or `.svg` is used directly;
  - otherwise it's searched in `~/.local/share/icons`,
    `$XDG_DATA_DIRS/*/icons` and `/run/current-system/sw/share/icons`, in the
    themes `hicolor`, `Papirus` and `Adwaita`, at sizes `128x128`,
    `256x256`, `96x96`, `64x64`, `48x48`, then `scalable`, in `apps`;
  - then in `…/share/pixmaps`.

  Accepted files are regular, at most 512 KiB, `.png` or `.svg`. Results,
  misses included, are cached per `(app, source)` for 10 min.
- **Serving:**
  - a row gets `"icon": sha1(path)[:16]`, and the server keeps the id→path
    map in `Icons.served`;
  - `GET /api/icon/<id>` needs `[0-9a-f]{16}` and an id in `served`;
  - it returns the bytes with `Content-Type` `image/png` or
    `image/svg+xml` and `Cache-Control: max-age=86400`; anything else gets a
    404;
  - no token on this route, because ids only come from the server.
- **Page:**
  - a 22 px round `img.nicon` before the caption text on every
    notification, popping in over 200 ms;
  - a 20 px icon before the app name on the mail letter;
  - a 14-unit SVG `<image>` on the top corner of the chat bubble and the
    feed TV;
  - `onerror` and a missing icon both fall back to today's look;
  - grouped rows use the latest row's icon.

## Repo traps (every step)

- **Previews only in a GPU-free headless Chromium** (`--headless=new
  --disable-gpu --use-angle=swiftshader --enable-unsafe-swiftshader`, temp
  profile, 0 `/dev/dri` handles). Never the user's Chrome: it hung the AMD
  GPU twice.
- **No per-frame work:** icons are set when a notification shows.
- **Never log notification text or icon paths with user data.** The
  `Inbox` docstring rules still apply.
- `tests/accessories_fit.mjs` must still end in "all fit".
- **Tests:** `python3 -m unittest discover -s tests -q` (pytest isn't
  installed); `test_no_herdr_writes` stays green.
- `SVG` is loaded only through `<img>`/`<image>`, never inlined.

## Steps

1. **`app/server.py`: `class Icons`** (a new class right after `Inbox`,
   `:1411`). It holds the index, `lookup(app, source)`, `path_for_name(name)`
   and `served`.
   → verify by step 3's tests.
   Traps: the browser list is copied from the shell (`Markup.js:115`), not
   imported.

2. **`app/server.py`: wire it in.**
   - In `Inbox.rows()` (`:1488`), after the category is settled, set
     `row["icon"]` from `Icons.lookup(app, source)` (`:1504`, the
     `keep.append`).
   - In `do_GET` (`:4103`), add the `/api/icon/` route before the static
     files.
   → verify by step 3's tests.

3. **`tests/test_icons.py`:**
   - the lookup cases from the spec, with a temp `XDG_DATA_DIRS`/`HOME`
     holding fake `.desktop` files and 1×1 PNGs;
   - the route cases (a real `HTTPServer` on port 0 with `server.Handler`,
     as in `tests/test_idle.py`).

   → verify with `python3 -m unittest discover -s tests -q`.

4. **`app/static/index.html`: show the icons.**
   - `notifyShow` (`:1808`) adds `img.nicon` when `ev.icon` is set (it needs
     the event passed in).
   - `mailPop` (`:1842`) puts an `<img>` before the app name.
   - The chat and feed props in `drawSit` (`:866`, `:875`) each get an
     `<image>` set when the prop starts.
   - CSS for `.nicon` next to `#cap`.

   → verify with `node --check` and step 5.

5. **GPU-free page check:**
   - serve a sandbox server, and fake rows by calling `onEvent` with
     `icon` ids from a temp icon;
   - screenshots of mail, chat, feed and "other" with an icon, plus one
     with a missing id (no broken image);
   - rerun `tests/accessories_fit.mjs` (all fit);
   - confirm 0 `/dev/dri` handles and no kernel ring timeouts.

6. **Reviews, PR, deploy and live check.**
   - The Opus review (a fresh agent given the plan path and the diff), then
     Codex and agy (the `second-opinion` skill). Fix their findings.
   - Open the PR linking all three artifacts and merge it.
   - Bump `nixi-companion` in a `nixos_config` worktree, build p620 and
     merge. Check the agent bus and post before `just deploy`, then restart
     Nixi.
   - Live: a real Gmail web-app notification and one chat notification show
     their icons (`grim`). The kernel log is clean.

## Tests

```sh
python3 -m unittest discover -s tests -q
node tests/accessories_fit.mjs <cdp-port> <url>   # in the GPU-free headless Chromium
```

## Rollback

`git revert -m 1 <merge sha>`. Without a revert, rows simply carry no
`icon`, and the page looks as before.
