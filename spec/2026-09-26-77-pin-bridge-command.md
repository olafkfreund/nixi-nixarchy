---
status: approved
issue: 77
intent: intent/2026-09-26-77-pin-bridge-command.md
---

# Spec: Pin the bridge command

## Design

### The change

`Conversation.qml:178-192` loses the environment branch. The interpreter comes
from the `"node"` literal that `nix/package.nix:175` substitutes, which is
exactly what `MenuSearch.qml:30,380` already does:

```qml
// The interpreter is fixed by the install: nix/package.nix substitutes this
// "node" literal with the pinned bridge/nixi-node, the same way it does for
// MenuSearch.qml. NIXI_BRIDGE_COMMAND is deliberately NOT honoured (#77) --
// it replaced this prefix outright, and the bridge is what applies
// trust-policy.js and cancels permissions in Guide, so substituting it does
// not change what is enforced, it removes the enforcement while the card goes
// on displaying the trust badge. A deployment that needs a different
// interpreter overrides the package, as with the adapter commands (#76).
readonly property var bridgeCommand: ["env", "HUGINN_INTERNAL=1",
  "NIXI_AGENT=" + agentName, "NIXI_MODEL=" + modelName,
  "NIXI_REASONING_EFFORT=" + reasoningEffort,
  "node", root.bridgeScript("bridge.js")]
```

The `["env", …]` prefix, the three `NIXI_*` assignments and `bridgeScript()` are
unchanged. `bridgeScript()` resolves from the QML file's own URL, so the script
path was never environment-derived and needs no change.

### Saying so, once

A deployment that sets the variable today would change behaviour with no
signal. The card says so, naming the variable:

```qml
readonly property string ignoredBridgeOverride:
  String(Quickshell.env("NIXI_BRIDGE_COMMAND") || "").trim()
```

and where the agent is about to start — the `else statusText = "Starting agent…"`
branch at `Conversation.qml:959` — the message becomes, when that string is
non-empty:

> `Ignoring NIXI_BRIDGE_COMMAND: the bridge command is fixed by this install.`

**Why there and not in the binding.** `bridgeCommand` is a property binding;
producing a side effect from one runs at unpredictable times and re-runs on any
dependency change. The start path runs once per session start, which is exactly
the cadence the notice wants.

**Why `statusText`.** It is the card's existing one-line channel for this kind
of remark (`"Starting agent…"`, `"Still switching trust…"`, `Guide · not run:`),
so the notice needs no new surface. It is replaced by `"Thinking…"` on the first
reply, which is the right lifetime: visible at the moment it is relevant,
not sticky.

### Deliberately unchanged

- **`HUGINN_INTERNAL=1` stays.** It is read nowhere in the repository — set at
  `Conversation.qml:187` and `bridge/bridge.js:142`, consumed nowhere — but it
  is unrelated dead code that happens to share this expression. Removing it
  here would mix a cleanup into a security boundary change. Filed separately.
- **`MenuSearch.qml`** already has no environment door and is not touched.
- The residual surface from #76 — `NIXI_DIR`, `NIXI_FALLBACK_DIR`, `NIXI_DATA`,
  `NIXI_CWD` — is still open and out of scope here.

## Alternatives rejected

- **Keep an escape hatch behind an internal marker.** This is what the issue
  text proposed, gating on `HUGINN_INTERNAL`. It cannot work: that marker is
  never read, and more fundamentally anything the card can read from its
  environment, an rc file can set, because the card and the shell share one.
  An escape that the attacker can also open is not an escape.
- **Validate the override instead of ignoring it** — for example requiring an
  absolute path inside the Nix store. It narrows the hole without closing it
  (a store path can be any derivation the user can build) and adds a
  validation surface to maintain, for a capability with no user in this repo.
- **Delete `NIXI_BRIDGE_COMMAND` silently.** Rejected per the approved intent:
  a deployment setting it today deserves a message, not a mystery.
- **Leave it and document the risk.** Rejected in the intent for the same
  reason #76 rejected it: the argument proves too much.

## Risks

- **An out-of-tree deployment that sets the variable** loses its override. This
  is the breaking change. Nothing in this repository sets it and its comment
  describes a case with no instance here, but "no instance in this repo" is not
  "no instance anywhere". Mitigated by the visible notice, which names the
  variable so the cause is immediately findable.
- **The `--replace-fail '"node"'` coupling.** `nix/package.nix:175` fails the
  build if the `"node"` literal disappears from `Conversation.qml`. The new
  code must keep it as a bare literal — not `'node'`, not a computed string.
  This is a feature: it is what stops the pin being silently lost. The test
  below asserts it from the other side too.
- **Low risk otherwise.** One QML expression and one status message; no bridge
  or Nix changes.

## Verification

CI never executes QML, so the guard is a string assertion in
`tools/test_nixi.py`, in the existing idiom (read the file, slice the
expression, assert on its text).

1. **New test — `test_bridge_command_is_pinned`:**
   - the `bridgeCommand` expression contains the bare literal `"node"`, so
     `--replace-fail` still has something to substitute;
   - it does **not** contain `NIXI_BRIDGE_COMMAND`, `Quickshell.env` or
     `JSON.parse`, so no environment value can reach the command;
   - `Conversation.qml` still mentions `NIXI_BRIDGE_COMMAND` exactly once, in
     the notice, so the ignore is stated rather than forgotten.

2. **Existing assertions must still pass**, in particular
   `! grep -nE '"(node|gjs)"' $plugin/*.qml` in `installCheckPhase` — which
   means the built plugin must have no bare `"node"` left, i.e. the
   substitution found it.

3. **Build:** `nix build` with adapters pinned, then confirm the built
   `Conversation.qml` contains the store path to `bridge/nixi-node` and no
   bare `"node"`.

4. **Suites:** `node --test` in `bridge/` (106), `tools/test_nixi.py`,
   `nix flake check`.

5. **Runtime, on razer — the property itself.** With
   `NIXI_BRIDGE_COMMAND='["/bin/false"]'` exported into the shell's
   environment, restart the shell, summon the card and send a prompt:
   - the agent answers normally, and
   - the card shows the ignore notice naming the variable.

   Against the current build the same export breaks the card, which is the
   before/after pair. **Assert the loaded plugin is the new build first**
   (`grep -c NIXI_BRIDGE_COMMAND` on the symlink target's `Conversation.qml`);
   swapping the symlink without `omarchy restart shell` silently tests the old
   code, which cost an hour on #38.
