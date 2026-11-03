---
status: approved
issue: 145
intent: intent/2026-11-03-145-control-indicator.md
---

# Spec: Nixi shows who controls the desktop, and gives control back

Code: `nixoarchy-snowflake` (`app/server.py`, `app/quick.py`,
`app/static/index.html`), from `main`. ai-mirror itself isn't changed. The
intent's open questions were approved as suggested:

- take control back from the mark, or from a menu item while it applies;
  no new Settings switch;
- no allow or deny from Nixi;
- the "looking" face only while `watching` is under 10 s old.

## What's there today (checked, ai-mirror 3.1.0)

- **`$XDG_RUNTIME_DIR/ai-mirror/state.json`:**
  - `owner` (`off`, `pending` or `agent`), `generation`, `since`, and
    `enabled_by`;
  - while pending, a `request` with `expires` (epoch seconds) and the
    requesting server;
  - while held, `held_by` (`pid` and `start`);
  - `instance`, the Hyprland it was granted under.
  - The folder is mode 0700 and the file 0600 (`control.py:55-71`).
- **`watching`:** a Unix timestamp of ai-mirror's last read of the screen.
  That includes reads that need no grant.
- **`read_state()`** (`control.py:281-296`):
  - turns an expired `pending` into `off` (`_lapsed`, `:233`);
  - revokes a grant whose Hyprland instance is no longer running
    (`_revoke_if_restarted`, `:263`).
  - The file on disk only shows these after something calls it.
- **`ai-mirror status`** prints the state *after* `read_state()`, as one
  JSON object (`owner`, `generation`, `since`, `enabled_by`, `monitors`, …),
  in about 0.1 s.
- **`ai-mirror control off`** revokes, bumps the generation, releases held
  keys, and exits non-zero on failure (`control.py:393-400`,
  `cli.py:160`).
- **The companion** has no ai-mirror code. Moods exist for `looking`,
  `curious`, `t_unsure`, `scared` and `happy`. There's an `agentMark` group,
  used for agent attention.

## Design

### 1. Watching the state (server, a new `Mirror` class)

- **A daemon thread** wakes every 1 s while he's shown, and every 5 s while
  he's hidden.
- **Installed** means `shutil.which("ai-mirror")` finds it (checked every
  60 s) **and** `state.json` exists. Otherwise the state is `None` and
  nothing shows; a file left behind without the CLI counts as not
  installed.
- **Each tick:** `os.stat(state.json)` (no subprocess) and a read of
  `watching` (one small file).
- **`ai-mirror status`** (argv fixed, 3 s timeout) runs only:
  - when `state.json`'s mtime or size changed;
  - when `owner` is `pending` and `now > request.expires`, so its own
    `read_state()` lapses it;
  - every 30 s while `owner` isn't `off`, so a grant from a dead Hyprland
    gets revoked by ai-mirror itself.
  - Its JSON is the truth Nixi shows. Nixi never decides a grant is stale
    by itself, so a live grant is never hidden.
- **Published state:** `{owner: off|pending|agent|None, watching: bool}`,
  where `watching` means the timestamp is under 10 s old.
  - It goes out as an SSE event `t:"mirror"` when it changes, and in
    `/api/state` as `mirror`.
- **Same user only:** the paths come from the server's own
  `XDG_RUNTIME_DIR`. If that's unset, the state is `None`.

### 2. Taking control back (server)

- **`POST /api/mirror/off`,** with the usual token:
  1. run `["ai-mirror", "control", "off"]` (10 s timeout);
  2. then `ai-mirror status`.
  - **Success** is exit 0 and `owner == "off"`. It returns `{ok: true}`
    and publishes `mirror`.
  - **Otherwise** it returns `{ok: false, error}` with the last stderr line
    (200 characters at most).
- **The argv is a module constant.** The only other ai-mirror subcommand
  ever run is `status`. A test asserts no other argv can be built: no
  `agent`, `confirm` or `deny`.
- **Never gated by trust** (Guide, Mechanic or YOLO). Revoking is always
  allowed.
- **Voice** (`quick.py`): "take control back", "stop the agent", "revoke
  control" and "give me my desktop back" map to
  `{"mirror": "off", "mood": "happy", "sfx": "ok"}`. The server runs §2
  and speaks:
  - "Control is back with you." on success;
  - "I couldn't take it back — press Super, Shift and Escape." on failure;
  - "No agent is controlling the mouse and keyboard through ai-mirror."
    when it was already `off`.

