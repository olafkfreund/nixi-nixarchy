---
status: approved
issue: 27
spec: spec/2026-09-22-27-read-only-prompts.md
---

# Plan: Mechanic stops asking before read-only lookups

## Approved decisions (from the spec)

- **Cause.** The bridge starts Claude in `~/.config/nixi`. In `default` mode
  (Mechanic), Claude asks for every `Read`, `Grep` and `Glob` outside that
  directory, and the bridge shows each request.
- **Fix.** Claude Code decides, from its own tool names, using permission
  rules Nixi passes in `newSession` as `_meta.claudeCode.options.settings.permissions`.
  claude-agent-acp 0.79.0 reads that channel. The bridge does not trust the
  ACP `kind` and does not auto-answer anything. `requestPermission` is
  unchanged.
- **Rules**, from `claudePermissions(askBeforeReading)` in
  `bridge/trust-policy.js`:
  - `allow: ["Read", "Grep", "Glob"]`, or `[]` when `askBeforeReading`.
  - `ask`, always: `Read(~/.ssh/**)`, `Read(~/.gnupg/**)`, `Read(~/.aws/**)`,
    `Read(~/.kube/**)`, `Read(~/.config/gh/**)`, `Read(~/.config/op/**)`,
    `Read(~/.config/sops/**)`, `Read(~/.local/share/keyrings/**)`,
    `Read(~/.claude/.credentials.json)`, `Read(~/.netrc)`,
    `Read(/run/agenix/**)`, `Read(/run/secrets/**)`, `Read(**/.env)`,
    `Read(**/.env.*)`, `Read(**/*.age)`.
  - Nothing else is allowed. Bash (including `grep`/`ls`), Edit, Write,
    NotebookEdit, WebFetch, WebSearch and MCP tools keep asking.
- **Setting.** `"askBeforeReading": true` in `~/.config/omarchy/nixi.json`
  brings back "ask for everything". Only `true` counts. It is read at
  session start, with no live toggle and no slash command. When it is set,
  OpenCode's `read`, `grep`, `glob` and `list` also become `"ask"`.
- Guide, YOLO, Codex and the permission dialog are unchanged.
- **Docs.** Remove the #27 notes from `README.md` and `docs/index.html`, and
  describe the new behaviour and the setting.

## Revision (2026-09-22): lookups through file tools

Step 9 on razer showed Claude doing every lookup in the shell (4 Bash
prompts, no Read, Grep or Glob calls). The approved spec revision
(option A) adds this: Nixi's skill and briefs tell the agent to look at
files with its file tools, never with `cat`, `ls`, `grep`, `head`, `tail`
or `find` in a shell. The shell stays for real commands
(`omarchy menu keybindings --print`, `hyprctl`, `nixarchy-plugin`), each run
on its own, without pipes or `;`. The rule names kinds of tool, not
Claude's tool names, because the skill is shared with Codex and OpenCode.
The expected result on razer is about 2 prompts: the key list and the edit.
Steps 1–8 stand. Steps 11–14 are new, and step 9 is re-run as step 13.

## Steps

1. **`bridge/trust-policy.js`:** add `export function claudePermissions(askBeforeReading)`
   returning `{ allow, ask }` as above. Add
   `export function opencodePermissions(askBeforeReading)`, which returns
   `OPENCODE_PERMISSIONS` unchanged when false, and a copy with `read`,
   `grep`, `glob` and `list` set to `"ask"` when true. Keep the
   `OPENCODE_PERMISSIONS` export. Comment why reads are allowed and secrets
   ask. → verify with step 2's tests.
2. **`bridge/trust-policy.test.js`:** add unit tests:
   - `claudePermissions(false).allow` deep-equals `["Read","Grep","Glob"]`.
   - `claudePermissions(true).allow` is `[]`.
   - Both have the full `ask` list, and neither `allow` names `Bash`,
     `Edit`, `Write`, `NotebookEdit`, `WebFetch` or `WebSearch`.
   - `opencodePermissions(false)` is `OPENCODE_PERMISSIONS`.
   - `opencodePermissions(true)` has `read`, `grep`, `glob` and `list` as
     `"ask"`, and every other key unchanged (`*` ask, `plan_exit` deny).

   → verify: `cd bridge && node --test ./trust-policy.test.js` passes.
3. **`bridge/testing/fake-agent.js`:** log `meta: params._meta ?? null` in
   the `newSession` entry. Offer a `model` config option in the default
   session, as Claude's adapter does, so a test with `NIXI_MODEL` can reach
   `ready`. *(Added during implementation: without it, `applyRequestedModel`
   stops the run.)* → verify: existing tests still pass.
