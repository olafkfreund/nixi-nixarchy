---
status: approved
issue: 220
spec: spec/2026-11-07-220-notification-history.md
coders:
  1: coder   # a new Nix check with a Node loader, written test-first; moderate, and it needs the repo's check wiring
  2: codex   # small, tricky logic: the 904 patch must apply on 902+903 at --fuzz=0 and keep redacted rows intact
  3: coder   # three small edits in one pattern (backup list, options "never" list, restore fixture)
  4: coder   # NixOS VM test script: quiet-mode ordering, seeded first start, journal check
  5: agy     # prose only: one manual section and the release-note text, with no logic and no build
reviewers:
  - codex    # found the redacted-row bug and the session-test ordering problem in the spec
  - agy      # reviewed the spec's risks; its no-shell rule means it gets files, not a repo
---

# Plan: Keep the text of only the newest 6 notifications in the shell's history

This is everything needed to implement #220 in `olafkfreund/nixarchy` without opening the intent or the spec. Nixi (this
repo) gets no code change.

## Approval (2026-11-07)

The user approved this plan at 67d108a ("approved") with the recommendations: the coders as listed (steps 1, 3 and 4
coder; step 2 codex; step 5 agy), edge dispatched with `gh workflow run omarchy-edge.yml` after a bus post, and
razer deployed after p620.

## Decisions carried over from the approved spec

- **Text window.** Only the 6 newest `history.json` rows keep their text and exec fields: `summary`, `body`, `rawBody`,
  `execArgv` and `execActions`.
  - Older rows keep only who sent them and when: `key`, `originalId`, `senderPid`, `glyph`, `app`, `appIcon`,
    `source`, `groupKey`, `urgency`, `expireTimeout`, `duration`, `ts`, `closed_ts` and `closed_reason`.
  - A redacted row (`summary` "Verification notification", `body` "[redacted]") is left exactly as it is.
- **One rule for every writer.** The cut lives in `Store.js`'s `retain()`, which every path to history goes through:
  - a closed card;
  - quiet mode;
  - 903's `delegated` rows;
  - loading at shell start;
  - the replay.
- **One number.** The replay key's `replayCount` reads `Store.HISTORY_TEXT_ROWS`, so the replay always shows exactly
  the rows that have text.
- **`live.json`.** `parseLive()` drops rows whose `ts` is more than 24 hours old when the shell loads it. Critical
  cards are included: their sender re-sends them if they still apply. The text of cards on screen stays.
- **Timer.** An hourly timer calls the existing `currentHistory()`, so day-old rows leave disk on an idle desktop.
  - A stopped shell can't do this, and the manual says so.
  - There's no separate cleanup at login (spec approval, decision 2).
- **Backup.** `nixarchy home backup` excludes `.local/state/omarchy/notifications/`.
  - The next backup run removes the folder from the newest commit.
  - Older commits, and any remote they were pushed to, keep it. The release note says so, and nothing rewrites git
    history.
- **Docs.** A "Notification history" section goes in `docs/manual/secrets.md`, plus a release note.
- **Upstream.** The `Store.js` and `Service.qml` change is offered to `basecamp/omarchy` after a week on p620, with the
  Node test (spec approval, decision 1). nixarchy carries 904 until upstream decides.
- **Rejected:**
  - stripping in `closedEntry()`: the replay would show empty cards;
  - a second constant kept in step by a comment;
  - a short body on every row;
  - `substituteInPlace` for multi-line JavaScript;
  - encryption;
  - docs only;
  - scrubbing old backup commits.

## Facts the steps rely on

- Upstream `shell/plugins/notifications/Store.js` and `Service.qml` are byte-identical at `main`'s pin
  `basecamp/omarchy@ac2690c` (v4.5.0) and at edge's `cc99764`.
- `Store.js` line numbers below are upstream's; no patch touches that file today.
- `Service.qml` line numbers are the shipped file's: upstream plus 902 and 903, byte-identical to p620's installed
  copy. 903 adds about 100 lines, so upstream's numbers run about 100 lower from `:1300` on.
- **Where things are:**
  - `retain()` is `Store.js:193-198`, `addHistory()` `:200-201`, `parseLive()` `:258`, and `redacted()` `:283-285`.
  - `loadLive` is `Service.qml:1358-1366` and calls `Store.parseLive(text)` at `:1360`.
  - `loadHistory` is `:1370-1373`.
  - `currentHistory()` is `:1320-1325`, and saves only when the row count changed.
  - `saveTimer` is `:1335-1339`, and `replayCount` is `:1474`.
  - Quiet mode writes history at `:681-684`.
