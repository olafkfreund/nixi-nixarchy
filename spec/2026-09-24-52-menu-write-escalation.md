---
status: approved
issue: 52
intent: intent/2026-09-24-52-menu-write-escalation.md
---

# Spec: A write that will later run unattended is denied, not merely asked about

## Summary of what changed between intent and spec

The intent proposed an `ask` rule on `Write`/`Edit` to the menu path. Reading the
code says that rule would do nothing at all, and that the menu file is not the
worst instance of its own shape. Both findings are below, with the evidence.

## Finding 1: an `ask` rule is a no-op here

Mechanic maps to Claude's `default` mode (`bridge/trust-policy.js:31`). In that
mode every `Write`/`Edit` already produces a permission request -- the bridge's
own behavioural test asserts it (`bridge/trust-policy.test.js:51-61`: a write in
Mechanic yields a `permission` event).

The scenario in #52 *is* an approved write. Adding `ask` to a path that already
asks produces the identical card the user already said yes to. It would read in
the diff as a fix and change nothing about what happens.

This is the difference from `SECRET_PATHS`. That list is not `ask` for its own
sake -- it is `ask` *against a standing `allow`* (`claudePermissions()` grants
`Read`/`Grep`/`Glob` wholesale, and the secret rules claw paths back out of that
allow). There is no equivalent write allow to claw back from. The read side had
an over-permission to correct; the write side does not.

So the only rule that changes behaviour is `deny`. Precedence is already
documented in this file: "Claude checks deny > ask > allow across all settings
sources" (`trust-policy.js:69`).

## Finding 2: the menu file is not the worst instance, and two others outrank it

