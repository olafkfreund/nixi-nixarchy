---
status: approved
issue: 213
spec: spec/2026-11-07-213-you-character.md
coders:
  1: codex   # small, tricky validation where a gap lets private art load from the store or leak in an error
  2: coder   # server wiring across several known functions, plus tests
  3: coder   # page registry, node building and the clip, plus the synthetic fixture and fit test
  4: coder   # docs and one Settings line
  7: codex   # literal matching and an allowlist, where a gap lets a plugin fake an agent or machine state
  8: coder   # server and page wiring through #208's player, plus tests
reviewers:
  - codex    # read-only review of each slice's diff against this plan, looking for a way the likeness leaves the folder
  - agy      # a second, independent read of the same diffs
---

# Plan: the You character and plugin reactions

## Decisions carried over from the approved spec

- **Two slices, two PRs.** A: a plugin can add a character, and "You" stays private. B: a plugin can fire a
  reaction, after #208 merges.
- **Character manifest key** `character` in `plugin.json` (optional): `label` (at most 20 characters, `_bad`),
  `template` (only `"round"`), `fill` (one `#rrggbb`), `back` and `front` (SVG files inside the folder), `fits` (a
  subset of the template's), `private` (bool). An unknown key inside `character` rejects the plugin.
- **The `round` template** supplies every number a body needs, copied from the Devil: `ball`, `faceBox`,
  `anchors`, `cupX`, `band`, `pivot`, `shadow`. A plugin can't set any of them.
- **Art** runs through `sanitize_svg` with today's limits: 16 KB, 200 elements, depth 8, no gradients, `class`,
  `style`, text or images. Flat colours only. The ball takes the flat `fill`, not `url(#ballG)` or `miniNixi`'s body
  gradient.
- **The page** builds plugin art with `createElementNS`/`setAttribute` only, never `innerHTML`, inside a nested
  `<svg>` clipped to the body limits (x ±96, y −120…+100). On every reload it drops all `plug:` entries and adds the
  current ones. A label is shown through `esc()`. Frost, glint and `touch` stay built-in only.
- **Consent:** a data-only plugin starts on, as today; picking the character in Look is the consent. Settings shows
  "Adds a character (pick it in Look)".
- **"You" is private:**
  - its only home is the hand-written folder `~/.local/share/nixi-companion/plugins/you/` on p620 (the user chose
    p620 only), in no repo and not in the store;
  - with `"private": true` the loader refuses it from the package directory (the first of `plugin_dirs()`), by
    position, so a git checkout's `plugins/` is refused too; `check_dir` refuses `private` so a Nix build fails
    loudly;
  - it is refused if the folder or a file isn't owned by the user, or is group- or other-readable (mode & 0o077):
    "readable by other users: run chmod -R go= <folder>". Symlinks are refused already. ACLs aren't checked;
  - a private plugin's errors are fixed strings ("the character art was refused", "the folder is readable by other
    users"), never sanitiser text; the art is never logged, and the diagnostics report adds nothing;
  - every API answer gets `Cache-Control: no-store`;
  - the rule "never name a private folder in any Nix expression" goes in the plugin docs and in the Settings line
    for a private plugin;
  - CI tests a synthetic fixture only (a plain circle with two dots). Fit-checking "You" runs locally, against the
    live folder. No screenshot of "You" goes anywhere in a repo;
  - `~/.local/share` isn't backed up or synced (the user's answer), so the folder needs no exclusion today.
- **Reactions (slice B):** an optional `reactions` list in `plugin.json` with the same literal matching as
  `notifications` (`app`, `host` with `*.suffix`, no regex). Only app and host are read, never summary or body. The
  server sets `reaction` on the row in `Inbox.tick`, after dropping any `reaction` key from the shell's output.
  - Once per row key; the first matching plugin in scan order wins; at most one per plugin every 5 minutes,
    counted when sent.
  - It only adds: the row's category, text, bubble, envelope and sound stay. The page plays it after today's
    handling, through #208's gate (`rxOk`), so DND (when #209 lands), fullscreen, a meeting, the lock, reduced
    motion and the Reactions switch all apply.
  - **The allowlist** is the harmless reactions: a notification, music, video and news. #208 ships `notice` and
    `music`; `video` and `news` join the list when #209's media slice adds them. Agent, machine and calendar
    reactions are refused by the loader.
  - The prop follows the body's `fits`; a plugin character shows the shared prop with no touch.
