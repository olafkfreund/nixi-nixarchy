---
status: draft
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
   the `newSession` entry. → verify: existing tests still pass.
4. **`bridge/bridge.js`:**
   - Add `let askBeforeReading = false;`. In `loadSettings()`:
     `askBeforeReading = settings.askBeforeReading === true;`.
   - `OPENCODE_CONFIG_CONTENT` is set at module load, before
     `loadSettings()` runs. Move the OpenCode env assignment so the child is
     spawned after settings are loaded, or read the setting synchronously
     before spawning. Pick the smaller diff when implementing; either way,
     `opencodePermissions(askBeforeReading)` is what goes into the env.
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
10. **PR:** link the intent, spec and plan. Include the before and after
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
`"askBeforeReading": true`.
