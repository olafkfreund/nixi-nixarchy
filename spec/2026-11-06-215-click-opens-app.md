---
status: draft
issue: 215
intent: intent/2026-11-06-206-character-friends.md
---

# Spec: clicking a message or email opens its app

All code is in `olafkfreund/nixoarchy-snowflake`. Line numbers are from `9aff36f`, so re-find them by name. The
shell code is Omarchy's, at `share/omarchy/shell/plugins/notifications/Service.qml` in `omarchy-edge-20261104-cc99764`,
and this slice doesn't change it.

## What happens today

1. The caption row (`plate`) and the envelope (`#mailPop`) post `/api/notify/act` with the row's key and `how: "open"`.
2. The server calls the shell's `activateKey` over its socket (`server.py:6111`).
3. The shell's `activate()` tries, in order: a command on the row; the sender's own `default` action; the sender's
   window, by pid or source; `https://<host>/` if the source is a web address; a link on the row; and last
   `omarchy-hyprland-focus-app <app>`.

That order is good, so it stays. Three gaps remain:

- **The chat bubble can't be clicked.** `#guy` has `pointer-events:none`, and `sendRegion` adds only the row and the
  envelope for a notification.
- **A closed app doesn't start.** `omarchy-hyprland-focus-app` only focuses a window, and exits 1 if there's none.
- **Nixi can't tell.** `activateKey` returns `ok` as long as the key is live, whatever happened after it.

## Design

### 1. Pin today's behaviour first

The approved intent requires this before any change to the message path. Page tests that pass on unchanged code,
in a new `tests/notify_fit.mjs` with `tests/test_notify_fit.py`, on a throwaway server and headless Chromium with the
GPU off, driving `notifyIn` with fake rows:

- `notifyText` for mail, chat, the job row, a burst, and a row with no details;
- a chat row shows the bubble, its app icon and the caption row; a second chat shows ×2;
- three in 3 seconds become one counted row, and an update with the same key changes the text in place;
- the queue holds 8 waiting rows beyond the one on screen, so a ninth waiting row is dropped, and a row older than
  4 seconds is dropped;
- a mail row runs the envelope's classes in `mailPop`'s order and timing;
- sound and speech follow `notify_sound` and `notify_speak`, and stay silent in a meeting;
- clicking the row or the envelope posts `how: "open"`, and Esc posts `how: "dismiss"`.

`tests/test_inbox.py` already covers the hand-back after 5 seconds, the privacy checks and sorting, and stays as it is.

### 2. The bubble opens the app too

Clicking the bubble does exactly what clicking the caption row does: `notifyAct('open')`, for the row on screen. It
uses the page's existing pattern for clickable marks, as `AMX.mk` does:

```js
SIT_P.chat.g.style.cursor='pointer';
SIT_P.chat.g.addEventListener('click',e=>{ e.stopPropagation(); notifyAct('open'); });
```

- The draw code sets the group's `pointer-events` attribute to `all` only while the bubble shows, and `none` otherwise.
- `sendRegion` adds the group while the bubble shows, so the native window lets the click through.
- With ×3, it opens the message the row is showing. The bubble tracks no key of its own, so nothing already queued
  can be opened and then shown again.
- The art, timing and ×N don't change.

### 3. The server finishes the job for mail and chat from a native app

`/api/notify/act` with `how: "open"` still calls `activateKey`, and still answers straight away. Around that call:

```python
origin = Inbox.origin.pop(key, None)           # (app, source), set only for rows worth following up
before = _active_window() if origin else None  # read before the shell acts
ok = Inbox.call("activateKey", key) == "ok"
if ok and origin and before:
    threading.Thread(target=Inbox.follow_up, args=(*origin, before), daemon=True).start()
```

```python
@classmethod
def follow_up(cls, app, source, before):
    """The shell has acted. Bring up this app's window, or start it if it has none."""
    time.sleep(1.5)                            # the sender's own action or the shell's focus lands first
    now = _active_window()
    if now is None or now != before:           # something took focus, or we can't tell: leave it alone
        return
    entry = Icons.desktop_for(app, source)
    if entry is None:                          # no such app, or more than one claims the name
        BUS.pub(t="toast", text=f"I couldn't find {app or source} on this machine.")
        return
    win = _window_for(entry, app, source)
    if win is None:
        _launch(entry["id"])
    elif win != now:
        _focus(win)                            # open, but behind others: the sender's action couldn't raise it
```

