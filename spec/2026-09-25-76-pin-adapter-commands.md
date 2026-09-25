---
status: draft
issue: 76
intent: intent/2026-09-25-76-pin-adapter-commands.md
---

# Spec: Pin the commands Nixi launches

## Design

### The change

`nix/package.nix` builds the bridge's node wrapper with `--set-default` for
four variables. Change all four to `--set`, so the store path the build pinned
wins over anything in the environment.

| Line | Variable | Now | After |
| ---- | -------- | --- | ----- |
| 53 | `NIXI_CLAUDE_ACP_COMMAND` | `--set-default` | `--set` |
| 55 | `NIXI_CODEX_ACP_COMMAND` | `--set-default` | `--set` |
| 57 | `NIXI_OPENCODE_COMMAND` | `--set-default` | `--set` |
| 159 | `NIXI_CONTEXT_COMMAND` | `--set-default` | `--set` |

`makeWrapper` writes `export VAR=${VAR-default}` for `--set-default` and
`export VAR='value'` for `--set`. The first uses the default only when the
variable is unset; the second is unconditional.

The comment at `nix/package.nix:49-50` currently states the behaviour being
removed and must be rewritten in the same commit, otherwise it documents the
opposite of the code.

### What is deliberately *not* changed

- **`NIXI_ACP_COMMAND`** keeps working (approved decision 1). It is the
  any-agent wildcard. `adapterOverride` in `bridge/harness-policy.js` reads the
  per-agent name first and only falls back to the wildcard, so once the three
  per-agent variables are unconditionally set, the wildcard is unreachable on a
  Nix deployment. It still functions for `PATH`-based installs, which is the
  documented escape route, and `bridge/testing/run-bridge.js:42` keeps using it
  to point the bridge at the fake agent.

- **`bin/nixi-context`'s own knobs** (`NIXI_DIR`, `NIXI_DATA`,
  `NIXI_FALLBACK_DIR`). See "Residual surface" below — these are named here so
  the change is not mistaken for closing the grounding-text question.

### Documentation

`nix/hm-module.nix`'s `package` option description gains the substitute for the
capability being removed (approved decision 3):

```nix
services.nixi.package = pkgs.nixi.override { claudeAcp = myLocalBuild; };
```

An `allowCommandOverride` escape hatch was rejected in the intent; the pin is
unconditional and there is no code path around it.

## A more severe instance of the same defect, found while specifying this

**This is a scope question for the approver. It is not covered by the approved
intent and is not included in the change above.**

`Conversation.qml:178-192` resolves the command that runs the bridge:

```qml
var raw = String(Quickshell.env("NIXI_BRIDGE_COMMAND") || "").trim()
var prefix = []
if (raw !== "") { try { prefix = JSON.parse(raw) } catch (error) { prefix = [] } }
if (!Array.isArray(prefix) || prefix.length === 0) prefix = ["node"]
return ["env", "HUGINN_INTERNAL=1", …].concat(prefix).concat([root.bridgeScript("bridge.js")])
```

`nix/package.nix:175` substitutes `"node"` with the pinned
`$plugin/bridge/nixi-node`, so the **default** is pinned — but a non-empty
`NIXI_BRIDGE_COMMAND` replaces that prefix outright.

Why it is worse than what #76 reports: the adapter variables change *which
agent* the bridge supervises. This changes *what supervises the agent*. The
bridge is where `trust-policy.js` is applied, where Guide's cancel lives, and
where every permission request is decided. Replacing it removes the enforcement
rather than changing what is enforced.

Why the approved fix cannot reach it: `Quickshell.env()` reads the environment
of the **quickshell process**, not of the wrapped node. No `makeWrapper` flag
touches it. Closing it needs a change in `Conversation.qml` — either ignoring
the variable when the substituted default is present, or gating it behind the
same `HUGINN_INTERNAL` style internal marker already in that argv.

Three ways forward, for the approver to pick:

1. **Fold into this change.** One issue, one fix, but the diff stops being a
   four-word Nix change and needs a QML change plus a `tools/test_nixi.py`
   string assertion, since CI never executes QML.
