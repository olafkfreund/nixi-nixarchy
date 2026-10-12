---
status: approved
issue: 90
intent: intent/2026-10-12-90-checked-mechanic-changes.md
---

# Spec: Mechanic's backup, check and undo as guarantees

## What the agents actually do

Read from the adapter sources on 2026-10-12, at the versions the flake's
nixpkgs gives (claude-agent-acp 0.79.0, structure checked against 0.88.0;
codex-acp 1.12.0; opencode 1.18.31):

- **All three ask before writing**, with an ACP `session/request_permission`
  whose `toolCall.locations` names the file. Claude also sends a diff, but for
  Edit only the replaced snippet. Codex sends locations only. OpenCode sends the
  whole file before and after. **The agent process writes the file itself**, so
  the bridge never holds the write. It only holds the moment just before it.
- **"Allow always" for an edit turns the asking off.** Claude switches the
  session to `acceptEdits` ("Yes, allow all edits during this session"). Codex
  stops asking for those files. OpenCode saves an allow-all-edits rule for the
  project, which may outlive the session. After that, edits never reach the
  bridge.
- **YOLO still passes through the bridge.** It answers each request with
  `allow_once` (`bridge/bridge.js:312`), so every YOLO edit is still seen.
- **Shell edits (`sed -i`, `cp`) arrive as `execute` requests** carrying a
  command string, with no path the bridge can trust.
- Claude never uses ACP's client `fs/write_text_file`, so advertising the `fs`
  capability would not route writes through the bridge (see Alternatives).

## Design

A new module, `bridge/changes.js`, sits in the permission path. `bridge.js`
calls it in three places. All decisions on the intent's open questions are
marked **(Q1–Q6)**.

### 1. Back up at the moment of yes

When a permission request is answered with an allow option, in Mechanic, from
the card or from YOLO, and the request's `toolCall.kind` is `edit`, `delete` or
`move`, the bridge first copies every file in `toolCall.locations`. Only then
does it resolve the permission, so the backup always exists before the agent
can write.

- Relative paths resolve against the session `cwd` (`bridge.js:48`).
- A path that is a symlink, or resolves into `/nix/store`, is not copied. The
  card shows "not backed up: managed by home-manager" and the edit proceeds as
  approved. The agent cannot write through a store symlink anyway.
- A file that does not exist yet is recorded as "absent", so undo deletes it.
- Files over 1 MiB are not copied. The card says so, and the edit proceeds,
  since the user already approved it. A backup that fails for any other reason
  (disk full, unreadable) is also reported, never silent.
- The copy goes to `$XDG_STATE_HOME/nixi/changes/<turn>/` (default
  `~/.local/state/nixi/changes`), directories 0700 and files 0600, written with
  the same `wx`-temp-then-rename pattern `appendLearned` uses
  (`bridge/learned.js`). A manifest records path, `existed`, and the sha256
  before.
- Each turn is one change set, so a later change can never overwrite an earlier
  backup.
- **(Q6)** The last 20 change sets are kept; older ones are deleted when a new
  one is created.

When the tool call reports `completed` (`tool_call_update`, matched by
`toolCallId`), the bridge records each file's sha256 after the edit. That is
what undo checks against.

### 2. "Allow always" is not offered for edits in Mechanic

For an `edit`, `delete` or `move` request, the bridge removes `allow_always`
options before sending the request to the card. Every edit then keeps asking,
and so keeps coming through step 1. `reject_always`, and `allow_always` on
every other kind (commands, network, MCP), are untouched.

**This narrows #53 for file edits.** Without it, a single click turns off the
backups for the rest of the session in Claude, and possibly for the project in
OpenCode, and the user is never told. The cost is more Y presses on a change
that touches several files. YOLO stays available for a user who wants no
prompts, and it keeps the backups.

### 3. Check Hyprland at the end of the turn

**(Q2)** Only Hyprland is checked. JSON and other formats come later if they
ever cause trouble.

The first time a turn approves an edit under `~/.config/hypr/`, the bridge
records `hyprctl configerrors` as a baseline. When the turn ends (the same
point where `finishLearned` runs), it runs `hyprctl reload` and
`hyprctl configerrors` again. **Errors that were not in the baseline** mean the
turn broke the config.

**(Q3)** If so, the bridge restores that turn's Hyprland files from step 1
automatically, reloads, and tells the user in the card what it restored and the
error it saw. Comparing with the baseline means errors the user already had do
not trigger a restore. Checking once at the end, not after each edit, means a
change spread over two files is not judged half-done.

If `hyprctl` is missing or fails, the card says the change could not be
checked, and nothing is restored.