4. **`bridge/bridge.js`:**
   - `const askBeforeReading` is read once, synchronously, from
     `nixi.json` at module load (only `true` counts). *(Revised during
     implementation: this was the smaller of the two options, and it
     replaces reading the setting in `loadSettings()`. The OpenCode child is
     spawned at module load, before `loadSettings()` runs, and the rules
     are fixed per session anyway.)*
   - `OPENCODE_CONFIG_CONTENT` = `opencodePermissions(askBeforeReading)`.
   - In `newSession`, for `agentName === "claude"`, always send
     `_meta.claudeCode.options.settings.permissions = claudePermissions(askBeforeReading)`.
     When `NIXI_MODEL` is set, keep `options.model`, `settings.model` and
     `settings.availableModels` as today, in the same object.

   → verify with step 5's tests.
5. **`bridge/trust-policy.test.js`, bridge behaviour tests** (with
   `runBridge`):
   - Claude, no settings: the `newSession` log entry's
     `meta.claudeCode.options.settings.permissions` equals `claudePermissions(false)`.
   - Claude, `settings: { askBeforeReading: true }`: equals `claudePermissions(true)`.
   - Claude with `env: { NIXI_MODEL: "x" }`: permissions are present and
     `settings.model` is `"x"`.
   - OpenCode (`env: { NIXI_AGENT: "opencode" }`) with
     `askBeforeReading: true`: the logged `opencodeConfig` has `read` set to
     `"ask"`. Without the setting it equals `OPENCODE_PERMISSIONS`, which is
     the existing test.

   → verify: `cd bridge && node --test ./*.test.js` passes.