### 3. What he shows (page)

- **`pending`** (a request is waiting):
  - an amber mark with a pulsing ring by his upper-right tip, made from
    the existing `agentMark` shapes in amber;
  - `curious`, once, when it starts;
  - caption: "An agent is asking to control your desktop — answer in
    ai-mirror's dialog."
- **`agent`** (control is held):
  - a red mark, a ring with a small pointer glyph, on the same tip; steady,
    with a slow 2 s pulse of its ring's opacity;
  - his resting mood is `t_unsure` (worried brows) while it holds, and
    `scared` once when it starts;
  - the mark is **clickable**: it runs §2, and is added to the click-through
    region like the chip;
  - a menu item "take control back" appears in the menu while
    `agent` or `pending` holds.
- **`watching` only** (`owner` is `off` and `watching` is fresh): a small
  eye glyph on the tip and the `looking` mood. With voice on, he says
  nothing.
- **On success:**
  - the mark fades over 0.4 s;
  - `happy`, and the caption "Control is back with you." (spoken if voice is
    on).
- **On failure:** an error caption: "Couldn't take control back — press
  Super+Shift+Esc." The red mark stays.
- **Precedence:** when an agent-attention mark (`AM`) is showing, the
  ai-mirror mark wins the tip while `agent` or `pending` holds. Control is
  the more important of the two.
- **Hidden** in the notch, hover and calm modes, like the other marks. In
  the notch, while `agent` holds, the notch's edge glows red instead (a
  flat stroke colour).
- **Wording:** no message claims the desktop is "safe". The `off` wording
  is "not through ai-mirror". Settings → About gets one line: "Shows when an
  agent controls your desktop through ai-mirror. Super+Shift+Esc always
  takes it back."

### 4. GPU safety and cost

- **Flat SVG only:** strokes and fills, with opacity and transform
  animation, written only while a mark shows.
- **The thread** costs one `stat` and one small read per second, and runs
  the CLI only on a change, an expiry, or the 30 s check while held.

## Alternatives rejected

- **Importing `ai_mirror.control` and calling `read_state()`.** That
  couples Nixi to ai-mirror's internals and Python version, and
  `read_state()` writes. The CLI is its public contract.
- **Running `ai-mirror status` every tick.** A subprocess every second, for
  a state that rarely changes.
- **Deciding staleness from `since`/`generation`.** They aren't heartbeats,
  and it could hide a live grant.
- **Allow and deny buttons in Nixi.** The companion could then grant
  control. Ruled out by the intent.

## Risks

- **ai-mirror changes its state format or CLI:** unknown values are shown
  as nothing (`None`), never as a false red mark. A test pins the fields
  used.
- **`watching` updates on ungated reads too,** so it's labelled "read your
  screen recently", not "is watching".
- **Hosts:** p620 (ai-mirror installed); razer only if it's installed.

## Verification

- **Server unit tests** (`tests/test_mirror.py`), with a fake `ai-mirror`
  script on `PATH` that prints canned JSON and records its argv, and a
  temporary `XDG_RUNTIME_DIR`:
  - no CLI → `None`; a file without the CLI → `None`; no `XDG_RUNTIME_DIR`
    → `None`;
  - `status` runs on an mtime change, on an expired `pending`, and every
    30 s while held — not every tick;
  - `watching` is fresh under 10 s and stale after;
  - `POST /api/mirror/off`: the argv is exactly
    `["ai-mirror", "control", "off"]`; success needs exit 0 *and* `off`;
    a failure returns the stderr line;
  - no code path builds `agent`, `confirm` or `deny`;
  - the voice phrases map to `mirror: off`; the three spoken replies.
- **A page test** (GPU-off headless; `tests/mirror_fit.mjs` and its
  wrapper):
  - the marks for `pending`, `agent` and `watching` sit inside the window;
  - clicking the red mark posts `/api/mirror/off`;
  - the menu item appears only while it applies;
  - the marks are hidden in bar mode.