### 4. `/undo` needs no agent

**(Q4)** `Conversation.qml`'s `submit()` handles `/undo` like `/guide` and
`/tour` already are (`Conversation.qml:952-962`), sending
`{type: "undo"}` to the bridge. The bridge restores the newest change set not
already undone:

- each file whose sha256 still matches the recorded "after" is restored (or
  deleted if it was "absent" before);
- **any** file that has changed since makes the whole undo refuse, naming the
  file, so a half-undo never happens;
- a Hyprland file restored triggers `hyprctl reload`;
- refused while a turn is running.

The agent can still be asked to "undo it". The skill tells it to point the user
to `/undo`.

### 5. Shell edits and the skill

**(Q1)** Shell commands are not covered. They have no path the bridge can
trust, and package and service changes already have NixOS generations as their
undo. The card says nothing new for them.

**(Q5)** `skills/nixi/SKILL.md` step 5 drops `cp X X.bak-nixi`, which is now
redundant and was the single-slot backup the intent described. It is replaced
by:

- edit files only with the file tools, so Nixi backs them up, never with
  shell commands;
- `/undo` reverts the last change, and Nixi checks Hyprland itself.

## Alternatives rejected

- **Advertise ACP `fs` and do the writes in the bridge.** The strongest
  guarantee, but Claude Code writes files itself and never calls
  `fs/write_text_file`. Covering only OpenCode and maybe Codex is not worth a
  second write path.
- **Back up on the `tool_call` notification instead of on the permission
  answer.** That would also cover "allow always". But a notification is not
  awaited, so the backup races the agent's write and can copy the
  already-changed file.
- **Keep "allow always" and document the gap.** The intent's outcome is a backup
  for every approved edit "whether or not the agent remembered". One click
  silently ending that guarantee contradicts it.
- **omarchy-assistant's engine (the model proposes JSON, a script applies it).**
  It replaces the per-request approval flow that #20, #50 and #53 settled. The
  intent rules that out.
- **Check after every edit.** Would judge a two-file change after the first file
  and restore a change that was fine.
- **Ask before restoring on a failed check.** A newcomer looking at a broken
  desktop is the worst person to ask. The card still shows exactly what was
  restored.

## Risks

- **Codex 1.12 may not ask for edits at all.** Its `read-only` mode is a
  workspace-write sandbox. With `cwd` defaulting to `$HOME`, all of
  `~/.config` is inside the workspace, so Codex may write without a request and
  without a backup. 2.1.1 is truly read-only. This is a coverage gap and possibly
  a broader Mechanic bug ("asks before each change"), to be verified at plan
  time with a live Codex session. If it is confirmed, it gets its own issue and
  the PR says so.
- **Claude may auto-approve some file-system shell commands under
  `acceptEdits`.** This spec stops `acceptEdits` being reached from the card, but
  a user's own Claude settings could set it. Not covered; noted in the skill.
- **More prompts for multi-file edits** (section 2). This is the #53 complaint
  coming back for edits only.
- **An automatic restore undoes a change the user wanted** if the user's config
  had errors the baseline did not capture, for example a reload that fails
  differently. The card names every file it restored, and each change set stays
  in history.
- **Disk:** at most 20 change sets × the files they touched, each under 1 MiB.
- Hosts: any nixarchy machine; `hyprctl` must be on the bridge's PATH, as it
  already is for the agent.

## Verification

1. `bridge/changes.test.js` in a temp HOME:
   - backup before resolve;
   - absent files;
   - symlinks and store paths skipped;
   - the 1 MiB cap;
   - 0700 and 0600 permissions;
   - rotation at 20;
   - undo refuses on a changed file and restores nothing;
   - undo deletes a file that was absent.
2. A bridge test with `fake-agent.js` (`PLEASE_EDIT`, retargeted to a file under
   the temp HOME) and a stand-in `hyprctl` first on PATH. Cases:
   - YOLO and card approvals both back up;
   - `allow_always` is missing from edit requests and present on execute
     requests;
   - a turn that adds a config error is restored and reported;
   - a baseline error alone restores nothing;
   - `/undo` works without an agent message.
3. `cd bridge && node --test` and `python3 -I tools/test_nixi.py` pass;
   `nix flake check` passes in CI.
4. On this machine, at Mechanic with Claude: "put btop on SUPER+ALT+T", then
   `/undo`, then edit `bindings.lua` by hand and `/undo` again (must refuse), then
   ask for a deliberately broken bind (must restore automatically).
5. A live Codex session at Mechanic to settle the Codex 1.12 risk above.