- **`Inbox.origin`** is a dict of key to `(app, source, when)`, filled in `tick` when a row goes to the page. It holds
  only rows with category `mail` or `chat` whose app isn't in `Icons.BROWSERS` and whose source isn't a web address. A
  browser's row is fully handled by the shell, which goes to the tab or opens `https://<host>/`, so a web app can't
  be started on top of the right tab. It holds no text, is capped at 64, and entries go after 10 minutes. The page
  sends only the key, so the page can't name what gets started. So `nixi-job` and `notify-send` rows behave as today,
  with no toast.
- **`_active_window()`** is the address from `hyprctl activewindow -j`. Without Hyprland or `hyprctl` it returns
  `None`, and nothing is started: today's behaviour.
- **`Icons.desktop_for(app, source)`.** `Icons._build` gains a second map, with these rules:
  - It keeps the file's real id, because `fid` is lowercased for lookups and `gtk-launch` is case-sensitive.
  - It includes only `Type=Application`, and skips `Hidden=true`, `NoDisplay=true`, and any id starting with `-`.
  - Its keys are the lowercased id, `StartupWMClass` and full `Name`, not the shortened name or a host part, so
    a matching order can't reach `s.split(".")[-2]`.
  - A key claimed by two different files maps to nothing, so a collision never picks one.
  - Lookup is exact: `app`, then `source`.
- **`_window_for`** compares `hyprctl clients -j` `class` and `initialClass`, lowercased and exactly, with the entry's
  id and `StartupWMClass`, and with `app` and `source`, since many apps' classes match neither the file nor its
  `StartupWMClass`. It returns the most recently focused match, using no regular expression, because the names come
  from notifications.
- **`_focus`** uses the same two forms as `omarchy-hyprland-focus-app`: `hl.dsp.focus` and then `focuswindow address:`.
- **`_launch`** runs `["gtk-launch", id]` through `quick._spawn`, as a list and never through a shell.

`quick._find_app` isn't reused, for two reasons. It matches loosely, so a notification from "code" could start the
wrong app. It also reads only `~/.local/share`, `/usr/share` and Flatpak's folders, which misses NixOS's own apps in
`XDG_DATA_DIRS`. That looks like a separate bug in "open <app>" by voice. It's noted here and not fixed in this slice.

### 4. Nothing else changes

Dismiss, `/api/notify/seen`, the 5-second hand-back, sorting, privacy, sound, speech and the envelope stay. If the
app is already open, the shell's existing focus does the job and `follow_up` does nothing.

## Alternatives rejected

- **Changing the shell to start the app.** It's upstream Omarchy code, and the fix would wait on another project.
- **Starting the app before asking the shell.** It would skip the sender's own action, which is the only thing that
  opens the right conversation.
- **Sending the app name from the page.** A page-supplied name would let any script holding the token start apps.
- **Using `xdg-open` or the row's `Exec` line.** Both trust more of the notification than a click should.
- **Keeping the row on screen longer, so it's easier to click.** It changes today's display, which the user ruled out.
- **Preferring an installed web app over the shell opening `https://<host>/`.** When a browser sends the notification,
  its own action goes to the right tab, which is better than a blank web app. Revisit only if the user finds a case.
- **Hit testing the bubble inside the body's click handler.** The bubble isn't what `#body`'s pointer rule covers, and
  the page already has a pattern for clickable marks.
- **Tracking the newest message's key on the bubble.** That key may still be queued, so opening it would show it
  again later. Following the row on screen avoids that.

## Risks

- **A second copy of an app.** A slow app whose window class matches none of its id, `StartupWMClass`, app name or
  source may be started again. It takes all of these: one click, 1.5 seconds with no focus change, and no matching
  window. Most desktop apps hand a second launch to the first. Accepted, and checked by hand.
- **Slow apps and the toast.** If an app's own action takes over 1.5 seconds, `follow_up` may find its window closed
  and launch it, which most apps hand to the running copy.
- **A false "couldn't find".** A native mail or chat app with no matching `.desktop` file that took no focus gets
  the toast, even if it did something quietly. The toast is harmless, and says only the sender's name.
