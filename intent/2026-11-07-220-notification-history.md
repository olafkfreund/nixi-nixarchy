---
status: draft
issue: 220
author: olafkfreund
---

# Intent: Say what the shell's notification history keeps, and keep less of it

From the #212 spec (`spec/2026-11-07-212-chat-replies.md`, finding 3 on `docs/212-chat-replies-b`): "the shell stores
the full `rawBody` and `execArgv` of every notification in `history.json`".

## Problem

The Omarchy shell writes the text of the user's notifications to disk, and nothing tells the user it does.

Facts, checked on 2026-11-07. Code is the installed shell, `omarchy-edge-20261104-cc99764`, under
`share/omarchy/shell/plugins/notifications/`. `Store.js` matches upstream `basecamp/omarchy@cc99764`.

- **Where it is.** `~/.local/state/omarchy/notifications/history.json`, not `~/.local/share` (`Service.qml:1275`,
  `:1403`). The directory is `700` and the file `600`. Both are forced at every shell start (`Service.qml:1424-1431`),
  and writes are atomic (`:1404`). Today it is 37,639 bytes. Two files sit next to it:
  - `live.json` holds the cards on screen, restored after a restart. It stores the same fields, with a 16,384-character
    row budget (`Store.js:154`), and up to 100 rows (`Store.js:206-213`). Loading it applies no age limit
    (`Service.qml:1358-1366`), and a restored critical card has no timeout (`Store.js:135`). Today it is 464 bytes.
  - `quiet.json` holds only the do-not-disturb flag.
- **What each entry keeps.** The fields are `key`, `originalId`, `senderPid`, `execArgv`, `execActions`, `glyph`, `app`,
  `appIcon`, `summary`, `body`, `rawBody`, `source`, `groupKey`, `urgency`, `expireTimeout`, `duration` and `ts`, plus
  `closed_ts` and `closed_reason` (`Store.js:161-162`, `:184-189`). The issue names `rawBody` and `execArgv`, but
  `summary` and `body` hold the message too.
  - `rawBody` is dropped when it equals `body` (`Store.js:171`).
  - The text is cut only once a row passes 4,096 characters (`HISTORY_ROW_CHARS`, `Store.js:155`, `:172-176`). So in
    practice the whole message is kept.
  - `execArgv` and `execActions` come from the `omarchy-exec-argv` and `omarchy-actions` hints (`Store.js:37-45`).
    Any sender can set these hints. The name doesn't prove the notification came from Omarchy. They are kept unless the row is still over 4,096 characters after the body is cut
    (`Store.js:177`). In today's file, 3 of 100 rows have a non-empty `execArgv`.
  - Codes, links and images are never stored (`Store.js:158-160`).
  - A notification that looks like it carries a code is stored only as a placeholder, with every string field cleared
    (`sanitiseForPersistence`, `Store.js:287-306`). Transient notifications aren't stored at all
    (`Service.qml:1285-1294`), and ephemeral ones are kept out of the quiet and delegated writes (`:684`, 903).
- **How much, how long.** The newest 100 rows, and up to 24 hours after each row *closed* (`closed_ts`), whichever
  limit is hit first (`Store.js:149-151`, `:191-198`).
  - The 24 hours is only applied when something happens: a new history row (`Store.js:200-201`), a shell start
    (`Service.qml:1371`) or the replay key (`:1320-1325`, `:1477`). No timer runs it.
  - A shell that is stopped, or gets no notifications, leaves older text on disk for as long as that lasts.
  - Today's 100 rows span about 63 minutes, so on this machine the count is what limits it.
- **Who writes it.** Upstream Omarchy, the notification store in `Store.js` and `Service.qml`. A closed card is recorded
  through `storeRecord` (`Service.qml:1312-1317`). A notification held back by quiet mode is written straight to history,
  with no popup (`Service.qml:681-684`). nixarchy's `pkgs/omarchy/903-notification-delegate.patch`
  (nixarchy@cad0d36, patch lines 141-165) adds one more path: a row handed to the companion is written straight away
  with `closed_reason: "delegated"`. In today's file, 97 of 100 rows are `delegated`, 2 `expired` and 1 `dismissed`.
  The patch adds a writer but doesn't change what is stored. `902-notification-sender-close.patch` doesn't touch history.