6. **`README.md`:**
   - Scene 5 (line 34): replace "Mechanic also asks before read-only
     lookups (#27)" with "Looking at files doesn't ask, except for secrets
     such as `~/.ssh`."
   - Trust section: add a paragraph under the table covering what Mechanic
     reads without asking (Claude's Read, Grep and Glob), what still asks,
     and `"askBeforeReading": true` in `~/.config/omarchy/nixi.json` to be
     asked for every read (applies from the next session).
   - The spec says "the README's settings table", but the README has no
     settings table. This paragraph is where the setting is documented.

   → verify: `grep -n "issues/27" README.md` finds nothing.
7. **`docs/index.html`:** the same change to the note at line 140, and one
   sentence in the "Guide and Mechanic" section. → verify: `grep -n
   "issues/27" docs/index.html` finds nothing, and the page renders (open
   it locally).
8. **Full suite:** `node --test bridge/*.test.js` and
   `python3 tools/test_nixi.py`. → verify: both pass. Fix anything that
   pins the old README text.
9. **razer, through the card** (needs Nixi from this branch on razer; ask
   before rebuilding):
   1. Guide, before the change: "put btop on SUPER+ALT+T". Record the
      `Guide · not run: …` status lines.
   2. With the change, Mechanic: the same request raises one prompt (the
      edit), not five or six.
   3. Mechanic: "show me ~/.ssh/config" raises a prompt.
   4. `"askBeforeReading": true`, new session: step 2 prompts for reads
      again.
   5. Guide with the change: nothing is written. Record what it now reads,
      for the PR.
   6. Codex in Mechanic, if installed on razer: count its prompts for the
      same request. If it floods, file a new issue.

   → verify: record the results in the PR description.

   *Result (implementation), 2026-09-22:*
   - **p620, real claude-agent-acp 0.79.0 through this bridge in Mechanic**
     (scratch HOME and Claude config, every prompt denied): a Read of
     `~/.config/hypr/atmos.lua` plus a Read of a dummy `~/.ssh/config` gave
     **1 prompt** (ssh only; the hypr read returned the file). With
     `askBeforeReading: true` it gave **2**. The rules work as specified.
   - **razer, through the card** (plugin link swapped to this branch's
     build with razer's adapters; ai-mirror over SSH):
     - Old build, Guide: no prompt shown. Reads ran, because plan mode
       allows them; one cancelled request, the plan-approval step. So the
       spec's "Guide reads more" risk does not happen: Guide already reads.
     - **New build, Mechanic: 4 prompts before any edit, all Bash**
       (`omarchy menu keybindings --print | grep …; ls …; grep …`,
       `grep … | head; tail …`, `grep -rn …`, `grep -rln … /`). There were
       no Read, Grep or Glob tool calls, so the new rules never applied.
       Stopped at the fourth (a recursive grep of `/`, denied).
     - razer restored: link and `nixi.json` match the saved copies,
       `bindings.lua` md5 unchanged, control released.
   - **Outcome not met.** Claude's lookups on razer go through the shell,
     not its read tools. **Stopped for a spec revision.**
11. **`skills/nixi/SKILL.md`, Method step 1:**
    - Add as the first bullet: "**Look with file tools, not the shell.**
      Read, list and search files with your file-reading and search tools
      (in Claude: Read, Grep, Glob). Never use `cat`, `ls`, `grep`, `head`,
      `tail` or `find` in a shell for that. Use the shell only for commands
      that have no file equivalent (`omarchy menu keybindings --print`,
      `hyprctl`, `nixarchy-plugin`), one command per call, with no pipes or
      `;`. In Mechanic every shell command needs the user's yes; file tools
      do not."
    - Replace `ls /usr/share/omarchy/bin | grep -i <topic>` with "the
      commands in `/usr/share/omarchy/bin` (list them with your file tools)".
    - In step 2, `test -d ~/.config/omarchy/plugins/<id>` becomes "whether
      `~/.config/omarchy/plugins/<id>` exists (check with your file tools)".

    → verify: `grep -nE '\| *grep|ls /usr|test -d' skills/nixi/SKILL.md`
    finds nothing.
12. **`share/CLAUDE.md` and `share/AGENTS.md`**, short version: after
    "Verify keybindings live (…)", add: "Look at files with your file tools
    (read, search, list), not `cat`/`ls`/`grep` in a shell; run real
    commands one at a time, without pipes."

    **`tools/test_nixi.py`**: add `test_lookups_use_file_tools`. It checks
    that the skill and both briefs contain "file tools", and that the skill
    has no shell pipe in a lookup instruction (no `| grep`, no `ls /usr`).

    → verify: `python3 tools/test_nixi.py` passes.
13. **razer again**, as step 9 (a fresh build with razer's adapters, `nix
    copy`, swap the plugin link **and** the Home Manager links the change
    touches: `~/.config/nixi/{CLAUDE,AGENTS,SKILL}.md` and
    `~/.claude/skills/nixi/SKILL.md`; save every `readlink` first). In
    Mechanic, "put btop on SUPER+ALT+T": record every prompt, allow
    read-only commands, deny the edit.

    → verify: no prompt is a `cat`/`ls`/`grep`/`head`/`tail`/`find` lookup;
    about 2 prompts (key list and edit). Then restore every link and
    `nixi.json` from the saved copies, check with `readlink`/`cmp`, check
    that the `bindings.lua` md5 is unchanged, and release control.

    If Claude still uses the shell for lookups: stop, record it here, and
    go back to the spec. Do not iterate on the wording more than once
    without asking.

    *Result (implementation), razer 2026-09-22, build `l0hdwcm9…` with
    razer's adapters, 5 links swapped, Claude in Mechanic:*
    1. `omarchy menu keybindings --print`: a single command, expected. Allowed.
    2. `grep -rn "Activity" ~/.local/share/omarchy/default/hypr/ --include=*.lua`:
       **a shell lookup the rule should have prevented.** It was a single
       command with no pipes. Allowed.
    3. `Edit ~/.config/hypr/bindings.lua`, the change. Denied.

    The Read of `bindings.lua` that Edit requires ran **without a prompt**,
    so the allow rule applies once the agent uses its file tools. Total: 3
    prompts, against 5–6 in the report and 4 or more (all piped Bash) on
    the first build. **Partial pass:** one lookup still went through the
    shell. razer restored: 5/5 links and `nixi.json` match the saved
    copies, `bindings.lua` md5 unchanged, control released. Stopped for a
    decision; see step 14.
14. **Docs:** if step 13 passes, the README and site wording from steps
    6–7 stands. If it passes only in part, say so plainly in the README
    ("most lookups no longer ask").
10. **PR:** (run last, after 14) link the intent, spec and plan. Include the before and after
    prompt counts, the Guide read comparison (spec Risks), and the Codex
    count. Close #27.

## Tests

```sh
cd bridge && node --test ./*.test.js    # all pass, including the new ones
cd .. && python3 tools/test_nixi.py     # passes
```

Plus the manual razer checks in step 9.

## Rollback

Revert the PR. Without the `_meta` permissions, Claude goes back to asking
for every read outside `~/.config/nixi`, which is today's behaviour. Nothing
is written to disk except the optional `askBeforeReading` key, which older
builds ignore. For an immediate per-machine rollback without a revert, set
`"askBeforeReading": true`. For Claude that is exactly today's behaviour.
For OpenCode it is stricter than today, because its reads ask too.

## Review round (2026-09-22, PR #34)

Three review threads from Copilot, all valid, fixed in one commit:

1. **Cloud credentials were not all covered.** `~/.config/gcloud/**`,
   `~/.azure/**` and `~/.docker/config.json` join the always-ask list, so
   the README's "cloud and GitHub credentials" claim holds. The unit test
   checks the gcloud and Azure paths.
2. **`askBeforeReading` did not survive a UI settings change.**
   `Ask.qml`'s `flushSettings()` rebuilt `nixi.json` from the UI's keys
   only. That dropped `askBeforeReading`, and `trust` too, both of which
   only the bridge writes. It now writes on top of the file as last read
   (`settingsOnDisk`). `test_settings_keep_bridge_keys` guards this.
3. **The skill said file tools never prompt.** It now adds "unless the user
   has set `askBeforeReading`".