- **The likeness itself** is never printed, described, committed or put in a PR, log or screenshot. The user's
  appearance stays out of every message.

## Changes from the spec, for approval

- **Slice B's reaction list is smaller at first.** The spec allows a notification, music, video and news. #208
  ships `notice` and `music` only; `video` and `news` (and Do Not Disturb) come with #209's media and quiet-gate
  slices. So slice B starts with `notice` and `music`, adds `video` and `news` when #209 has them, and its live
  check uses `notice` and leaves DND to #209. The alternative is to wait for #209 before slice B at all.

## Where the work happens

- Slice A: nixoarchy-snowflake, a new worktree `/mnt/code/Source-home/GitHub/nixi-213-code`, branch
  `feat/213-plugin-character`, from `origin/main` `3725751`. Line numbers below are from that commit (the spec cited
  `8f2275e`; they moved with #216 and #217).
- The private folder: `~/.local/share/nixi-companion/plugins/you/` on p620, written by hand in step 6, outside any
  repo.
- Slice B: a new branch `feat/213-plugin-reactions` from `origin/main` once #208 has merged; line numbers are taken
  again then.

## Steps

### Slice A

1. **`app/plugins.py`: the character kind and the private rules** (codex).
   - `OPTIONAL` (`plugins.py:27`) gains `"character"`; `_check` (`103`) validates it as decided, using `_bad` (`89`)
     for the label and `_inside` (`60`) for the art paths.
   - In `scan` (`252`): a `private` plugin found in `plugin_dirs()[0]` (`57`) is refused with "a private character
     can't come from the Nix store"; a `private` folder or file not owned by `os.getuid()`, or with mode & 0o077, is
     refused with the fixed chmod line.
   - `check_dir` (`945`) refuses `private`.
   - For a private plugin, every error kept for it is one of the fixed strings; sanitiser reasons (`446`, `466`,
     `478`) are never stored.
   - Errors raised before the manifest is read can't know `private`, so for a folder plugin
     (`plugin_dirs()[1]`) they never carry a name or message either: `scan` (`263-272`) says "contains a
     symlink" (not `_symlink(d)`'s path) and "plugin.json unreadable" (not the exception text). Nix plugins keep
     today's detail. Settings shows these through `plugins_api` (`server.py:1905-1909`).
   - Tests in `tests/test_plugins.py`: a valid manifest passes; a bad `template`, `fits` outside the template, a bad
     `fill`, a missing art file, art with a gradient or `class`, an unknown key, and art with `<script>`, `onload`,
     `href` or `url()` each reject it; `private` from the package directory, with a group-readable file, and with a
     file owned by someone else (simulate `st_uid` with a mock) are refused; `check_dir` fails on `private`; a
     private plugin's errors are fixed strings; a folder plugin with a symlink named with a marker string, and one
     with an unreadable manifest, show no marker through `plugins_api`.
   → verify: `cd tests && python -m unittest test_plugins test_plugin_sandbox`, and the Nix build of a synthetic
   private plugin fails: `nix build --impure --expr` over `mkCompanionPlugin` with a temp folder whose manifest has
   `"private": true` (local only, not in CI; nothing of "You" is used).
   Traps: fail closed on any `stat` error; never put file content or a tag name in a private plugin's error.

2. **`app/server.py`: load, accept and send it** (coder).
   - `Plug.reload` (`server.py:1794-1816`) sanitises `back` and `front` into `Plug.characters`, as it does props;
     a refused file drops the character and records its reason in `prop_errors` (fixed strings for a private one).
     Add `Plug.has_character(id)`.
   - `look()` (`287-300`): `character` also accepts `plug:<id>` when `Plug.has_character(id)`. `CHARACTERS`
     (`283`) stays the built-in tuple.
   - `voice_settings` (`6066-6070`) and the state filter (`6188`) accept a loaded `plug:` ID in
     `voice_by_character`.
   - `state_info` (`6170`) sends `plugin_characters` next to `plugin_props`.
   - `plugin_caps` (`1868`) adds "Adds a character (pick it in Look)".
   - `_json` (`6216-6222`) sends `Cache-Control: no-store`. That covers every JSON answer, which is where
     `state_info` and the art travel. Binary routes keep their own headers (`/api/icon/` keeps `max-age=86400`,
     `6247-6252`); none carries character art.
   - Tests: `tests/test_look_character.py` (accepts a loaded `plug:` character, falls back to snowflake when the
     plugin is off, deleted or its art breaks); `tests/test_character_voice.py` (a loaded `plug:` ID is accepted, an
     unknown one refused); a new `tests/test_plugin_character.py` for `no-store` on `/api/state` and two other JSON
     routes, and the no-log test: a valid private fixture and a malformed one whose tag and attribute names carry a marker string, after a
     reload, leave neither the `d` values nor the marker in `server.log`, Settings or `diagnostics()` (`6002`).
   → verify: `cd tests && python -m unittest test_look_character test_character_voice test_plugin_character`.
   Traps: import `server` only under `tests/nixi_env.py`'s throwaway HOME (#176); the fixture lives in the test's
   temp HOME, never in the repo's `plugins/`.

3. **`app/static/index.html`: draw it** (coder).
   - Merge `plugin_characters` into `CHARACTERS` (`index.html:1282`) as `plug:<id>`, with the Devil's numbers and
     `nodes` in place of the `back`/`front` strings. On every state update drop all `plug:` keys first.
   - `setCharacter` (`1307`) and `miniNixi` (`1253`): for a plugin character, build nodes with `createElementNS` and
     `setAttribute`, as `drawProp` (`1220-1224`) does, inside a nested `<svg>` clipped to the body limits; the ball
     gets the flat `fill`.
   - The Look grid (`3547`) shows a plugin label through `esc()` (`1045`).
   - Frost, glint and `touch` stay built-in only.
   - A synthetic fixture for the page tests: a plain circle with two dots, served by the test server only.
   - Tests: `tests/character_fit.mjs`'s registry check (`103`) requires `back` and `front` strings; for a `plug:`
     entry it checks `nodes` instead, and every built-in check stays as it is. Then `char plug:fixture` (the face
     box, the surface, the bar state, as #178's cases); in a page test, a label `<b>x</b>` shows as text, art drawn outside the limits is clipped, and after a
     reload without the plugin no `plug:` entry is left in `CHARACTERS` or the grid.
   → verify: `cd tests && python -m unittest test_character_fit test_accessories_fit` and the new page test.
   Traps: headless Chromium with `--disable-gpu` only; never `innerHTML` for plugin art; Snowflake's pixels stay
   unchanged (`test_character_fit` on the built-ins).

4. **Docs and the Settings line** (coder). The plugin section of `docs/GUIDE.md` documents the `character` key and
   the private rules, with the rule in bold: never name a private folder in any Nix expression. In Settings, a
   private plugin's row shows "Private: keep this folder out of Nix and out of any repo."
   → verify: `cd tests && python -m unittest test_docs_names` (names and links), plus one new assertion in it that
   `docs/GUIDE.md` contains the sentence "never name a private folder in any Nix expression".
   Traps: no example in the docs looks like a real person; the fixture is the circle with two dots.

5. **Review and PR, slice A** (me). Full suite from `tests/`. A fresh Opus reviewer on this plan and the diff, then
   Codex and agy, read-only. One PR linking the #206 intent, this spec and this plan, with `@codex review`, saying
   which coder did each step. Merge after review, bump `nixi-companion` in `nixos_config`, CI, merge, post on the
   agent bus, switch p620 from the clean worktree, restart Nixi with the live Hyprland signature.

6. **"You", by hand on p620** (me, outside any repo).
   - Write `~/.local/share/nixi-companion/plugins/you/` with `plugin.json` (`private: true`, `fits` as decided:
     no head props, no headphones, no `plug`) and flat-colour `back.svg`/`front.svg`, redrawn from the mockup's
     idea with no gradient or class.
   - `chmod -R go= ~/.local/share/nixi-companion/plugins/you`.
   - Check locally, never in CI: `node tests/character_fit.mjs <port> <url> char plug:you`; then `git status` in
     every repo shows nothing of it.
   - With the user: "You" shows in Look, wears the scarf but no hat, blinks and talks, and its voice can be set.
   Traps: the art and its description never appear in a message, a log, a commit or a screenshot.

### Slice B (after #208 merges)

7. **`app/plugins.py`: the `reactions` key** (codex). `OPTIONAL` gains `"reactions"`; `_check` validates it like
   `notifications` (`plugins.py:131-141`): a list of `{app|host, reaction}`, literal and `*.suffix` only, and
   `reaction` on the allowlist (`notice`, `music`; `video` and `news` once #209 adds them). Anything else rejects
   the plugin. Settings shows "Reacts to notifications from some apps or sites".
   → verify: `cd tests && python -m unittest test_plugins test_plugin_maps`.
   Traps: the allowlist is a constant next to the check, not read from the page.

8. **Server and page** (coder). `Inbox.rows` (`server.py:2240`) drops any `reaction` key from the shell's output;
   `Inbox.tick` (`2265`) sets `reaction` from the first matching plugin, once per row key, at most one per plugin
   every 5 minutes, counted when sent. The page plays it after today's handling through #208's `rxPlay`/`rxOk`.
   A row that carries `reaction` plays that reaction **instead of** #208's `notice` for an `other` row, never both:
   #208's gate plays one at a time and drops what can't play, so `notice` first would swallow it.
   Tests: literal app and host and `*.suffix` match; a reaction outside the allowlist is refused; a shell
   `reaction` key is dropped; the same row key twice reacts once; two matching plugins give one; the 5-minute
   limit; the row's category and text unchanged; an `other` row mapped to `music` plays `music`, not `notice`;
   #215's message pinning tests pass unchanged; in `react_fit`, a
   plugin reaction doesn't play under fullscreen, a meeting, the lock or reduced motion.
   → verify: `cd tests && python -m unittest test_plugin_maps test_react_fit test_notify_fit`.
   Traps: only app and host are read; never the summary or body.

9. **Review, PR, deploy, check, slice B** (me). As step 5. Then, with the user on p620, a test plugin mapping
   `notify-send -a nixi-test` to `notice` (the spec's `news` once #209 adds it) plays once, not again within 5 minutes, and not while fullscreen or
   locked; a message and an email still show exactly as before.

## Tests

```bash
cd /mnt/code/Source-home/GitHub/nixi-213-code/tests && python -m unittest discover -p 'test_*.py'
```

All pass. The browser fit tests are slow; run them one at a time when the machine is busy. `test_character_fit`'s
idle check can be flaky under load; rerun it alone before treating it as a failure.

## Rollback

Revert the slice's PR and bump back. The private folder is removed by hand (`rm -r
~/.local/share/nixi-companion/plugins/you`). An older companion rejects a plugin with an unknown top-level key
(`plugins.py:114-115`), so after a rollback "You" and any reaction map simply don't load.

## Decided by the user (2026-11-07)

- Slice B starts with `notice` and `music`; `video` and `news` are added when #209 provides them (the recommendation). This changes the spec's first list, as the plan states.

## Deviations (slice A, while implementing)

- **Step 3** was done by Claude, not the coder: the coder made no edits. The page test sets
  `info.plugin_characters=[]` in the page to model a reload without the plugin (the server path is covered by
  `test_look_character`). `character_fit`'s Look-row check now counts every entry in `CHARACTERS`, not a fixed 4, and
  the `.accent` check skips `plug:` entries (plugin art cannot carry `class`).
- **Review fixes** (Codex gpt-6-sol, a fresh Opus reviewer; agy found nothing above low):
  - the nested svg sets `overflow:hidden` inline: `.skins button svg{overflow:visible}` had un-clipped plugin art in
    the Look grid (plugin props in the Skin grid are clipped too now);
  - in random-colour mode a changed plugin character is redrawn;
  - a private plugin's prop error is `PRIVATE_ART_ERROR`;
  - saving voices keeps a switched-off plugin's `plug:` entry;
  - a duplicate id says "duplicate id" for every plugin (it names nothing), instead of the private art error;
  - `docs/GUIDE.md` says the art's `viewBox` is fitted to the body box `-96 -120 192 220`.

## Deviations (slice B, while implementing)

- **Step 8:** only the first matching plugin counts; if it is inside its 5-minute window the row gets no reaction
  (no fall-through to a second plugin). Under reduced motion a plugin reaction shows its still prop with no
  animation, as #208's reactions do, rather than nothing. The coder's first meeting and lock cases passed without
  reaching the gate; Claude fixed them and added a control row that must play.
