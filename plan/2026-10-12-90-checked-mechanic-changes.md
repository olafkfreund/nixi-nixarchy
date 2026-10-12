---
status: approved
issue: 90
spec: spec/2026-10-12-90-checked-mechanic-changes.md
---

# Plan: Mechanic's backup, check and undo as guarantees

## Approved decisions (from the spec)

- **Facts this rests on.** All three agents (claude-agent-acp, codex-acp,
  opencode) send `session/request_permission` before writing a file, with
  `toolCall.locations[].path`. The agent writes the file itself, after the bridge
  answers. YOLO answers each request with `allow_once` (`bridge/bridge.js:312`),
  so it still passes through the bridge. "Allow always" on an edit turns later
  requests off. Shell edits arrive as `execute` with a command string only.
- **Backup at the moment of yes.** For a request with `toolCall.kind` in
  `edit | delete | move`, answered with an `allow*` option in Mechanic, from the
  card, YOLO or allow-all-pending, the bridge copies every
  `toolCall.locations[].path` first, and only then resolves the permission.
  - Relative paths resolve against `cwd` (`bridge.js:48`).
  - A symlink, or a path whose realpath is under `/nix/store`, is not copied.
    The user is told "not backed up: managed by home-manager", and the edit
    proceeds.
  - A missing file is recorded as `existed: false`.
  - A file over 1 MiB is not copied; the user is told and the edit proceeds.
  - Any other backup failure is reported, never silent, and the edit proceeds.
- **Storage.** `${XDG_STATE_HOME:-~/.local/state}/nixi/changes/<turn>/`.
  - Directories 0700, files 0600, written as `wx` temp then rename, like
    `appendLearned` (`bridge/learned.js`).
  - One directory per turn; `manifest.json` lists
    `{ path, existed, before, after, backup }`, where `before` and `after` are
    sha256 hashes.
  - The newest 20 turns are kept.
- **After-hash.** When `tool_call_update` reports `completed` for a backed-up
  `toolCallId`, the bridge records each file's sha256.
- **No "allow always" for edits in Mechanic.** The bridge drops `allow_always`
  options from `edit | delete | move` requests before they reach the card.
  `reject_always`, and every other kind, are untouched. This narrows #53 for
  file edits, as approved.
- **Hyprland check at turn end.**
  - On the first backup of a path under `~/.config/hypr/` in a turn, before the
    write, the bridge records `hyprctl configerrors` as a baseline.
  - When the turn ends, it runs `hyprctl reload`, then `hyprctl configerrors`.
  - Error lines not in the baseline: restore that turn's Hyprland files
    automatically, reload, and tell the user what was restored and the error.
  - If `hyprctl` is missing or fails: tell the user the change could not be
    checked, and restore nothing.
  - Only Hyprland is checked.
- **`/undo`**, typed in the card, needs no agent.
  - Restores the newest change set not yet undone.
  - All or nothing: if any file's current sha256 differs from its expected
    value, it refuses and names the file. The expected value is `after`, or
    `before` if no completion was seen.
  - A file that did not exist before is deleted.
  - Reloads Hyprland if a Hyprland file was restored.
  - Refused while a turn is running.
- **Shell edits are not covered.** NixOS generations already undo package and
  service changes.
- **Skill.** `skills/nixi/SKILL.md` step 5 drops `cp X X.bak-nixi`. It tells the
  agent to edit files only with file tools, and that `/undo` reverts the last
  change.

**Clarification made in this plan (not in the spec):** `/undo` works only at
Mechanic. It changes the machine, and Guide's promise is that nothing changes.
At Guide the card answers "Undo changes your machine: type /mechanic first."
This follows the rule that leaving Guide is always typed
(`Conversation.qml:951`).

**Who implements.** Six steps edit files across at least five files, so the
`coder` agent does steps 1–6, started with step 1 and continued with
`SendMessage`. The session model reviews with a fresh Opus agent given this plan
and `git diff`, and does step 7 with the user.

## Steps

1. **`bridge/changes.js` (new) and `bridge/changes.test.js` (new): the store.**
   Export `createChanges({ stateDir, cwd, home, exec })`. `exec(args)` runs
   `hyprctl` with `execFile`, a 5 s timeout and no shell, and resolves
   `{ ok, stdout }`. It is injectable, so the tests pass a stub. Methods:
   - `async backup(toolCall)` → `string[]` notices. Creates the turn directory
     lazily, copies each location, records `before`, and takes the Hyprland
     baseline on the turn's first `~/.config/hypr/` path. Rotates to 20 turns
     when it creates a directory. Never throws: failures become notices.
   - `async completed(toolCallId)` → records `after` for that call's files.
     Unknown ids are ignored.
   - `async endTurn()` → `string[]` notices. Runs the Hyprland check if the turn
     touched Hyprland, then closes the turn so the next backup starts a new
     directory.
   - `async undo()` → `{ ok, message }`.

   Tests, in a temp HOME:
   - the backup exists before `backup()` resolves;
   - a missing file round-trips (undo deletes it);
   - a symlink is skipped, and a path whose realpath starts `/nix/store` is
     skipped (use a stub realpath target, or test the predicate directly);
   - files over 1 MiB are skipped with a notice;
   - modes are 0700 and 0600;
   - rotation keeps 20;
   - undo refuses when one of two files changed, and changes neither;
   - undo after a completed edit restores the bytes;
   - `endTurn`: new error lines restore and report; baseline-only errors leave
     files alone; exec failure gives "could not be checked" and restores
     nothing.

   → verify with `cd bridge && node --test changes.test.js`.
   Traps:
   - No new npm dependency: use `node:crypto`, `node:fs/promises` and
     `node:child_process`.
   - Never follow symlinks: `lstat` before reading, `wx` on temp files, and a
     rename into place.
   - Paths come from the agent. Don't put them in a shell.
   - `nix/package.nix:172-173` ships every non-test `bridge/*.js`
     automatically, so no packaging change is needed. Confirm with
     `nix build .#default` in step 6.