- **Who reads it.**
  - The shell: at start (`Service.qml:1370-1373`), and in the history replay key, which shows the last 6 rows again as
    cards (`Service.qml:1471-1480`). Clicking a replayed card runs its stored `execArgv` first
    (`Service.qml:1177-1185`). Without one, the click falls back to the sender's window, its site, a link or the app
    (`:1187-1198`). `execActions` are the card's buttons (`:1021-1026`).
  - Nixi: no code in this repo reads it (grep for `history.json`, `rawBody` and `execArgv`, outside `intent/`, `spec/`
    and `plan/`). `plan/2026-10-30-133-proactive-companion-b.md:156` plans a read of `ts` only, capped at 2 MiB.
- **Backed up or synced.**
  - nixarchy's `nixarchy home backup` allowlists `.local/state/omarchy/` and excludes `clipboard-history.json`,
    `current/theme/`, `done/` and `agents/` (`pkgs/omarchy/nix-bin/nixarchy-home-backup:78-104`). It does **not**
    exclude `notifications/`. That list is the shipped default (`shipped_list`, `:57-108`), and a user's `backup.list`
    only adds to it (`:118`). So a backup run copies `history.json` and `live.json` into its git repository. Whether it
    then pushes them depends on how the user set up the repository; that part of the script wasn't checked.
  - On this host it isn't set up: there is no repository at `~/.local/share/nixarchy/home-backup` and no
    `~/.config/omarchy/backup.list`.
  - Syncthing runs here, but only for `~/.claude` and `~/.gemini`.
  - `/home` is ext4, with no snapper configs.

So the files are private to the user, and history is usually short-lived. The problems:

- The design isn't stated anywhere a user reads.
- Most of the stored text is never read back. The only thing that reads it is the 6-card replay.
- "24 hours" isn't a guarantee. It only applies when one of the events above happens, and `live.json` has no age limit.
- One nixarchy tool would carry both files off the machine.

## Proposed outcome

- What `history.json` and `live.json` keep, for how long and why is written down where a user looks, and matches the
  code.
- History holds no more message text than the replay needs. The bodies of rows nobody will replay don't stay on disk
  for a day.
- The retention a user is told about holds even when the shell is idle or stopped, or the docs say plainly when it
  doesn't.