- The notifications IPC handler (`omarchy-shell notifications <fn>`) has `setDnd on|off`, `dismissAll`,
  `showHistory`, `count`, `isDnd` and `delegate <ms>`.
- 902 and 903 are applied in `pkgs/omarchy/default.nix:2017-2025` with
  `patch -d "$out/share/omarchy" -p1 --forward --fuzz=0`.
- A new `.patch` file's `+++ b/` paths are picked up by `tests/patched-files.nix` by themselves.
  `data/bin-ledger.nix` covers `bin/` only, so it needs no row.
- A check whose file takes `{ inputs, pkgs }` and whose name matches its file registers by being listed in
  `uniformChecks` (`flake.nix:1745`). Otherwise it's an explicit entry, like `home-backup-restore` at `flake.nix:2592`.
- `nixarchy-home-backup` lists its shipped paths in `shipped_list` (`:57-108`). A user's `backup.list` only adds
  (`:118`). Each run empties the repo's working tree and copies everything in again (`:604-608`), then pushes when
  there's a remote (`:635-663`).
- p620 follows nixarchy's **`edge`** branch: `~/.config/nixos/flake.nix:39-40` has
  `url = "github:olafkfreund/nixarchy/edge"`.
  - The `omarchy-edge.yml` workflow merges `main` into edge nightly at 06:00, or on `workflow_dispatch`. It does so
    only after the checks pass on the newest quattro.
  - So nixarchy `main`, then edge, then a `nixos_config` bump.

## Repo traps (all steps)

