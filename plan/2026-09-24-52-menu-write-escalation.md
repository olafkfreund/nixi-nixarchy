---
status: approved
issue: 52
spec: spec/2026-09-24-52-menu-write-escalation.md
---

# Plan: A write that will later run unattended is denied

Self-contained. The approved decisions from the spec, plus the resolution of
the three questions the spec left open.

## The approved decisions, carried over

1. **`deny`, not `ask`.** Mechanic is Claude's `default` mode
   (`bridge/trust-policy.js` MODES), where every `Write`/`Edit` already
   produces a permission request -- asserted by `trust-policy.test.js:51`. An
   `ask` rule on a path that already asks changes nothing. `SECRET_PATHS`
   works because it claws paths back out of a standing `allow`; there is no
   write `allow` to claw back from. Only `deny` moves.

2. **The dividing line is who pulls the trigger, not what executes.**
   "Deny writes to things that execute" would ban `~/.config/hypr/**`, which
   is the README's flagship Mechanic demo (`README.md:35`) and which
   `skills/nixi/SKILL.md:90` instructs the agent to edit. The property that
   separates a menu `when:` guard from a keybinding is whether a person is
   present when it fires:
   - **User-invoked** -- a keybinding runs when the user presses the key, a
     menu row when the user picks it. Keep asking.
   - **Unattended** -- a `when:` guard on the next reload, a `post-boot.d`
     hook at boot, a `PreToolUse` hook on the agent's next tool call. Nobody
     pulled anything. This is what is denied.

3. **Paths, not rules, generated over the tool names.** Claude matches a rule
   per tool name, so a hand-written `Write(...)` list would leave `Edit` free
   to reach the same paths -- that is the #41 bug, on the write side.

4. **Claude only.** Codex is `read-only` at both trust levels, so it has no
   write to deny. Guide cancels every request it receives, unchanged.
   OpenCode is left alone: its rules already resolve writes to `"*": "ask"`,
   so the no-op argument applies there too, and this repo has not verified
   that its schema supports per-path write globs. Inventing a config key that
   silently fails to match would look like coverage while providing none.

## Decisions resolving the spec's open questions

### Q1: `~/.local/bin/**` and `~/.config/systemd/user/**` -- narrow or broad?

**Split them.**

- `~/.config/systemd/user/**` stays **broad**. Every file in that directory is
  a unit or a drop-in, and a unit is unattended by definition. There is no
  benign member of the set.
- `~/.local/bin/**` is **narrowed to `~/.local/bin/nixi-*`**. A file in
  `~/.local/bin` does not run unattended merely by being there -- only the
  ones a unit references do, which today is `nixi-watch`
  (`systemd/nixi-watch.service:34`, `WantedBy=graphical-session.target`) and
  `nixi-manual`. Everything else there runs when the user types its name,
  which is user-invoked and so outside decision 2.

  This narrowing is safe precisely because the broad systemd rule stands
  above it: making some *other* `~/.local/bin` file unattended requires
  writing a unit that references it, and that write is denied. The two rules
  hold together; loosening either one alone would open the pair.

### Q2: should `~/.config/omarchy/nixi.json` be in the list?

**No.** It is the spec's own weakest member and it fails decision 2 on its
own terms. Its sink is `fileOpenCommand`/`fileEditCommand` argv
(`Conversation.qml:606-609`), which only runs when the user activates a `@`
file row -- user-invoked, the same class as a keybinding. Including it would
apply a stricter rule to Nixi's settings file than to the Hyprland config we
deliberately leave alone, which is not a line we can defend.

Two further reasons: the bridge itself writes this file (`mergeSettings()`),
so denying the agent while the product writes it is incoherent; and
"turn on ask-before-reading for me" is a reasonable Mechanic request.

### Q3: shell rc files (`~/.bashrc`, `~/.zshrc`, `~/.profile`)?

**Out of scope here, filed as a follow-up.** They are genuinely the same
shape and the spec is right that they are: they run at login, and they can
set `NIXI_ACP_COMMAND`, which redirects the agent binary itself
(`bridge/bridge.js:30-36`). This is stated as a known gap rather than
quietly omitted.

