---
status: draft
issue: 77
spec: spec/2026-09-26-77-pin-bridge-command.md
---

# Plan: Pin the bridge command

## The approved decisions, carried over

Implementable without opening the intent or spec.

1. **`NIXI_BRIDGE_COMMAND` is not honoured.** The environment branch in
   `Conversation.qml:178-192` goes; the interpreter is the bare `"node"`
   literal that `nix/package.nix:175` substitutes with the pinned
   `bridge/nixi-node`, exactly as `MenuSearch.qml:30,380` already work.
2. **No escape hatch.** Anything the card can read from its environment, an rc
   file can set, because the card and the shell share one. A deployment needing
   a different interpreter overrides the package, as with #76.
3. **The card says so, visibly**, naming the variable, on the agent-start path
   rather than from the property binding.
4. **`HUGINN_INTERNAL=1` stays** in the argv. It is read nowhere, but it is
   unrelated dead code and belongs to #79, not to a security change.
5. **The guard is a string assertion in `tools/test_nixi.py`**, because CI
   never executes QML.

## Steps

1. **`Conversation.qml:178-192` — replace the expression.** The block becomes a
   plain array with the comment the spec gives (why the literal is there, why
   the variable is ignored, and that a deployment overrides the package):

   ```qml
   readonly property var bridgeCommand: ["env", "HUGINN_INTERNAL=1",
     "NIXI_AGENT=" + agentName, "NIXI_MODEL=" + modelName,
     "NIXI_REASONING_EFFORT=" + reasoningEffort,
     "node", root.bridgeScript("bridge.js")]
   ```

   `"node"` must stay a **bare double-quoted literal** — not `'node'`, not
   concatenated — or `--replace-fail` at `nix/package.nix:175` fails the build.
   → verify by step 5's build and by `grep -c '"node"' Conversation.qml` ≥ 1.

2. **`Conversation.qml` — add the read-only property** next to the other
   environment reads (near `imageRoot`, around `:163`):

   ```qml
   readonly property string ignoredBridgeOverride:
     String(Quickshell.env("NIXI_BRIDGE_COMMAND") || "").trim()
   ```

   This is the **only** remaining mention of the variable, and it feeds a
   message, never the command.
   → verify by step 4's assertion.

3. **`Conversation.qml:959` — say it on the start path.** The existing
   `else statusText = "Starting agent…"` becomes:

   ```qml
   else statusText = root.ignoredBridgeOverride === ""
     ? "Starting agent…"
     : "Ignoring NIXI_BRIDGE_COMMAND: the bridge command is fixed by this install."
   ```

   **No new state.** The spec said "says once"; this says it once per agent
   start, which is that cadence, and a `bool` to make it once-per-card-lifetime
   would be state whose only job is to suppress a message that is already
   replaced by `"Thinking…"` on the first reply (`:948`). A deployment that set
   the variable sees it every time it starts an agent, which is correct — the
   condition is still true.
   → verify by step 6's runtime check.

4. **`tools/test_nixi.py` — new `test_bridge_command_is_pinned`**, in the
   existing idiom (read the file, slice the expression, assert on its text):

   - the `bridgeCommand` expression contains the bare `"node"` literal, so
     `--replace-fail` still has its anchor;
   - it contains none of `NIXI_BRIDGE_COMMAND`, `Quickshell.env`, `JSON.parse`,
     so no environment value can reach the command;
   - `Conversation.qml` mentions `NIXI_BRIDGE_COMMAND` exactly **once** — the
     notice — so the ignore is stated rather than forgotten.

   → verify by step 7, including the negative test.

## Tests

```bash
python3 tools/test_nixi.py         # expect: all checks passed
cd bridge && node --test ./*.test.js   # expect: 106 pass, 0 fail
nix build .#nixi --no-link         # expect: exit 0 (installCheckPhase runs)
nix flake check                    # expect: exit 0
```

**Build check (step 5).** In the built plugin, `Conversation.qml` contains the
store path to `bridge/nixi-node` and **no** bare `"node"` — the existing
`! grep -nE '"(node|gjs)"' $plugin/*.qml` assertion covers the second half.

**Negative test for the new assertion (step 7).** Required, not optional: on
#76 the first draft of a build assertion matched nothing and passed happily
against a reverted flag. Reintroduce the environment read into `bridgeCommand`
in the working tree, run `tools/test_nixi.py`, confirm it **fails** naming the
problem, then restore. An assertion never seen to fail is not evidence.

**Runtime check on razer (step 6).** With
`NIXI_BRIDGE_COMMAND='["/bin/false"]'` exported into the shell's environment
and the shell restarted:

- the agent answers a prompt normally, and
- the card shows the notice naming the variable.

Against the current build the same export breaks the card — that is the
before/after pair. **Assert the loaded plugin is the new build first**
(`grep -c ignoredBridgeOverride` on the symlink target's `Conversation.qml`);
swapping the symlink without `omarchy restart shell` silently tests the old
code, which cost an hour on #38. Restore the plugin symlink and the shell
afterwards.

## Rollback

Two files, one QML expression, one status line and one test. `git revert`
restores the override completely. A deployment that lost its override gets it
back on the next rebuild with no further action.