- `nixarchy home backup` doesn't carry `notifications/` off the machine, the same as `clipboard-history.json`.
- The shell's own features still work: the replay key, a replayed card's click, quiet mode, and the companion handover
  (#133).

## Affected users and systems

- **nixarchy** (`olafkfreund/nixarchy`) is where the fix belongs:
  - `pkgs/omarchy/` for any patch to upstream `Store.js` or `Service.qml`, next to 902 and 903;
  - `pkgs/omarchy/nix-bin/nixarchy-home-backup` and `tests/home-backup-restore.nix` for the exclusion;
  - `docs/manual/` and `modules/secrets.md`, which already describe the clipboard file, for the note.
- **Upstream Omarchy** (`basecamp/omarchy`) owns `Store.js`. A change it accepts would retire a nixarchy patch.
- **Nixi** (this repo): no code change. This intent is the record. Any future Nixi reader of `history.json` must stay at
  `ts` only.
- **The companion** (`nixoarchy-snowflake`) gets delegated rows over IPC, not from the file. Whether any of its code
  reads `history.json` is unverified: a GitHub code search returned nothing, and the index may be incomplete.
- **Hosts:** every nixarchy machine running the shell. An existing `nixarchy home backup` repository may already hold
  copies.

## Constraints

- Must not break the replay key or what a replayed card does when clicked (`Service.qml:1177-1198`). Dropping
  `execArgv` from history costs that click its command. It then falls back to focusing the sender's window or app.
- Must not change the 903 handover contract or the `closed_reason` values that nixarchy's session test checks
  (`tests/session.nix:1145-1196`).
- Must keep the protections already there: code-bearing rows as placeholders, transient rows never stored, and links
  and images never stored.
- The file stays `600` in a `700` directory, and is never logged or printed. Investigations count fields and never
  read the text.
- No change to Nixi's privacy claim ("Nixi never writes notification text"): that is true today, and stays true.
- Shipping is a nixarchy PR, approved there. The user's host needs a rebuild to pick it up, and only the user runs
  that.

## Open questions

1. **How much text should history keep?** (a) Keep as is and document it. (b) `summary` and a short `body` (for
   example, 200 characters, as the companion row is at `Service.qml:706`), no `rawBody`. (c) Only the newest few rows
   (the replay's 6) keep text; older rows keep metadata only. (d) No text at all.
   *Recommendation: (c), since it keeps the replay whole and leaves 94 of 100 rows text-free. Second choice: (b).*
2. **Keep `execArgv` and `execActions` in history?** Any sender can set them, they are rare (3 of 100), and they give a
   replayed card its exact click and buttons. *Recommendation: keep them only on the rows that keep text (the same cut
   as in 1), and drop them from the rest.*
3. **Is `live.json` in scope?** It stores the same fields with a larger budget and no age limit, but it is what brings
   the cards on screen back after a restart. *Recommendation: yes, for documentation and an age limit on load. Its
   text stays, since a card on screen needs it.*
4. **Should retention be enforced on a timer, or only documented as "applied on the next notification, start or
   replay"?** *Recommendation: documented, plus applied on load (already done). Add a timer only if the spec finds one
   is cheap.*
5. **Exclude `notifications/` from `nixarchy home backup`, and what about copies already backed up?**
   *Recommendation: exclude it, as `clipboard-history.json` is. The release note tells users of the backup that older
   commits may hold it. On this host, no backup repository exists.*
6. **Where does the fix go?** *Recommendation: nixarchy first, as a new patch next to 903, plus the backup exclusion and
   a manual note. Offer the `Store.js` change upstream to `basecamp/omarchy` too, and drop the patch if it lands. A
   separate nixarchy issue tracks it, and this one closes when that issue does.*

## Reviews (2026-11-07, read-only, advice only)

**Codex** (`gpt-6.1-sol`). It couldn't read the nixarchy clone and worked from the excerpts.

1. The 24 hours isn't enforced by a timer. **Confirmed** (`Store.js:193-201`, `Service.qml:1320-1371`). Applied.
2. `live.json` is a second text store with no age limit. **Confirmed** (`Store.js:135`, `:154`; `Service.qml:1358-1366`).
   Applied as open question 3.
3. The draft left out the existing redaction and transient exclusions. **Confirmed** (`Store.js:287-306`,
   `Service.qml:1285-1294`). Applied to the problem and the constraints.
4. The draft left out the quiet-mode writer. **Confirmed** (`Service.qml:681-684`). Applied.
5. The draft overstated `execArgv`: the click has fallbacks, and any sender can set the hint. **Confirmed**
   (`Service.qml:1187-1198`, `Store.js:37`). Applied.
6. The backup outcome left out copies already backed up. **Confirmed** as a gap. It's open question 5.
7. The draft made implementation choices too early. **Partly confirmed:** the patch-flag constraint was dropped. The
   options with recommendations stay as open questions, for the approver to decide.

**agy** (model not reported). It read the excerpts only, with no shell.

- It confirmed the field, size, retention, permission and replay citations.
- Its "critical" point was that backing up depends on the user's `backup.list`. **Refuted:** `.local/state/omarchy/` is
  in the shipped list (`nixarchy-home-backup:57-78`), and `backup.list` only adds to it (`:118`).
- The live-only values, today's file size and the `execArgv` count, are **unverified** by the reviewers. They were
  measured on the host by counting fields only.