Enumerated across the repo (answering the intent's open question 2). Ranked by
"fires with no user action" and "nothing covers it today".

### 2a. Agent settings inside the agent's own cwd -- worse than #52

`bridge/bridge.js:41-44` starts the agent with `cwd = ~/.config/nixi`, so Claude
Code treats that directory as its project scope. **No `settingSources`
restriction is set anywhere in the bridge** (verified: no occurrence in
`bridge/*.js`), and `nix/hm-module.nix:175-179` manages only five leaf files
under `nixi/` -- `faq.json`, `KNOWLEDGE.md`, `CLAUDE.md`, `AGENTS.md`,
`SKILL.md`. It does not manage `nixi/.claude/`.

So `~/.config/nixi/.claude/settings.local.json` and `~/.config/nixi/.claude/hooks/**`
are unmanaged, writable, and inside the agent's working directory. A write there
is the agent editing *its own permission rules*, or installing a `PreToolUse`
hook, which is a shell command that runs with no permission request. It takes
effect on the next card open, because each open spawns a fresh session.

This is the same shape as #52 and strictly worse: #52 escalates to running
commands, this escalates to *rewriting the thing that decides whether commands
need approval*. It is also the likeliest path to be taken accidentally, because
the agent's cwd is where it naturally writes files.

### 2b. Omarchy hook directories -- uncovered in both deployments

`~/.config/omarchy/hooks/post-boot.d/` and `post-update.d/` are executed in full
by Omarchy's hook runner. `nix/hm-module.nix:272-277` manages the two hook
*files this repo ships, by name* -- it does not manage the directories, so a
third file dropped beside them is unmanaged in the Nix install too.
`install.py:468-470` creates both directories 0755 on the non-Nix path.

`post-boot.d` runs at every boot. No click, no reload, and it is the only
finding uncovered in *both* deployment shapes.

### 2c. The menu file itself (#52 as filed) -- confirmed

All three claims verified: `MenuSearch.qml:57` (`userMenuPath`), `:528-536`
(`watchChanges: true`, `onFileChanged: reload()`), `:551`
(`guardProc.command = ["bash","-lc",script]`). `rebuild()` calls
`evaluateGuards()` unconditionally, so it fires on write with no user action.
The source comment at `:543` states it plainly: "`when:` and `checked:` are bash."

A second sink on the same file, not in the issue: `MenuSearch.qml:389` passes
`row.action` to `Util.execDetached`, which is
`Quickshell.execDetached(["bash","-lc", command])`. That one needs the user to
pick the row, but the row's label is attacker-chosen, so it can be disguised.

Partly covered today: with `services.nixi.menuEntry.enable = true`,
`nix/hm-module.nix:217-228` makes this path a store symlink. With
`menuEntry.enable = false`, or an `install.py` install, it is a plain writable
file.

### 2d. Plugin bridge scripts, `~/.local/bin`, user units -- `install.py` only

`~/.config/omarchy/plugins/<id>/bridge/*.js` are launched as `["node", path]`
with `running: true` (`MenuSearch.qml:28-32`, `:494-498`), i.e. on card load.
`~/.local/bin/nixi-watch` runs at every login via
`systemd/nixi-watch.service:34` (`WantedBy=graphical-session.target`), and
`nixi-manual.timer` weekly.

Both are store symlinks under Nix (`hm-module.nix:171`, `:243`, `:257`) and
plain writable files under `install.py` (`:309`, `:317-319`, `:441`).

### 2e. `nixi.json` -> `fileOpenCommand` argv

`Ask.qml:225-236` watches `~/.config/omarchy/nixi.json`; `Conversation.qml:606-609`
builds argv from `fileOpenCommand`/`fileEditCommand` and calls `execDetached`.
`normalizeCommand` (`Ask.qml:199-204`) only stringifies -- argv[0] is
attacker-controlled, so `["bash","-c","..."]` works. Needs the user to activate
a `@` file row. Uncovered in both deployments.

### 2f. Deliberately NOT covered: `~/.config/hypr/**`

This is the case that decides the shape of the rule, so it is recorded rather
than omitted.

Hyprland config executes commands, and by the naive principle "deny writes to
things that execute" it would be denied. It must not be:

- `~/.config/hypr/bindings.lua` is the README's flagship Mechanic demo
  (`README.md:35`: "One line is added to `~/.config/hypr/bindings.lua`").
- `skills/nixi/SKILL.md:90` instructs the agent to edit `~/.config/hypr/*.lua`
  and `~/.config/omarchy/` as ordinary work.

So "executes" is the wrong dividing line -- it would ban the product's purpose.
The property that separates the menu guard from a keybinding is **who pulls the
trigger**:

- **User-invoked**: a keybinding runs when the user presses the key; a menu row
  runs when the user picks it. The user is present and acting. Keep asking.
- **Unattended**: a `when:` guard runs on the next reload; a `post-boot.d` hook
  runs at boot; a `PreToolUse` hook runs on the agent's next tool call. Nobody
  pulled anything. This is the escalation.

Residual risk, stated plainly: `exec-once` in a Hyprland config *is* unattended,
and lives in a file we are choosing not to deny. A path-based rule cannot split
`bind = ... exec` from `exec-once` in the same file. Accepted, because denying
the file breaks the headline feature, and recorded as a known gap.

## Design

One new path list in `bridge/trust-policy.js`, generated over the write tool
names, exactly as `SECRET_PATHS` is generated over `READ_TOOLS`:

```js
export const EXEC_WRITE_PATHS = [
  "~/.config/nixi/.claude/**",          // 2a: the agent's own settings and hooks
  "~/.claude/settings.json",            // 2a: user-scope settings
  "~/.claude/settings.local.json",
  "~/.claude/hooks/**",
  "~/.config/omarchy/hooks/**",         // 2b: runs at boot / at update
  "~/.config/omarchy/extensions/**",    // 2c: #52 as filed
  "~/.config/omarchy/plugins/**",       // 2d: runs on card load
  "~/.config/omarchy/nixi.json",        // 2e: fileOpenCommand argv
  "~/.local/bin/**",                    // 2d: runs at login
  "~/.config/systemd/user/**",          // 2d: units and drop-ins
];

const WRITE_TOOLS = ["Write", "Edit", "MultiEdit", "NotebookEdit"];
const EXEC_WRITES = WRITE_TOOLS.flatMap((tool) =>
  EXEC_WRITE_PATHS.map((path) => `${tool}(${path})`));
```

and `claudePermissions()` gains `deny: EXEC_WRITES`. It already flows through
untouched -- `bridge/bridge.js:261` passes the whole object as
`settings.permissions`.

Paths, not rules, and generated over the tool list, for the reason #41 records:
Claude matches per tool name, so a hand-written `Write(...)` list would leave
`Edit` free to reach the same paths. `MultiEdit` and `NotebookEdit` are named
because naming a tool that does not exist costs nothing, while omitting one that
does is exactly the #41 bug.

`deny`, not `ask`, per Finding 1.

### Scope: Claude only

- **Codex** is `read-only` at both trust levels (`trust-policy.js:32`), so it has
  no write to deny.
- **Guide** cancels every request it receives, at every trust level, for all
  three agents. Unaffected, and the tests must keep proving it.
- **OpenCode** is deliberately left alone. Its rules already resolve writes to
  `"*": "ask"` (`trust-policy.js:44`), so the Finding 1 no-op argument applies
  there too, and its schema's support for per-path `edit`/`write` globs is not
  something this repo has verified. Inventing a config key that silently fails
  to match would look like coverage while providing none -- worse than an
  honest gap. Recorded as follow-up, not smuggled in unverified.

## Alternatives rejected

- **`ask` on the menu path** (the intent's proposal). A no-op: Mechanic already
  asks for every write. Finding 1.
- **A `PreToolUse` hook that inspects the write.** Excluded by the intent's own
  constraint and by #41's reasoning: a second enforcement mechanism beside the
  settings-based one, when settings can express the rule. It is also circular
  here -- 2a is *about* an agent being able to write hook config.
- **Naming only `~/.config/omarchy/extensions/**`.** Fixes the reported instance
  and leaves 2a and 2b, both of which fire with less user involvement. The
  intent explicitly warns against this ("a fix that only names one path will be
  wrong again the next time").
- **Denying everything that executes, including `~/.config/hypr/**`.** Breaks
  the flagship demo and contradicts `SKILL.md:90`. See 2f.
- **Changing `MenuSearch.qml` to stop running guards, or to sandbox them.** The
  intent rules this out: the guard mechanism is a legitimate feature for a file
  the user owns, and is not what is wrong.
- **Making the permission card explain *why* a path is sensitive.** The intent's
  open question 3 -- agreed it belongs with #50's rendering work, not here.

## Known limitation, stated rather than glossed

A `deny` on `Write`/`Edit` does not stop `Bash("echo ... >> ~/.config/omarchy/extensions/omarchy-menu.jsonc")`.
Bash is not path-scopable.

This is still a real gain, and it is precisely the gap #52 is about: it forces
the escalation out of a card showing a benign JSON diff and into a card showing
a shell command. The user is then being asked the question they can actually
answer. The fix narrows what a *misleading* approval can buy; it does not claim
to stop a determined agent that the user approves a shell command for.

## Risks

- **A legitimate request now fails.** "Add a menu entry for me" stops working at
  Mechanic; the user edits the file themselves, which is what the intent's
  constraint ("users keep full control of their own menu file") already
  envisages. `~/.config/omarchy/nixi.json` (2e) is the one entry with a plausible
  everyday use -- settings have a card UI, so the loss is small, but it is the
  entry most likely to want revisiting.
- **The deny is user-visible as a refusal, not a prompt.** Claude reports the
  tool as blocked. Acceptable, and arguably clearer than a prompt.
- **A user's own settings cannot loosen this.** Claude resolves `deny` above
  `allow` across all sources, so a user who genuinely wants agent-written menu
  entries cannot opt back in without changing Nixi. Deliberate; noted so the
  approver can object.
- **No compositor-facing change**, so nothing here needs a real desktop to
  verify. The QML files are read for evidence and not modified.

## Verification

- `node --test bridge/*.test.js` -- 78 today, all must still pass.
- New cases in `bridge/trust-policy.test.js`:
  1. **Generated, not hand-listed** -- every `EXEC_WRITE_PATHS` entry appears for
     every `WRITE_TOOLS` name, and `deny.length === WRITE_TOOLS.length *
     EXEC_WRITE_PATHS.length`. This is #41's assertion, applied to the write side.
  2. **The list cannot silently shrink** -- a length floor plus named entries for
     the three findings that motivated it (2a, 2b, 2c), and the "no `(` in a
     path" check that catches a rule pasted where a path belongs.
  3. **As transmitted, not as constructed** -- via `runBridge()`, assert the
     `deny` rules are present in what actually reached `newSession`, using the
     existing `sentPermissions()` helper (`trust-policy.test.js:176-177`).
  4. **`askBeforeReading` does not disturb the deny** -- both variants carry it.
  5. **Guide is unaffected** -- still cancels, still shows no prompt.
- `nix flake check` -- passes today, must still pass.
- Each new test must be shown failing before the fix, with its message quoted in
  the PR.

## Open questions for the approver

1. **Is the path list right?** `~/.local/bin/**` and `~/.config/systemd/user/**`
   are broad, and matter only for `install.py` installs. Narrow them to `nixi*`,
   or keep them broad on the grounds that the next binary there has the same
   shape?
2. **Should `~/.config/omarchy/nixi.json` be in the list?** It is the one entry
   with a plausible legitimate write. Sinks are user-invoked (2e), so it is the
   weakest member.
3. **Shell rc files** (`~/.bashrc`, `~/.zshrc`, `~/.profile`) are the same shape
   -- they run at login and can set `NIXI_ACP_COMMAND`, which redirects the agent
   binary itself (`bridge/bridge.js:30-36`, `:163`). They are excluded here
   because they are the user's general environment rather than surface this repo
   creates, and "add an alias for me" is a reasonable Mechanic request. Deferred
   deliberately; say if it should be in scope.
4. **Worth fixing at all** (the intent's open question 4)? My view: yes, but the
   reason has moved. As filed, against the menu file alone, it is marginal -- it
   needs an approved write, and the honest answer is that it buys a little
   clarity. Finding 2a changes that: the agent can write its own permission
   settings in its own working directory, and that is worth closing on its own
   merits regardless of #52. The menu file is the cheapest instance to have
   found it through.