2. **`bridge/bridge.js`: wire it in.**
   - Import `createChanges`. Create one instance near `learnedDir`
     (`bridge.js:388`). Use `stateDir` = `$XDG_STATE_HOME/nixi/changes`, falling
     back to `~/.local/state/nixi/changes`; pass `cwd`, `home`, and an `exec`
     built on `execFile("hyprctl", args, { timeout: 5000 })`.
   - Add `const EDIT_KINDS = new Set(["edit", "delete", "move"]);` and
     `async function guarded(toolCall, outcome, options)`. If the outcome
     selected an option whose kind starts with `allow`, the trust is Mechanic,
     and `EDIT_KINDS.has(toolCall?.kind)`, it awaits `changes.backup(toolCall)`
     and emits each notice as `{ type: "notice", text }`. It returns `outcome`
     either way.
   - `requestPermission` (`bridge.js:295-322`):
     - after `options` is built, if `EDIT_KINDS.has(params.toolCall?.kind)`,
       filter out `kind === "allow_always"`;
     - YOLO branch (`:311-314`): `return guarded(params.toolCall, outcome, options)`;
     - the card branch stores `toolCall: params.toolCall` in the
       `pendingPermissions` entry (`:320`).
   - `answerPermission` (`:456-463`):
     `pending.resolve(guarded(pending.toolCall, select(...), pending.options))`.
     `resolve` adopts a promise, so the agent's write waits for the backup.
   - `allowAllPendingPermissions` (`:546-551`): the same wrapping.
   - `sessionUpdate`, the `tool_call` and `tool_call_update` case (`:278-285`):
     when `update.status === "completed"`, call
     `changes.completed(update.toolCallId).catch(...)`, reporting failures as a
     diagnostic.
   - `prompt()` (`:430`): after `await finishLearned();`, add
     `for (const text of await changes.endTurn()) emit({ type: "notice", text });`.
   - Input handler (`:575+`): add `message.type === "undo"`.
     - Refuse with a notice if `turnRunning`, or if `resolveTrust(trust) === "guide"`
       (the clarification above).
     - Otherwise `changes.undo()` and emit its message as a notice.

   → verify with `cd bridge && node --test` (all existing tests still pass).
   Traps:
   - The #53 tests in `bridge/trust-policy.test.js:310-360` send `write`
     (`PLEASE_WRITE`, kind `edit`) with `FAKE_AGENT_OPTIONS=always`, so two of
     them break by design:
     - "the chosen option reaches the agent" (`:316`). Its `allow-all` case can
       no longer be picked for an edit.
     - "the card is offered every option" (`:329`). It expects four options.

     Switch both to an `execute` request (the `PLEASE_RUN` prompt), where #53
     still holds in full, and add a comment citing #90 for why edits differ.
     The edit side is asserted by step 4(c). Leave the "bogus optionId" and
     "YOLO" tests on `write`, since they still hold for edits. Don't weaken
     any assertion.
   - `permission-detail.test.js` uses `PLEASE_EDIT` with the default two
     options, which has no `allow_always`, so it should be unaffected. Run it to
     confirm.
   - Guide must still cancel before any of this: the `cancel` branch stays
     first.

3. **`bridge/testing/fake-agent.js` and `bridge/testing/run-bridge.js`:
   a real edit.**
   - Fake agent: a new trigger `PLEASE_HYPR`. It sends `tool_call` (pending),
     then `requestPermission` with
     `{ toolCallId: "t4", kind: "edit", title: "Edit bindings.lua",
     locations: [{ path: "<HOME>/.config/hypr/bindings.lua" }] }`. If allowed,
     it writes the text after `PLEASE_HYPR ` in the prompt into that file, then
     sends `tool_call_update` with status `completed`. HOME comes from
     `process.env.HOME`.
   - `runBridge`: an `options.hyprctl` flag writes `bin/hyprctl`, a stub that
     appends `$*` to `<home>/hyprctl.log`. For `configerrors` it prints
     `error: bad bind` only if `bindings.lua` contains `BROKEN`, and the
     contents of `<home>/hypr-baseline-errors` if that file exists.
     `options.files` (path → text) is created under HOME before start.

   → verify with `cd bridge && node --test` (unchanged count, since nothing uses
   them yet).
   Traps: keep `PLEASE_EDIT` and its `/tmp/probe` diff as they are, because the
   permission-detail tests rely on them.