They are excluded because they are the user's general environment rather
than surface this repo creates, and because "add an alias for me" is an
ordinary Mechanic request whose loss is a real cost -- a trade that deserves
its own intent and its own approval, not an expansion of this one.

### Q4: a fourth decision the spec did not ask, forced by #66

The spec's Finding 2a named `~/.config/nixi/.claude/**` as the worst
instance. **It is deliberately NOT in the list**, because #66 landed first
and removed the capability rather than the path: `bridge/bridge.js` now
sends `settingSources: ["user"]`, so project-scope settings in the agent's
cwd are not loaded at all. A deny there would be policing a path whose
capability is already gone. `trust-policy.test.js:333` holds that flag in
place.

What #66 did **not** close is the scope it kept. `settingSources: ["user"]`
means the *user* scope is exactly what still loads -- so
`~/.claude/settings.json`, `~/.claude/settings.local.json` and
`~/.claude/hooks/**` are now the live instance of 2a, and they are in the
list. This is the most important inclusion and it exists because of #66, not
despite it.

## The resulting list

```js
export const EXEC_WRITE_PATHS = [
  "~/.claude/settings.json",         // the agent's own permission rules (user scope)
  "~/.claude/settings.local.json",
  "~/.claude/hooks/**",              // PreToolUse: a shell command, no prompt
  "~/.config/omarchy/hooks/**",      // post-boot.d runs at every boot
  "~/.config/omarchy/extensions/**", // #52 as filed: `when:` guards are bash
  "~/.config/omarchy/plugins/**",    // bridge scripts spawn on card load
  "~/.config/systemd/user/**",       // units and drop-ins
  "~/.local/bin/nixi-*",             // the binaries those units run at login
];
```

Not in it, on purpose: `~/.config/hypr/**` (decision 2), `~/.config/nixi/.claude/**`
(Q4), `~/.config/omarchy/nixi.json` (Q2), shell rc files (Q3).

## Steps

1. `bridge/trust-policy.js`: add `EXEC_WRITE_PATHS`, `WRITE_TOOLS` and the
   generated `EXEC_WRITES`, with a comment recording the who-pulls-the-trigger
   line and the hypr exclusion → verify by the generation test.
2. `bridge/trust-policy.js`: `claudePermissions()` returns `deny: EXEC_WRITES`
   alongside the existing `allow`/`ask`. Nothing else changes -- `bridge.js`
   already passes the whole object through as `settings.permissions` → verify
   by the as-transmitted test.
3. `bridge/trust-policy.test.js`: the five cases below.

No change to `bridge/bridge.js`, and no change to any QML file: the sinks are
read for evidence and are legitimate features of a file the user owns.

## Tests

`node --test bridge/*.test.js` -- 86 today, all must still pass, plus:

1. **Generated, not hand-listed** -- every `EXEC_WRITE_PATHS` entry appears
   for every `WRITE_TOOLS` name, and
   `deny.length === WRITE_TOOLS.length * EXEC_WRITE_PATHS.length`. #41's
   assertion on the write side.
2. **The list cannot silently shrink** -- a length floor, named entries for
   the three findings that motivated it, and a "no `(` in a path" check that
   catches a rule pasted where a path belongs.
3. **As transmitted** -- via `runBridge()`, the `deny` rules are asserted in
   what actually reached `newSession`, not in what `claudePermissions()`
   constructs.
4. **`askBeforeReading` does not disturb the deny** -- both variants carry
   the identical deny; only the read `allow` moves.
5. **The exclusions are asserted, not just documented** -- no rule matches
   `~/.config/hypr/**`, so a later broadening that breaks the flagship demo
   fails a test instead of shipping.

Each new assertion must be shown failing without the change, with its message
quoted in the PR.

`nix flake check` -- passes today, must still pass.

## Rollback

`git revert` the implementation commit. The deny is additive: removing
`deny` from `claudePermissions()` restores exactly today's behaviour, since
Mechanic already asks for every write and Guide already cancels every
request.