- **A shared repository.**
  - Another live session, `nixarchy-24`, works in nixarchy (VM-test builds for #1610 on 2026-11-07).
  - Never touch its worktrees. Never `git stash`, reset or checkout outside this task's own worktree.
- **Builds.**
  - The `codex-implement` and `agy-implement` sandboxes have no Nix daemon and a read-only `.git`. The lead (the session
    model) runs every build and makes every commit.
  - Build every check a change can reach before pushing (nixarchy `AGENTS.md:793-806`). Run VM checks and the
    `options-*` shards only when no runner is busy (`AGENTS.md` VM tier).
- **The session test.** In `tests/session.nix`, use unique Python names. A new variable that shadows an existing one
  fails the driver's type check before the VM starts (bus, 2026-10-30).
- **Restarting the shell.**
  - `omarchy-refresh-shell` resets `~/.config/omarchy/shell.json` to defaults. Never use it.
  - Restart the shell with `omarchy restart shell` (the user's command).
  - From an agent terminal, `omarchy-restart-shell` stops the shell but can't start it again, because of a stale
    session env. Ask the user, or follow memory `omarchy-shell-relaunch-from-agent`.
- **Private data.** Never print notification text. Queries on the real files count fields only.

## Steps

### 0. Preflight (lead, no file edits)

1. Read the agent bus (`read_new` on `#agents`) and run `ListAgents`. Post this on the bus, naming `nixarchy-24`:
   > Starting nixarchy #1663 (Nixi #220) in a new worktree `nixarchy-220` from `origin/main`. Files:
   > `pkgs/omarchy/904-notification-history-text.patch` (new), `pkgs/omarchy/default.nix` (one line after 903),
   > `pkgs/omarchy/nix-bin/nixarchy-home-backup`, `tests/notification-store.nix` (new), `flake.nix` (`uniformChecks`),
   > `tests/session.nix`, `tests/options.nix`, `tests/home-backup-restore.nix`, `docs/manual/secrets.md`.

   If anyone is in those files, wait or ask the user.
2. Open the nixarchy issue and record its number in this plan's step 0 (a plan edit, committed in Nixi):
   - title: "Notification history keeps every message's text for a day";
   - body:
     > The shell writes the text of every notification to `~/.local/state/omarchy/notifications/history.json`
     > (newest 100 rows, up to 24 h after closing, applied only on events) and `live.json` (no age limit), and
     > `nixarchy home backup` copies both. Fix: keep text on the newest 6 history rows only, drop day-old live cards on
     > load, apply retention hourly, exclude the folder from the backup, document it.

     Then the decisions above, and links to Nixi #220's intent, spec and plan on `docs/220-notification-history`.
   - comment on Nixi #220: "Implemented in olafkfreund/nixarchy#1663; this closes when that PR merges." This is the
     approved spec's rule.
3. Create the worktree:
   ```sh
   git -C <nixarchy checkout> fetch -q origin
   git -C <nixarchy checkout> worktree add ../nixarchy-220 -b fix/1663-notification-history origin/main
   ```
   Check first that no `nixarchy-220` directory or branch exists.

### 1. The Node check, test-first: `tests/notification-store.nix` (new) and `flake.nix`

- **Shape:** a `runCommand` taking `{ inputs, pkgs }`. It runs `node` (`pkgs.nodejs`) on an inline script against
  `${pkgs.omarchy}/share/omarchy/shell/plugins/notifications`.
  - Add `"notification-store"` (lowercase, matching the file name) to `uniformChecks` (`flake.nix:1745`).
  - `pkgs` there is `pkgsFor.${system}`, built with `self.overlays.default` (`flake.nix:394-398`), and that overlay
    defines `omarchy` (`flake.nix:551`, `:837`). So `pkgs.omarchy` is the patched package, and no explicit entry is
    needed.
  - It also reads `${pkgs.omarchy}/share/omarchy/shell/plugins/notifications/Service.qml` and asserts it contains
    `readonly property int replayCount: Store.HISTORY_TEXT_ROWS`. That catches an unchanged `replayCount: 6`, which
    a card count alone can't.
- **Loader:**
  - For each `.js` file, drop `.pragma library`.
  - Turn `.import "X.js" as X` into a context global holding X's loaded context (`vm.createContext` and
    `vm.runInContext`).
  - Compare arrays with `JSON.stringify`. Contexts don't share prototypes, so `deepStrictEqual` fails on equal arrays.
- **Fixture rows:**
  - Every row has all five text fields filled, with `execActions` set to
    `'[{"label":"Open","argv":["xdg-open","https://x"]}]'`.
  - The array is newest-first by **closing** (`closed_ts` descending), which is the order `addHistory` writes and
    `retain` keeps. Neither sorts (`Store.js:193-201`, `:236-255`).
  - `ts` (arrival) runs the opposite way, so a test that sorted by `ts` would fail.
  - Keys `h0`…`h9` are in array order. The redacted fixture `hr` sits at index 7. The stale row `hs` is last.
- **Assertions:**
  1. **Migration of a pre-change file.** The file holds 10 full rows, a redacted row (`summary` "Your code is 123456",
     `body` "Your verification code is 123456"), and a row closed 25 hours ago.
     - The input is the raw fixture. The expected value is its persisted placeholder.
     - After `retain(parseHistory(text), now)` the key sequence is exactly `h0 h1 h2 h3 h4 h5 h6 hr h7 h8`, and `hs`
       is gone.
     - `h0`-`h5` keep each of the five fields, compared to the fixture values.
     - `h6`-`h8` have all five fields `""`, with `key`, `app`, `ts`, `closed_ts` and `closed_reason` intact.
     - `hr` is exempt from the empty-field check. It reads `Verification notification` / `[redacted]`, with
       `groupKey` `""`. That is the persisted placeholder, not the raw secret.
  2. **Boundaries.** A row closed exactly `24*3600` s before `now` is dropped, and one closed `24*3600-1` s before is
     kept. Rows 5 and 6 sit on either side of the cut.
  3. **Running it twice.** `serialise(retain(parseHistory(serialise(h)), now))` equals `serialise(h)`. In particular,
     `hr`'s full serialised object is unchanged. Without the redacted-row guard this fails: `groupKey` becomes
     `"app:"`.
  4. **The window moves.** After `addHistory(h, closedEntry(newRow, "closed", now), now)`, the keys are
     `hn h0 h1 h2 h3 h4 h5 h6 hr h7 h8`. `hn` and `h0`-`h4` have their text, and `h5` has lost it.
  5. **`parseLive`.** It drops a row with `ts` 25 hours old and keeps one 1 minute old. With `now` left out it uses the
     clock: a row 30 hours older than `Date.now()/1000` is dropped.
- **Verify it fails first:** `nix build .#checks.x86_64-linux.notification-store` fails on the unpatched package,
  with assertion 1 failing.
- **Traps:**
  - Lowercase check names.
  - The script must not need the network.
  - Keep the step-1 test unchanged after it first fails for the right reason.

### 2. The patch: `pkgs/omarchy/904-notification-history-text.patch` (new) and `pkgs/omarchy/default.nix`

- **Generate it against the 902+903 output,** not raw upstream:
  1. Copy upstream `shell/plugins/notifications/{Store.js,Service.qml}` from the `omarchy` input.
  2. Apply 902 and 903 with `-p1 --forward --fuzz=0`.
  3. Edit the copies, then `diff -u` (paths `a/shell/...` and `b/shell/...`). Strip the timestamps.
- **Target content.** A scratchpad prototype of this applied after 902+903 on `cc99764`, and its Node check passed:
  ```diff
  --- a/shell/plugins/notifications/Service.qml
  +++ b/shell/plugins/notifications/Service.qml
  @@ -1338,6 +1338,15 @@
       onTriggered: service.flushStore()
     }
   
  +  // Retention is applied on a timer too, so an idle desktop does not keep a
  +  // day-old row until the next notification.
  +  Timer {
  +    interval: 3600000
  +    repeat: true
  +    running: service.historyLoaded
  +    onTriggered: service.currentHistory()
  +  }
  +
     // A file is written only once it has been read, so startup never
     // overwrites what the last session left; its loader saves again.
     function flushStore() {
  @@ -1471,7 +1480,7 @@
     // ------------------------------------------------------------- history replay
     //
     // The last few come back as restored rows: no live sender, a short grace.
  -  readonly property int replayCount: 6
  +  readonly property int replayCount: Store.HISTORY_TEXT_ROWS
   
     function replayHistory() {
       var rows = currentHistory().slice(0, replayCount)
  --- a/shell/plugins/notifications/Store.js
  +++ b/shell/plugins/notifications/Store.js
  @@ -149,6 +149,10 @@
   var LIVE_LIMIT = 100
   var HISTORY_LIMIT = 100
   var RETENTION_HOURS = 24
  +// Only the newest rows keep their text: the ones the replay key shows again.
  +// Older rows keep who and when, never what was said or what a click runs.
  +var HISTORY_TEXT_ROWS = 6
  +var TEXT_FIELDS = ["summary", "body", "rawBody", "execArgv", "execActions"]
   // A live row is what a restored card draws; a history row only needs to
   // come back as a short card, so its text is cut much shorter.
   var LIVE_ROW_CHARS = 16384
  @@ -193,7 +197,15 @@
   function retain(entries, now) {
     var cutoff = now - RETENTION_HOURS * 3600, out = []
     for (var i = 0; i < entries.length && out.length < HISTORY_LIMIT; i++)
  -    if (entries[i].closed_ts > cutoff) out.push(entries[i])
  +    if (entries[i].closed_ts > cutoff) out.push(out.length < HISTORY_TEXT_ROWS ? entries[i] : withoutText(entries[i]))
  +  return out
  +}
  +
  +// A redacted row is already only a placeholder; its marker must survive.
  +function withoutText(entry) {
  +  if (redacted(entry)) return entry
  +  var out = {}
  +  for (var k in entry) out[k] = TEXT_FIELDS.indexOf(k) >= 0 ? "" : entry[k]
     return out
   }
   
  @@ -255,7 +267,11 @@
     return out
   }
   
  -function parseLive(text) { return parseStored(text, LIVE_LIMIT, LIVE_ROW_CHARS, false) }
  +// A card left on screen longer than history would keep it does not come back.
  +function parseLive(text, now) {
  +  var cutoff = (now || Date.now() / 1000) - RETENTION_HOURS * 3600
  +  return parseStored(text, LIVE_LIMIT, LIVE_ROW_CHARS, false).filter(function(entry) { return entry.ts > cutoff })
  +}
   function parseHistory(text) { return parseStored(text, HISTORY_LIMIT, HISTORY_ROW_CHARS, true) }
   
   function serialise(entries) { return JSON.stringify(entries) + "\n" }
  ```
- **`default.nix`.** Directly after 903's `patch` line (`:2025`), add:
  ```nix
                      # Only the newest notifications keep their text in history; older rows keep who
                      # and when, and day-old cards don't come back (Nixi #220, nixarchy #1663). CARRIED
                      # until omacom/omarchy takes it; --fuzz=0 so a bump that rewords it fails here.
                      # Sits on 902/903: same file. checks.notification-store and checks.session prove it.
                      patch -d "$out/share/omarchy" -p1 --forward --fuzz=0 < ${./904-notification-history-text.patch}
  ```
- **Verify:**
  - `nix build .#checks.x86_64-linux.omarchy` applies 902, 903 and 904.
  - `nix build .#checks.x86_64-linux.notification-store` now passes, with step 1's test unchanged.
  - `checks.patched-files` passes.
- **Traps:**
  - Don't edit 903. If 903 changes later, regenerate 904.
  - `retain`'s comparison stays `>` (strict), as upstream has it.

### 3. The backup exclusion: `nixarchy-home-backup`, `tests/options.nix` and `tests/home-backup-restore.nix`

1. In `shipped_list`, after the `!.local/state/omarchy/agents/` entry (`:102-104`), add a commented entry in the same
   style:
   ```
   # What notifications said. The shell keeps the newest few in full and the cards
   # on screen; per-machine, short-lived, and somebody else's words. Nixi #220.
   !.local/state/omarchy/notifications/
   ```
   The comment above the list says "three things"; it becomes "five" (`:80-82`). Count what's there before you write
   the number.
2. In `tests/options.nix:5175-5177`, add `.local/state/omarchy/notifications/` to the `for never in …` list.
3. In `tests/home-backup-restore.nix`:
   - beside `:43`, add `printf 'notification\n' > "$repo/.local/state/omarchy/notifications/history.json"`, with
     `mkdir -p`;
   - beside `:53`, add
     `test ! -e "$home/.local/state/omarchy/notifications/history.json" || fail "excluded notifications restored"`;
   - add a backup-side case. Start from a backup repo whose last commit already tracks
     `.local/state/omarchy/notifications/history.json`, with a matching file in `$home`. Run a backup, then assert
     that `git -C "$repo" ls-files` no longer lists it. This proves the next run drops it from the newest commit.
     (The clipboard case at `:240` tests a symlink to an excluded file, so it isn't the right model.)
   - Check the restore counts asserted at `:55` (`2 restored, …`) still hold. A new excluded fixture should not change
     them. If one does, the fixture is wrong.

- **Verify:**
  - `nix build .#checks.x86_64-linux.home-backup-restore` passes.
  - `options-files` passes. The "never" list at `tests/options.nix:5175` is inside its `nixarchy-options-files`
    derivation (`:3751`), exposed as `options-files = options` (`flake.nix:2852`).
- **Traps:** the `options` shards are heavy, so run them when no runner is busy.

### 4. The VM test: `tests/session.nix`

1. **The first start with existing files** goes in two places.
   - **Seed.** Right after `machine.wait_for_unit("multi-user.target")` (`:325`), before the login at `:545`, write the
     files as root, since the shell doesn't run yet. Use `now=$(date +%s)` inside the VM, so timestamps match its
     clock:
     - Create `/home/omarchy/.local/state/omarchy/notifications`, owned by `omarchy`, mode 700.
     - `history.json`: 10 full rows `s220-0`…`s220-9`, newest-first by `closed_ts` (`now-60*i`), plus `s220-stale`
       with `closed_ts` `now-90000`.
     - `live.json`: `live-220-stale` with `ts` `now-90000`, and `live-220-fresh` with `ts` `now-60` and
       **`urgency` 2**. A critical card stays on screen (`Store.js:135`). A normal one would expire during the
       75-second wait at `:562-564`, since restored cards get 20 s (`Store.js:83`).
     - Make both files owned by `omarchy`, mode 600.
   - **Assert,** after the 75-second wait (`:564`) and before any block that sends notifications:
     - Wait until `history.json` has no `s220-stale`.
     - Check that `s220-6`…`s220-9` have all five fields `""`.
     - Check that no row at index 6 or later has text, unless it is a `Verification notification`.
     - Assert `live.json` has no `live-220-stale`.
     - Assert `omarchy-shell notifications dismiss live-220-fresh` returns `ok`. That proves that particular card is on
       screen, and removes it.
     - Rows that arrived since login can push the seeded rows down. So assert by key, and use "index 6 or later" only
       for the no-text rule.
2. **The rule, in quiet mode,** after the #133 block and before `# ---- power` (`:1267`).
   - Call `setDnd on` and assert `isDnd` is `on`.
   - For `i` in 1-8: `notify-send -a nixarchy-probe -- hist-220-<i> body-<i>`. Wait (30 s floor) until
     `jq -r '.[0].summary' history.json` is `hist-220-<i>`, then record `.[0].key` in `keys220[i]`.
   - Assert by key that `keys220[3..8]` have non-empty `summary` and `body`.
   - Assert that `keys220[1..2]` exist with `summary`, `body`, `rawBody`, `execArgv` and `execActions` all `""`, and
     `closed_reason` non-empty.
   - Call `setDnd off`, then wait until `isDnd` returns `off` before the next block.
3. **Replay, and QML reading `Store.HISTORY_TEXT_ROWS`.**
   - `dismissAll`, `showHistory`, then wait until `count` is `6` and assert it stays `6` for 2 s. Then `dismissAll`.
   - Assert that the shell's journal **since boot** has no line matching
     `notifications/Service\.qml.*(Unable to assign|HISTORY_TEXT_ROWS)`. Use
     `journalctl -b -t omarchy-shell -o cat`, the form used at `:627`. The binding runs when the component loads,
     so a cursor taken just before the replay would miss it.
   - The Node check (step 1) proves the shipped QML has the `Store.HISTORY_TEXT_ROWS` binding. This block proves it
     resolves to 6.
4. The existing #1032 and #133 assertions must pass unchanged.

- **Verify:** `nix build .#checks.x86_64-linux.session`, when no runner is busy. It is a VM check.
- **Traps:**
  - Unique Python names (`keys220`, `seed220_*`).
  - Never read one batched write once; always `wait_until_succeeds`.
  - Quiet mode must be confirmed off before later blocks run.
  - The seed runs as root, so `chown` explicitly.

### 5. Docs: `docs/manual/secrets.md` and the release note

1. Add a `### Notification history` section after "The clipboard is not private" (`:146-157`). In plain words, it says:
   - Both files live in `~/.local/state/omarchy/notifications/` and are mode 600.
   - The 6 newest closed notifications keep their text, which is what the replay key shows. Older ones keep only who
     and when.
   - Rows go 24 hours after closing. That happens hourly while the shell runs, at start, and on a new notification. A
     stopped shell, an old snapshot of `/home`, or the disk's free space may still hold earlier text.
   - `live.json` holds the full text of the cards on screen. A card more than a day old doesn't come back after a
     restart.
   - `nixarchy home backup` excludes the folder.
2. The release-note text goes in the PR body under "Release note" (nixarchy `AGENTS.md:1388-1391`):
   > The shell's notification history now keeps the text of the newest 6 notifications only, and day-old cards don't
   > come back after a restart. `nixarchy home backup` no longer copies `~/.local/state/omarchy/notifications/`;
   > commits made before this release may still hold it.

- **Also:** a Discussions post with the same text and the migration step: "the next `nixarchy home backup` drops the
  folder; older commits still hold it." This follows `AGENTS.md:1388-1391`, which asks for the release notes **and**
  the Discussions post.
- **Verify:** `nix build .#checks.x86_64-linux.docs-lists` passes. That is the check that reads `docs/manual`
  (`flake.nix:2352-2353`).
- **Traps:** don't show notification contents in examples. The `jq` examples count fields.

### 6. Finish (lead; no file edits beyond this plan)

1. Build every check the change reaches: `omarchy`, `notification-store`, `patched-files`, `home-backup-restore`,
   `options-files`, `docs-lists` and `session`. Also build whatever else `.github/scripts/generated-checks.sh` prints
   that the diff touches. Name any check that can't run here.
2. Get a fresh Opus review with only this plan's path and `git diff origin/main`, plus Codex and agy read-only reviews
   of the diff (`reviewers:`). Fix what is confirmed.
3. Open a PR to nixarchy `main`:
   - it closes `#1663`, links Nixi #220's intent, spec and plan, says which steps `coder`, Codex and agy did, and
     carries the release note;
   - comment `@codex review`;
   - check `gh pr view --json mergeable` before calling it on its way;
   - merge when CI and the reviews are clear;
   - the PR's `Closes #1663` closes the nixarchy issue. Close Nixi #220 then too, with a comment linking the merge (the
     spec's rule). Deploy and the hand check continue under this plan.
4. **Edge.** Wait for the 06:00 `omarchy-edge.yml` run, or `gh workflow run omarchy-edge.yml --ref main` after saying
   so on the bus. Then:
   - `git fetch origin edge && git merge-base --is-ancestor <merge-commit> origin/edge`.
   - If that fails, check `gh issue list -R olafkfreund/nixarchy --label omarchy-edge-held --state open` and
     `--label omarchy-edge`. An open one means edge is held or didn't publish: stop and tell the user. p620 only
     follows edge.
5. **Deploy p620,** following the house steps used for #207 and #215:
   - check the agent bus;
   - in a clean `nixos_config` worktree, `nix flake update nixarchy`. Check that
     `jq -r .nodes.nixarchy.locked.rev flake.lock` contains the merge
     (`git -C <nixarchy> merge-base --is-ancestor <merge-commit> <rev>`). Then open the bump PR and comment
     `@codex review`;
   - wait for CI, merge, and post on the bus;
   - from that worktree at the merged commit, run `AGENT_BUS_ANNOUNCED=1 nh os switch .` (never `just deploy`, which
     builds `~/.config/nixos`);
   - check that `nixos-version --json`'s `configurationRevision` is the merged `nixos_config` commit;
   - check that the package has the fix:
     `grep -c HISTORY_TEXT_ROWS "$(readlink -f "$(command -v omarchy-launch-shell)" | sed 's|/bin/.*||')/share/omarchy/shell/plugins/notifications/Store.js"`
     is 2 or more. Run it again after the shell restart, against the shell's own `OMARCHY_PATH`, read from its
     process's cmdline.
6. **Hand check on p620,** with the user restarting the shell (`omarchy restart shell`). Agents count fields only and
   never print text:
   - `jq '[.[:6][] | select(.summary != "")] | length' ~/.local/state/omarchy/notifications/history.json` is 6, when 6
     or more rows exist.
   - This is 0:
     ```sh
     jq '[.[6:][] | select(.summary != "Verification notification" and (.summary != "" or .body != "" or .rawBody != "" or .execArgv != "" or .execActions != ""))] | length' ~/.local/state/omarchy/notifications/history.json
     ```
   - `jq 'map(.closed_reason) | group_by(.) | map({(.[0]): length}) | add'` still shows `delegated`.
   - `stat -c %a` on both files is 600.
   - The replay key brings back 6 cards, and clicking one opens its app (the user, by eye).
   - A notification still reaches the Nixi companion, and clicking it opens its app (#133, the user).
   - Don't claim it works until the user says so.
7. **Razer:** `just deploy-via-p620 razer`, unless the bus says razer is held. p510 isn't part of this.
8. **Close the loop.**
   - Comment on the closed Nixi #220 with the `nixos_config` commit and the hand-check result.
   - Note in this plan the date to offer upstream: a week after the p620 deploy. Offering it is a separate task with
     its own issue.
   - If upstream takes it, the next Omarchy bump fails to apply 904 (`--fuzz=0`). That bump deletes
     `904-notification-history-text.patch` and its `default.nix` line (the spec's rule).

## Tests

- `nix build .#checks.x86_64-linux.notification-store`: fails before step 2 and passes after.
- `nix build .#checks.x86_64-linux.{omarchy,patched-files,home-backup-restore}` pass.
- The `options-*` shard holding the backup "never" list passes.
- `nix build .#checks.x86_64-linux.session` passes, including the three new blocks and the unchanged #1032/#133 ones.
- The p620 hand check (step 6.6) passes, confirmed by the user.

## Rollback

- **Before merge:** close the PR, remove the worktree, and delete the branch.
- **After merge:** revert the nixarchy PR. Edge picks up the revert at its next run. Then do a `nixos_config` bump,
  deploy it to p620 with step 6.5's steps, and restart the shell.
  - Rows already stripped stay stripped: their text is gone, by design.
  - The backup exclusion can be reverted on its own if wanted.
- **On p620 at once:** `sudo nixos-rebuild switch --rollback`, or boot the previous generation, then restart the shell.

## Reviews (2026-11-07, read-only, advice only)

Both read this draft and one evidence bundle, with `Service.qml` in shipped coordinates this time. Each finding was
checked against nixarchy `cad0d36` and the shipped files.

**Codex** (`gpt-6.1-sol`):

1. The first-start VM test wasn't concrete, and a seeded normal card would expire during the 75-second wait
   (`Store.js:83`, `session.nix:562-564`). **Confirmed.** Step 4.1 now:
   - seeds as root after `multi-user.target` and before login, using the VM's own clock;
   - makes the fresh card critical;
   - proves that particular card is on screen with `dismiss live-220-fresh` returning `ok`.
2. The redacted-row assertions contradicted each other. **Confirmed.** `hr` is now placed at index 7 and exempt from
   the empty-field check, and its full serialised state is compared across two loads.
3. A journal cursor taken just before the replay would miss the binding's warning, and a card count can't tell
   `replayCount: 6` from the shared constant. **Confirmed.** The journal is now read since boot, and the Node check
   asserts the binding's text in the shipped `Service.qml`.
4. Ordering was underspecified. **Confirmed.** Fixtures are now newest-first by closing, with arrival times reversed
   and exact expected key sequences.
5. Check wiring and names were left open. **Confirmed.**
   - `pkgs.omarchy` comes from `self.overlays.default` (`flake.nix:394-398`, `:551`, `:837`).
   - The shard is `options-files` (`tests/options.nix:3751`, `flake.nix:2852`).
   - The docs check is `docs-lists` (`flake.nix:2352`).
6. Lifecycle details. **Confirmed:**
   - Nixi #220 now closes when the PR merges (the spec's rule);
   - the "upstream takes it, so the bump drops 904" step is restored;
   - the Discussions post is added (`AGENTS.md:1388-1391`).
7. Deploy verification. **Confirmed:**
   - `git fetch` before the ancestry check;
   - the lock's `rev` is checked;
   - `configurationRevision` is named;
   - the installed path is resolved;
   - rollback now includes the deploy.
8. The issue body pointed at the intent, and the backup test followed the wrong model. **Confirmed.** The issue body
   is now inline, and step 3 has a tracked-file case. The clipboard case at `:240` is a symlink case.

Codex judged the coder routing sensible.

**agy** (model not reported):

- **Confirmed:**
  - wait for `isDnd` to read `off` after `setDnd off`: added;
  - make the edge-held check concrete: now a `gh issue list` on the `omarchy-edge-held` and `omarchy-edge` labels.
    They are issue labels, not a variable.
- **Refuted:**
  - The "three things" comment: step 3 already says to update the count, and no test reads that comment.
  - The check name's case: the plan already uses lowercase `notification-store`.
  - Timer syntax: a sibling QML object needs no commas. The prototype applied with `--fuzz=0`, and the VM test parses
    it.
  - `retain` test expectations: assertion 1 already expects text only on the newest 6.
  - The `Store` import: it's at `Service.qml:16`, `import "Store.js" as Store`.
  - The missing `mkdir -p`: step 3 already says "with `mkdir -p`".
  - The `1663` placeholder: step 0 fills it in.
  - `running: service.historyLoaded`: that's deliberate. Before the history loads there's nothing to expire.
  - The insertion point before `# ---- power`: no tool reads `session.nix` line numbers.
  - Release-note placement: merged into Codex 6, with the Discussions post added.
  - Rollback commands: `nixos-rebuild switch --rollback` is given.

## Deviations during implementation

Code is in `olafkfreund/nixarchy`, and this plan is in Nixi, so the two can't share a commit. Each entry names the
nixarchy commit it explains. The plan commit follows that commit directly.

- **Dispatch.** The `team` skill would not load ("Unknown skill: team"). Steps go out by hand, following `coders:`:
  - the `coder` subagent for steps 1, 3 and 4, kept as one agent;
  - `agent-run codex` for step 2;
  - `agent-run agy` for step 5.

  The lead reviews every diff, runs every build and makes every commit.
- **Step 0:** the nixarchy issue is #1663. The worktree is `nixarchy-220`, branch `fix/1663-notification-history`,
  from `cad0d36`.
- **Step 1** (`133c331`, coder, plus one lead edit):
  - Assertion 2 tests the 24-hour boundary on its own three-row array. The 6-row cut is already covered by
    assertion 1's exact per-row checks.
  - The coder's `row()` gave `ts` the same order as `closed_ts`. The lead changed it to `ts = now - 3*H + age`, so
    arrival runs opposite to closing as the plan requires, and gave the `parseLive` rows explicit ages.
  - The check fails before the patch with `1: h6 loses summary`.
- **Step 2** (`7f70732`, Codex): the patch is byte-identical to the prototype. Codex couldn't read the scratchpad
  copies, and used a matching Nix store copy of upstream to prove 902+903+904 apply at `--fuzz=0`. The lead built
  `omarchy`, `notification-store` (now passing) and `patched-files`.
- **Step 3** (`80ca85b`, coder):
  - The backup list's comment now says "five things", since four exclusions already existed before this one.
  - The comment above the `options.nix` never-list no longer gives a number.
  - `home-backup-restore` passes.
  - `options-files` needs a committed tree (`installer/mkFlake.nix`), and it is VM-tier, so it waits for the runner
    gate.