- **Previews** of the three looks, then `journalctl -k`.
- **Live on p620** (needs the user):
  1. an agent asks for control (`ai-mirror control agent` from a terminal);
     the amber mark appears, and you approve the dialog;
  2. the red mark and worried face appear;
  3. click the mark: the dialog-free revoke, the confirmation, and
     `ai-mirror status` shows `off`;
  4. say "take control back" in a second round;
  5. `journalctl -k` is clean.

## Open questions

None. The intent's three were approved as suggested.

## Fixes after the Codex and agy review

These override the design above where they differ. All were checked
against ai-mirror 3.1.0 (`control.py`, `cli.py`, `api.py`) and the
companion code.

1. **Errors go to stdout** (both). ai-mirror prints `{"error": {...}}` to
   **stdout** and exits 1 (`cli.py:177-181`).
   - **The revoke** parses `control off`'s own stdout: success is exit 0
     and JSON `owner == "off"`. There's no second `status` call.
   - **On failure,** the message comes from `error.message`, with the
     last stderr line as a fallback.
   - **The fake CLI in the tests** reproduces both.
2. **`status` can fail after it has already revoked** (agy). It calls
   `read_state()` (which may write `off`), then `host.monitors()`, which
   fails when Hyprland is unreachable. When `status` fails or times out:
   - read `state.json` directly and apply the expiry rule;
   - an `agent` read straight from the file stays `agent`, so a live grant
     is never hidden (Codex);
   - only an unreadable file *and* a failed `status` keep the last
     confirmed state.
3. **SSE reconnects** (both). The server emits `mirror` on every new
   `/api/events` subscription, next to `hello` and `situation`
   (`server.py:5124-5128`).
4. **Never hidden while control is held** (both):
   - **Hover:** the red ring is drawn around him instead of on a tip;
     there are no tips to use there.
   - **Calm** (a panel or Settings is open): a red bar across the top of
     the open panel: "An agent controls your desktop", with a "Take control
     back" button.
   - **Notch:** a red CSS `box-shadow` or border on `#barPill` (an HTML
     element), not an SVG filter.
   - **Peek and doze:** `idleActive()` counts `pending` and `agent` as
     active, and entering either calls `restore('mirror')`, so he wakes,
     full size and visible (agy).
5. **The mood** (agy): `t_unsure` counts as talking (`isTalk`), so it
   isn't used.
   - A new non-talking mood, `worried` (raised inner brows, tighter lids),
     is added to `MOODS`.
   - While `agent` holds, it replaces both the idle and the `sleepy`
     moods.
6. **"Installed"** is the CLI on `PATH` (agy). `state.json` may not exist
   before the first request, and a missing file reads as `off`. `watching`
   works without it.
7. **Change detection** uses `(st_mtime_ns, st_size, st_ino)`, because
   ai-mirror writes with `os.replace` (agy).
8. **Voice** (agy): `quick.handle` returns `{"mirror": "off"}` only. The
   `/api/quick` handler runs the revoke and then sets `say`, `mood` and
   `sfx` from the **result**: `happy`/`ok`, or `sorry`/`error` on failure.
   - While a turn is `busy`, the phrase still works in one breath ("hey
     Nixi, take control back"), as other quick commands do. The mark and
     the menu item always work.
9. **Settings text** goes in the **More** tab, outside `.nx` (which is
   hidden in bridged mode). There's no About tab.
10. **The tip** (agy): `#cue` and `#agentMark` share the upper-right tip.
    - While a mirror mark shows, `renderCue()` and `agentMark()` yield.
    - When the mirror returns to `off`, a still-valid `AM` re-renders.
    - The menu's extra item is added by filtering the menu list and
      recomputing its positions in `layoutMenu()`.
11. **`held_by` can be `null`** for a grant made from the CLI. It isn't used
    for anything.
12. **Tests added** (both):
    - the token is rejected without the header;
    - revoke works at all three trust levels;
    - a failure on stdout, and `status` failing after a revoke;
    - `watching` with no `state.json`;
    - a mirror event on SSE subscribe;
    - `/api/quick` mood and sfx on failure;
    - `idleActive` during `agent`;
    - the `worried` mood, and no `sleepy` while held;
    - the hover ring, the calm bar and the notch signal;
    - tip precedence with `AM` and `#cue`;
    - the success fade, and the mark staying after a failure.

### Review

Both reviews were obtained (Codex and agy). Every finding above was
confirmed.
