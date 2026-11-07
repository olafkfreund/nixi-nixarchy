---
status: draft
issue: 220
intent: intent/2026-11-07-220-notification-history.md
---

# Spec: Keep the text of only the newest 6 notifications in the shell's history

The approved intent's six decisions, carried over:

1. Only the 6 newest history rows (what the replay shows) keep their text. The rest keep metadata only.
2. `execArgv` and `execActions` are kept only on the rows that keep text.
3. `live.json` is in scope: document it, and drop old rows when it loads. It keeps its text.
4. Retention: document it, and add a timer only if it is cheap. It is: see Design.
5. Exclude `notifications/` from `nixarchy home backup`. The release note says older backups may still hold the files.
6. The fix goes in nixarchy first, tracked in its own nixarchy issue. The `Store.js` change is offered upstream too.

All of it lands in `olafkfreund/nixarchy`. This repo (Nixi) changes nothing.

Code references are to Omarchy's `shell/plugins/notifications/`:

- Upstream `Store.js` and `Service.qml` are byte-identical at the stable pin `basecamp/omarchy@ac2690c` (v4.5.0,
  nixarchy's `flake.lock`) and at edge's `cc99764`.
- `Store.js` line numbers are upstream's. No patch touches that file today.
- `Service.qml` line numbers are the **shipped** file's: upstream with 902 and 903 applied, which is what 904 is
  written against. That file is byte-identical to the one installed on p620. 903 adds about 100 lines, so upstream's
  numbers run about 100 lower from `:1300` on.
- nixarchy paths are at `cad0d36`.

## Design

### The nixarchy issue

A new nixarchy issue, "Notification history keeps every message's text for a day", links Nixi #220 and this spec. It
is opened when this spec is approved and is the one the nixarchy PR closes. Nixi #220 closes when that PR merges.

### 1. `pkgs/omarchy/904-notification-history-text.patch` (new)

It edits two files, in five hunks.

**`Store.js`:**

- New constants next to `RETENTION_HOURS` (`Store.js:151`):
  - `HISTORY_TEXT_ROWS = 6`;
  - `TEXT_FIELDS = ["summary", "body", "rawBody", "execArgv", "execActions"]`.
- `retain()` (`Store.js:193-198`) keeps the first 6 surviving rows as they are. Every later row goes through a new
  `withoutText(entry)`, which sets the five text fields to `""` and copies the rest.
  - A redacted row (`redacted()`, `Store.js:283-285`) is returned unchanged. It is already a placeholder, and
    stripping its marker would make the next load recompute its `groupKey` (`Store.js:118-122`). That would break
    the "running it twice" guarantee below, as the Codex review found and the prototype confirmed.
  - Every path to history already goes through `retain()`: a new row (`addHistory`, `:200-201`), a shell start
    (`Service.qml:1371`) and the replay (`currentHistory`, `Service.qml:1320-1325`). So that one function enforces the
    rule for all three writers: a closed card, quiet mode and 903's delegated rows.
  - Running it twice gives the same result.
- `parseLive(text, now)` (`Store.js:258`) drops rows whose `ts` is older than `RETENTION_HOURS`. `now` defaults to the
  clock, so `Service.qml:1360`, which calls `Store.parseLive(text)`, needs no change.

**What a stripped row keeps:** `key`, `originalId`, `senderPid`, `glyph`, `app`, `appIcon`, `source`, `groupKey`,
`urgency`, `expireTimeout`, `duration`, `ts`, `closed_ts` and `closed_reason`. These say who sent it and when.
`groupKey` is built from `app`, `source` and `key` (`Markup.js:141-147`), never from the text. `source` is the sender's origin name: all 100
of today's rows are plain names with no `/`, a count of shape only.

**`Service.qml`:**

- `replayCount` (`Service.qml:1474`) becomes `Store.HISTORY_TEXT_ROWS`. The replay and the text window are then one
  number and can't drift apart.
- A new hourly `Timer` after `saveTimer` (`:1335-1339`) calls `currentHistory()` while `historyLoaded` is true.
  - That function already removes expired rows and saves only when something left (`:1320-1325`).
  - This is decision 4's "cheap" timer: 7 lines and one wake an hour. A desktop then drops day-old rows without
    waiting for a notification. A stopped shell still can't, and the manual says so.

The prototype is 72 lines with 5 hunks. On copies of the upstream `cc99764` files, 902, 903 and then 904 apply in
order with `patch -p1 --forward --fuzz=0`. The result is byte-identical to the edited files.

### 2. Wiring: `pkgs/omarchy/default.nix`

- One more `patch -d "$out/share/omarchy" -p1 --forward --fuzz=0 < ${./904-notification-history-text.patch}` goes after
  903's (`default.nix:2022-2025`). Its comment follows the 902/903 form: why, "CARRIED until omacom/omarchy takes it",
  and what checks it.
- `tests/patched-files.nix` finds the new `+++ b/` paths by itself (`tests/patched-files.nix:5-9`).
- `data/bin-ledger.nix` covers only `bin/` commands, so it needs no row.

### 3. How 904 interacts with 903 and 902

- **Same file, different lines.** In shipped coordinates:
  - 903's insertions sit at about 51-136, 264, 694-723, 1173 and 1502-1548;
  - 904's two `Service.qml` hunks sit at 1338-1347 and 1474;
  - 902 is one hunk, at upstream 878.

  None of them overlap. 904 is written against the 903 output, so a change to 903 means regenerating 904. The build
  catches that through `--fuzz=0`.
- **903's delegated rows** go to history through `storeRecord(row, "delegated")` (903 patch, lines 150-161). From
  there they are treated like any other row. They keep their text while they are among the newest 6, and lose it
  after that.
  - Today, 97 of 100 rows are `delegated`, so in practice this mostly affects the companion's rows.
- **The companion doesn't read history.** It gets rows from the `delegate` IPC call as JSON (903, lines 147-166). A
  click comes back through `activateKey` (903, lines 177-181), which reads the in-memory `liveKeys[key].row`
  (903's `activate` hunk at `-1068`). It never reads `history.json`, so stripped rows cost the companion nothing.
- **`closed_reason` values are unchanged**, including `delegated`.
  - `tests/session.nix:1172-1174` and `:1196` look for a row's `summary` in history straight after it's written. That
    row is the newest, so it still has its text.

### 4. Backup exclusion: `pkgs/omarchy/nix-bin/nixarchy-home-backup`

- Add `!.local/state/omarchy/notifications/` to `shipped_list` (`:78-104`), with a comment in the clipboard entry's
  style.
- Add it to the `for never in …` list in `tests/options.nix:5175-5177`.
- Add a fixture row to `tests/home-backup-restore.nix`, next to the clipboard one (`:43`, `:53`).
- **Already-backed-up copies.** Each backup run empties the backup repo's working tree and copies everything in again
  (`nixarchy-home-backup:604-608`), then pushes when the repo has a remote (`:176`, `:635-663`).
  - So the next run after this change removes `notifications/` from the newest commit.
  - Older commits, and any remote they were pushed to, still hold it. The release note says so. Removing it from git
    history is the user's call, and this change won't rewrite it.

### 5. Documentation and release note

- **`docs/manual/secrets.md`:** a "Notification history" subsection after "The clipboard is not private"
  (`:146-157`). It says:
  - where both files live, and that they are mode 600;
  - that the 6 newest closed notifications keep their text (what the replay key shows), and older ones keep only
    who and when;
  - that rows go 24 hours after closing, applied hourly while the shell runs, at start, and on a new notification;
  - that a stopped shell or an old snapshot of `/home` still holds what was there;
  - that `live.json` keeps the full text of the cards on screen, and a card more than a day old doesn't come back
    after a restart;
  - that `nixarchy home backup` excludes the directory.
- **Release note** (nixarchy's rule for a changed default, `AGENTS.md:1388-1391`): history keeps the text of the newest
  6 notifications only, and older `nixarchy home backup` commits may still hold `notifications/`.

### 6. What happens to today's files on the first start after the change

A rebuild alone changes nothing: the running shell is the old code until the shell restarts or the user logs in
again. Only the user does either.

- **`history.json`:**
  - At start, `loadHistory` runs `retain(parseHistory(text))` (`Service.qml:1370-1373`). That drops rows more than 24
    hours old and strips text from all but the 6 newest.
  - The result differs from the file, so it's saved (`:1373`, `saveSoon`), written atomically (`atomicWrites`,
    `:1404`).
  - Today's file, 100 rows, goes down to 6 with text and 94 without.
- **`live.json`:** `loadLive` (`:1358-1366`) now gets only the rows from the last 24 hours. It saves when that differs
  from the file.
  - A critical card more than a day old doesn't come back. It doesn't reach history either, which would drop it as
    stale anyway.
- **What's left on disk:**
  - The atomic write replaces the file but doesn't wipe the old blocks. ext4 has no secure delete.
  - A btrfs or snapper snapshot of `/home`, on hosts that have one (`docs/manual/system-snapshots.md`), keeps the old
    file until the snapshot expires. p620 has neither: `/home` is ext4 with no snapper configs.
  - The manual says this. Nothing tries to scrub it.
- **Going back:** dropping 904 restores upstream behaviour for new rows. Rows already stripped stay stripped.

### 7. Upstream

- After the nixarchy PR has run on p620 for a week, the `Store.js` and `Service.qml` changes are offered to
  `basecamp/omarchy` as a PR, with the same tests as a description.
- If upstream takes the change, the next Omarchy bump fails 904 with `--forward --fuzz=0`, by design. That bump drops
  904.

## Alternatives rejected

- **Strip text at write time, in `closedEntry()`.** That would strip the newest row too, so the replay would show empty
  cards. The cut has to depend on position, so it belongs in `retain()`.
- **A separate `HISTORY_TEXT_ROWS` from `replayCount`, kept in step by a comment.** The two would drift apart silently.
  One constant, read by `Service.qml`, costs one changed line.
- **Keep a short body on every row (200 characters, as the companion row does at `Service.qml:706`, 903 patch line
  115).** The user chose
  decision 1 at intent approval.
- **Patch with `substituteInPlace --replace-fail` instead of a `.patch`.** 902 and 903 already patch this file with
  `.patch` files. Multi-line JavaScript edits are easier to review as a diff, and `--fuzz=0` gives the same "fail on
  reword" guarantee.
- **Encrypt `history.json`.** A key the shell can read is a key on the same disk. It adds complexity and no privacy
  against the same user.
- **Change only the docs.** The user chose decision 1.
- **Scrub old backup commits.** That is a destructive history rewrite of the user's own repository, and it's for the
  user to decide. The release note tells them.

## Risks

- **`Store.HISTORY_TEXT_ROWS` doesn't resolve in QML.** `replayCount` is a typed `int`. A binding that evaluates to
  `undefined` can't be assigned, so the replay would show the wrong number of cards, or none, with a warning in the
  journal.
  - The session check (Verification 2) counts the replayed cards and looks for "Unable to assign" in the shell's
    journal.
  - QML JS libraries expose their top-level `var`s, and `Service.qml` already reads `Store`'s functions. The Node
    harness can't prove this; only the VM can.
- **An Omarchy bump rewords `retain`, `parseLive` or `replayCount`.** 904 fails the build (`--fuzz=0`). That is the
  intended alarm, as with 902 and 903.
- **Someone relies on old history text.**
  - Nixi's planned reader uses `ts` only (`plan/2026-10-30-133-proactive-companion-b.md:156`). Its time window is
    unaffected.
  - Whether `nixoarchy-snowflake` reads `history.json` is unverified (intent). Its delegated path doesn't.
- **Critical cards more than 24 hours old disappear after a restart.** Decided at intent approval (decision 3). The
  sender re-sends a card if it still applies.
- **The timer** runs `currentHistory()` once an hour. It costs one array filter of at most 100 rows, and a write only
  when a row expired.
- **Hosts:** every nixarchy machine on stable or edge, once rebuilt and the shell restarted. Nothing is host-specific.

## Verification

1. **A fast check with no VM: `tests/notification-store.nix` (new, required).** It loads the patched `Store.js`,
   `Security.js`, `Markup.js` and `Detect.js` from the built `omarchy` package into Node, with the `.pragma` and
   `.import` lines mapped to modules. Every fixture row has all five text fields filled in, and a `ts` order that
   differs from its `closed_ts` order. It asserts:
   - **A pre-change file:** 10 full rows, a redacted row, and one row closed 25 hours ago.
     - After `retain(parseHistory(…))`, the stale row is gone.
     - The 6 newest rows by `closed_ts` position keep all five fields, each compared to its fixture value.
     - The rest have all five fields empty, with `key`, `app`, `ts`, `closed_ts` and `closed_reason` intact.
     - The redacted row still reads `Verification notification` / `[redacted]`.
   - **Boundaries:** a row closed exactly 24 hours ago is dropped and one closed a second later is kept. Rows 6 and 7
     sit on either side of the text cut.
   - **Running it twice changes nothing:** a second load of the serialised result is byte-identical, redacted row
     included.
   - **A new row moves the window:** after `addHistory`, the old row 5 (now row 6) has lost its text, and the new row
     0 has its own.
   - **`parseLive`** drops a 25-hour-old row, keeps a 1-minute-old one, and uses the clock when `now` is left out.
   - **It must fail against the unpatched `Store.js`,** so it can't pass by accident.

   A scratchpad prototype passed against 902+903+904 on upstream `cc99764`, with Node 24. It covered the migration,
   the moving window, `parseLive`, `execActions` and a redacted row twice over. It didn't cover the boundaries.
   Without the redaction fix, the redacted-row case fails.
2. **The session VM: `tests/session.nix`, after the #133 block.** No live desktop is involved.
   - **The rule.** Turn quiet mode on (`setDnd on`), so each notification goes straight to history in arrival order
     (`Service.qml:681-684`). This also covers the quiet-mode writer.
     - Send `hist-220-1` to `hist-220-8` one at a time. Before sending the next, wait until `history.json`'s row 0
       has that summary, and record its `key`.
     - Then assert, by key, that the 6 newest keep their `summary` and `body`, and `hist-220-1` and `hist-220-2` have
       all five fields empty.
     - Turn quiet mode off.
   - **The replay.** `dismissAll`, then `showHistory`, then assert `count` is `6`. Assert that the shell's journal has
     no "Unable to assign" line.
   - **The first start.** Seed `history.json`, with 10 full rows and one closed 25 hours ago, and `live.json`, with one
     card 25 hours old and one 1 minute old, before the shell reads them. Then assert the counts above on the
     rewritten files, and that only the fresh card is on screen. The plan picks how: write them before the session
     starts, or relaunch the shell inside the VM.
   - The existing #1032 and #133 history assertions must still pass unchanged.
   - **Not tested:** the hourly timer itself, since a VM can't wait an hour. The function it calls,
     `currentHistory()`, is upstream's and already runs on every replay. The timer is reviewed as code.
3. **The build:** `nix build .#checks.x86_64-linux.omarchy` applies 902, 903 and 904 with `--fuzz=0`. These checks
   pass:
   - `patched-files`;
   - `home-backup-restore`;
   - the `options-*` shard that holds the backup "never" list (`tests/options.nix:5175`, sharded since #1463; the plan
     names the shard).
4. **Hand check on p620, after the user rebuilds and restarts the shell.** Every query counts fields; nothing prints
   notification text:
   - `jq '[.[:6][] | select(.summary != "")] | length' history.json` is 6, when 6 or more rows exist;
   - `jq '[.[6:][] | select(.summary != "Verification notification" and (.summary != "" or .body != "" or .rawBody != "" or .execArgv != "" or .execActions != ""))] | length' history.json`
     is 0;
   - `jq 'map(.closed_reason) | group_by(.) | map({(.[0]): length}) | add' history.json` still shows `delegated` rows;
   - the replay key brings back 6 cards, and clicking one opens its app;
   - a notification still reaches the companion, and clicking it opens its app (#133);
   - `stat -c %a` on both files is still 600.

## Open questions

1. **When should the change be offered upstream?** *Recommendation: after a week on p620, with the Node test
   included. Upstream may want the timer and the 6-row window as settings; nixarchy keeps 904 until they decide.*
2. **Should a stopped shell's leftover text get a cleanup at login, outside the shell?** *Recommendation: no. The
   shell's own start does the same job within seconds of login, and a second writer to these files would race it.*

## Reviews (2026-11-07, read-only, advice only)

Both reviewers read the draft and an evidence bundle. The bundle's `Service.qml` excerpt was **upstream's** file, while
the draft cited the 903-patched file and wrongly called those numbers "upstream's". That mismatch caused several
citation findings. Every cited line was checked against the shipped file, which is byte-identical to p620's installed
one, and all of them match. The preamble now says which coordinates are used.

**Codex** (`gpt-6.1-sol`):

1. Redacted rows break the "running it twice" guarantee. **Confirmed** by the prototype: the second load changes
   `groupKey` from `""` to `"app:"`. Fixed: `withoutText` leaves redacted rows alone. Both runs now match byte for byte.
2. The migration and persistence can't be verified from the excerpts.
   - **Refuted** for the code: `loadHistory`, `loadLive` and the save-on-difference lines exist at the cited shipped
     lines, `:1358-1373`.
   - **Confirmed** that the Node test covers the transformation only. Added a session first-start test with seeded
     files.
3. The session test can't reliably identify its rows. **Confirmed.** It now uses quiet mode, waits for each row and
   records its key. That also covers the quiet-mode writer.
4. Fixtures were missing: empty `execActions`, a `rawBody` assertion that compared the value with itself, no redacted
   row, no boundaries, and the Node harness was optional. **Confirmed.** Verification 1 is rewritten and the harness is
   required. The timer itself is listed as not tested, with the reason.
5. Open question 2 reopened decision 3. **Confirmed.** It was removed and is settled in Risks.
6. Citations.
   - `groupKey` also uses `key`: **confirmed**, fixed.
   - "903 shifts nothing": **confirmed** as wrong wording, replaced with shipped-coordinate ranges.
   - The `replayCount`, `currentHistory`, `atomicWrites`, `:706` and transient lines: **refuted**, because they are
     right in shipped coordinates. `:706` now also cites 903 patch line 115.
7. `replayCount` is a typed `int`, so "undefined, so every row" is wrong. **Confirmed.** The risk is reworded, and the
   VM check also looks for "Unable to assign" in the journal.

**agy** (model not reported). The first run failed, verbatim:
`error: Our servers are experiencing high traffic right now, please try again in a minute. (UNAVAILABLE (code 503): No capacity available for model gpt-oss-120b-medium on the server)`.
One retry, with the same prompt, succeeded.

- `HISTORY_TEXT_ROWS` may not resolve in QML (critical). Already a listed risk. **Partly confirmed:** the failure mode
  is now stated correctly (finding 7 above), and the VM check covers it.
- The timer doesn't run while the shell is stopped. **Refuted** as a defect: decision 4 accepts it, and the manual
  says so.
- Old backup commits keep the files. **Refuted** as a defect: decision 5, covered by the release note.
- `parseLive`'s default clock could drift. **Refuted:** `retain` already uses the same clock in production
  (`Service.qml:1321`).
- No secure deletion, and future bumps fail 904. **Refuted** as defects: both are stated in §6 and in Risks, and the
  bump failure is intended.
- `HISTORY_TEXT_ROWS` and `replayCount` could drift. **Refuted:** there is one constant, and `Service.qml` reads it.
- The Node harness wasn't in verification. **Confirmed** for the draft. It is now required (Codex 4).
- No test for quiet-mode rows' exec fields. **Confirmed.** The session test now asserts all five fields on stripped
  quiet-mode rows.
- The timer may save when nothing changed. **Refuted:** `currentHistory` saves only when the row count changed
  (`Service.qml:1322-1325`).