2. **Separate issue, done next.** Keeps this change trivially reviewable.
   Recommended — it is a different file, a different mechanism and a different
   test strategy, and leaving it unfixed does not make the Nix pin wrong.
3. **Leave it.** Only defensible under the "anything that writes `~/.bashrc`
   already runs as you" argument, which the intent already declines for the
   adapter variables. Listed for completeness, not recommended.

## Residual surface

After this change, still readable from the environment and still able to affect
what the agent is told or where it runs:

| Variable | Read at | Effect |
| -------- | ------- | ------ |
| `NIXI_BRIDGE_COMMAND` | `Conversation.qml:179` | replaces the bridge interpreter (above) |
| `NIXI_DIR` | `bin/nixi-context:22` | moves the knowledge directory `nixi-context` reads |
| `NIXI_FALLBACK_DIR` | `bin/nixi-context:25` | moves the bundled-knowledge fallback |
| `NIXI_DATA` | `bin/nixi-context:28` | moves the mutable state directory |
| `NIXI_CWD` | `bridge/bridge.js:43` | moves the agent's working directory (relates to #63/#74) |

`NIXI_DIR` matters most of these: pinning `NIXI_CONTEXT_COMMAND` guarantees the
real `nixi-context` runs, and `NIXI_DIR` then points that real binary at a
directory of the setter's choosing. The grounding-text question is therefore
**not** closed by this change, and this spec does not claim it is.

These are listed rather than fixed because the intent was approved for the
command variables. They belong in the follow-up that resolves the scope
question above.

## Alternatives rejected

- **Deny-list `~/.bashrc`, `~/.zshrc`, `~/.profile`** (option 1 in #76).
  Rejected in the intent: anything that can write an rc file can export the
  variables by another route — a systemd user environment file, a desktop entry,
  `~/.config/environment.d`. It polices one door of several.
- **`services.nixi.allowCommandOverride`.** Rejected in the intent: a setting
  whose only purpose is to reopen a security hole gets switched on and left on,
  and it puts a conditional inside the guarantee.
- **Accept the risk** (option 3 in #76). Rejected: the argument proves too much.
  It would equally excuse #52, which was fixed.

## Risks

- **An existing user relying on the env-var route** gets a silent behaviour
  change: their override stops taking effect and Nixi uses the pinned adapter.
  There is no warning, because the wrapper cannot tell an intentional override
  from a hostile one. Mitigated by the module documentation and the changelog;
  the blast radius is adapter developers, on two known hosts.
- **`installCheckPhase` at `nix/package.nix:239`** greps `nixi-node` for
  `NIXI_CONTEXT_COMMAND`. `--set` still emits that name, so the assertion holds
  — but it is now a weaker check, since it passes for both spellings. The
  verification below adds one that distinguishes them.
- **Low risk otherwise.** No runtime code changes; the bridge and the card are
  untouched.

## Verification

1. **Build assertion (new).** Extend `installCheckPhase` to assert the pinned
   spelling, so a future edit back to `--set-default` fails the build:

   ```bash
   ! grep -qE 'NIXI_(CLAUDE_ACP|CODEX_ACP|OPENCODE|CONTEXT)_COMMAND=\$\{' \
     $plugin/bridge/nixi-node
   ```

   `${` appears only in the `${VAR-default}` form.

2. **Generated wrapper.** `nix build` and read `bridge/nixi-node`: the four
   lines read `export VAR='…'`, not `export VAR=${VAR-…}`.

3. **The property itself, on a live desktop.** With
   `NIXI_CODEX_ACP_COMMAND='["/bin/false"]'` exported, the card still starts a
   working Codex session — before this change it fails to start. Verified by
   running the bridge through `nixi-node` with that variable set and confirming
   a `ready` event.

4. **Existing suites unchanged.** `node --test` in `bridge/` (all 106),
   `tools/test_nixi.py`, and `nix flake check`. `bridge/testing/run-bridge.js`
   must keep working untouched — it is the proof that decision 1 was right.

5. **Home Manager evaluates.** The CI job that evaluates the module must pass
   with the documentation change.