4. **`bridge/changes-bridge.test.js` (new): behaviour through the real bridge.**
   Using `runBridge({ hyprctl: true, files: { ".config/hypr/bindings.lua": "old\n" }, ... })`:
   - (a) Mechanic plus an allow from the card: a backup exists, and
     `bindings.lua` holds the new text.
   - (b) YOLO: same result, with no card prompt.
   - (c) `FAKE_AGENT_OPTIONS=always`: the `permission` event for `PLEASE_HYPR`
     has no `allow_always`; for `PLEASE_RUN` it still does.
   - (d) `PLEASE_HYPR BROKEN`: after the turn, `bindings.lua` is `old\n` again,
     a notice names it, and `hyprctl.log` shows `reload`.
   - (e) A baseline error plus a good edit: nothing is restored.
   - (f) `{type:"undo"}` after (a): the file is `old\n`, and nothing was sent to
     the agent (`agent.log` has no new prompt).
   - (g) Undo after the file was changed by hand: refused, and the file is
     untouched.
   - (h) Undo at Guide: refused.
   - (i) Guide plus `PLEASE_HYPR`: cancelled, no backup directory.

   → verify with `cd bridge && node --test`: all pass.
   Traps: each `runBridge` gets its own temp HOME. Set `XDG_STATE_HOME` through
   `options.env`, or leave it unset so the `~/.local/state` fallback is tested.
   Cover both.

5. **`Conversation.qml`: `/undo` and notices.**
   - `submit()` (`:949-962`): next to `/tour`, handle `/undo`. If `bridgeReady`
     and `agent.running`, write `{type:"undo"}`; otherwise show "Undo needs the
     agent bridge running." Clear the prompt either way.
   - Event handler (`:1191` area): `event.type === "notice"` →
     `showNixiMessage(String(event.text || ""))`.

   → verify by checking how the `role: "Nixi"` body is rendered (find where
   `messages` rows with that role are drawn). If it renders as markdown, the
   bridge must put paths in code spans and strip backticks from them in
   `changes.js` (#42: paths are agent-supplied). Then run
   `python3 -I tools/test_nixi.py` and `nix flake check`; the QML lint is in
   the checks.
   Traps:
   - `/guide` and `/mechanic` deliberately never reach the agent. `/undo` must
     not either, so it must never fall through to `prompt`.
   - The card's other slash commands are matched exactly. `/undo` is too.

6. **Skill and docs.**
   - `skills/nixi/SKILL.md:100-104`: replace "then back up each file first
     (`cp X X.bak-nixi`)," with: "edit files only with your file tools, never
     with shell commands such as `sed -i` or `cp` (Nixi backs up what file tools
     change, and checks Hyprland after the turn);". Replace "report what
     changed plus the one-line undo" with "report what changed and that `/undo`
     reverts it".
   - `README.md:35-36`: rows 6 and 7 say the agent made and restored the
     backup. Reword them to say Nixi keeps the backup and `/undo` restores it.
     Don't touch the screenshots.
   - `docs/architecture.md:155`: add `/undo` beside `/guide` and `/mechanic`,
     and a short paragraph on `bridge/changes.js` with the state path.
   - `docs/testing.md` (Mechanic section, around `:137`): add the manual check
     from step 7.

   → verify with `nix build .#default`, then confirm `changes.js` is in
   `result/…/bridge/`; then `nix flake check`.
   Traps: `tools/test_nixi.py` asserts on parts of `SKILL.md`. Run it after the
   edit and keep any phrases it checks.

7. **Live check on this machine (session model, with the user).**
   - **Claude at Mechanic:**
     - "put btop on SUPER+ALT+T": approve; a backup appears under
       `~/.local/state/nixi/changes/`;
     - `/undo`: the binding is gone;
     - redo the change, edit `bindings.lua` by hand, then `/undo`: refused, and
       the file is named;
     - ask for a deliberately invalid bind: restored automatically, and the card
       names the file and the error.
   - **Codex at Mechanic** (settles the spec's Codex 1.12 risk): ask for the same
     bind. If the file changes with no permission prompt, open an issue
     ("Codex 1.12 read-only writes inside $HOME without asking") and link it
     from the PR. That fix is outside this plan.

## Tests

- `cd bridge && node --test`: all pass (132 existing, adjusted where step 2
  says, plus the new tests).
- `python3 -I tools/test_nixi.py`: "all checks passed".
- `nix build .#default` and `nix flake check`: green locally and in CI.
- Step 7, on this machine.

## Rollback

Revert the implementation commits. The only state created is
`~/.local/state/nixi/changes/`, which nothing else reads; it can be deleted.
With the revert, the skill text goes back to telling the agent to make
`.bak-nixi` copies.