- **A spoofed sender.** The shell's handed-over rows carry names, not a verified sender, so any local program can send a
  notification naming an installed app. A click then starts or raises that app with no arguments. This needs the user's
  click, can start only installed, visible apps, and passes nothing from the notification. Accepted. Exact matching
  stops wrong matches, not spoofing.
- **Clicking the bubble.** It's small, and sways. A near miss does what a click near him does today.
- **`sendRegion` on a moving bubble.** The region uses a 16-pixel grid and is sent when something opens or closes, so
  it adds no constant repainting.
- **Other compositors.** Without Hyprland nothing starts, so nothing gets worse.
- **Row text.** `origin` holds only the app and source, as `Icons.cache` already does. Neither is logged, and neither
  goes to an agent.

## Verification

- The pinned tests from section 1 pass on `9aff36f` before any other change, and unchanged after.
- New cases in `tests/test_inbox.py` for the route and `follow_up`, with the shell faked and `hyprctl` and
  `_spawn` mocked: focus changed starts nothing; no change with a closed app starts it, exactly once; a window already
  active does nothing; an open window behind others is focused and not started; a class matching only the app name
  counts as open; no match gives the toast; no Hyprland starts nothing; an unknown key does nothing; a browser's
  row, a `nixi-job` row and a `notify-send` row never follow up; and `origin` holds no text, is capped, and expires.
- `tests/test_icons.py`: `desktop_for` keeps a mixed-case id such as `org.foo.Bar`; matches exactly; skips `Hidden`,
  `NoDisplay` and non-applications; returns nothing on a collision; and "code" doesn't match "Visual Studio Code".
  Existing icon behaviour is unchanged.
- A real `gtk-launch` run isn't in these tests, because `_spawn` is mocked, so the by-hand check below covers it.
- `notify_fit.mjs`: a real click at the bubble's position through CDP `Input.dispatchMouseEvent`, not a synthetic event,
  posts the on-screen row's key and leaves his own click handler unrun; a click on him elsewhere does what it does
  today; once the bubble has gone, its spot doesn't take clicks.
- On p620, from the user, by hand, in the real native window, so the click region is tested too: clicking the moving
  bubble, the row and the envelope, with a native chat app open and behind others, then closed; a closed mail app; and
  a browser message, which must open its tab and start nothing else.

## Reviews (2026-11-06)

Their findings don't approve anything. Codex reported `gpt-6-sol`. agy's JSON reports no model. Each finding was checked
against the code.

**Confirmed and applied:**

- Both: an unchanged active window doesn't mean nothing opened. A browser row could start a web app on top of the right
  tab, so browser rows no longer follow up.
- Codex: the names don't prove who sent it, so the spoofing risk is now stated plainly.
- Codex: `setdefault` makes the first file win on a shared name. A collision now maps to nothing.
- Codex: `follow_up`'s call and signature disagreed. The route is now spelled out.
- Codex: a headless test can't prove the native click region, so the by-hand check covers it.
- agy: `#guy` has `pointer-events:none`, so the body handler would never see a click on the bubble. It now has its own
  listener, like `AMX.mk`.
- agy: `Icons._build` lowercases `fid`, and `gtk-launch` would fail on mixed-case ids.
- agy: `_find`'s `s.split(".")[-2]` could start an app from a website's name. It isn't used now.
- agy: an open window behind others stayed hidden. It's now focused.
- agy: a bubble tracking the newest key could open a queued row and show it again.
- agy: every other row would have got a false toast, so only mail and chat follow up.
- agy: only `Type=Application`. The queue description was wrong by one.

**Refuted:** agy's quoted body handler (`S.state`, `startRec('auto')`) isn't the code at `index.html:4001`, so that quote
is invented, although its point about pointer events holds. Also refuted: a `--` for `gtk-launch`, because skipping ids
starting with `-` is enough.

**Not taken:** Codex's direction that the shell should report what it did. It would be more exact, but that's upstream
code. It's the better long-term fix if Omarchy adds it.

**Not verified:** `gtk-launch` in the service's environment on p620 and razer; real window classes and `.desktop` names
of the user's apps; and how the native window applies the click region. No code has been written or run.

## Rollback

Revert the PR. `origin` is memory only, and no setting or file is added.
