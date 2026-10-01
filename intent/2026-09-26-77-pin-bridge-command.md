---
status: approved
issue: 77
author: olafkfreund
---

# Intent: The environment can replace the process that enforces the rules

## Problem

`Conversation.qml:178-192` builds the command that runs the bridge:

```qml
readonly property var bridgeCommand: {
  var raw = String(Quickshell.env("NIXI_BRIDGE_COMMAND") || "").trim()
  var prefix = []
  if (raw !== "") {
    try { prefix = JSON.parse(raw) } catch (error) { prefix = [] }
  }
  // Preserve the historical PATH lookup when no platform command is
  // supplied. Omarchy deployments can provide any argv prefix explicitly.
  if (!Array.isArray(prefix) || prefix.length === 0) prefix = ["node"]
  return ["env", "HUGINN_INTERNAL=1", …].concat(prefix).concat([
    root.bridgeScript("bridge.js")
  ])
}
```

`nix/package.nix:175` substitutes that `"node"` with the pinned
`$plugin/bridge/nixi-node`, so the default is pinned. A non-empty
`NIXI_BRIDGE_COMMAND` replaces the prefix outright, and the card then runs
`env … <anything> /path/to/bridge.js`. The substituted binary is free to ignore
that argument and speak the bridge's stdout protocol itself.

**Why this is worse than #76.** The variables #76 pinned decide *which agent the
bridge supervises*. This one decides *what supervises the agent*. The bridge is
where `bridge/trust-policy.js` is applied, where Guide's cancel lives
(`bridge.js:239-243`), and where every permission request is decided.
Substituting it does not change what is enforced; it removes the enforcement
while the card keeps rendering `GUIDE` or `MECHANIC` as though it were in force.

**Why #76's fix cannot reach it.** #76 changed `makeWrapper` flags on
`bridge/nixi-node`, which govern the environment of the wrapped node. This
variable is read by `Quickshell.env()` — the environment of the **quickshell
process**. No wrapper flag touches it.

### Three things found while reading the code, which shape the fix

1. **Nothing in this repository sets `NIXI_BRIDGE_COMMAND`.** The only
   occurrence is the reader above. The comment's justification — "Omarchy
   deployments can provide any argv prefix explicitly" — describes a case with
   no user here.

2. **`MenuSearch.qml` already does this the safe way.** It runs the same node
   with bare literals and no environment override (`MenuSearch.qml:30` and
   `:380`), and `nix/package.nix:177-178` substitutes those too. So the pattern
   this issue proposes is already the established one in the sibling file, and
   `Conversation.qml` is the outlier rather than the precedent.

3. **`HUGINN_INTERNAL` is never read.** It is *set* twice —
   `Conversation.qml:187` and `bridge/bridge.js:142` — and consumed nowhere in
   the repository. The issue text I filed suggested gating the override behind
   "the same internal marker already in that argv"; that would have gated on a
   marker nothing consumes. Recorded here because it killed my own first idea,
   and because it is a real (if minor) dead-code finding.

Both `NIXI_BRIDGE_COMMAND` and `HUGINN_INTERNAL` entered at `184fe92 Rebrand
omarchy-ask as Nixi (#8)`, which is consistent with both being carried over
rather than designed.

## Proposed outcome

On a Nix deployment the card runs the bridge with the interpreter the build
pinned, and no environment variable can substitute it. What the card claims
about trust is what is actually being enforced.

An install that resolves `node` from `PATH` — the imperative installer — keeps
working exactly as now.

## Affected users and systems

- Anyone running Nixi from the Home Manager module (p620, razer).
- Nobody is known to rely on the override: nothing in this repository sets it,
  and the deployment case its comment describes has no instance here. If an
  out-of-tree deployment does set it, this is a breaking change for them, which
  is a question the spec must answer rather than assume.
- `Conversation.qml` only. `MenuSearch.qml` already has no such door.

## Constraints

- **CI never executes QML.** The only available guard is a string assertion in
  `tools/test_nixi.py`, which is the established pattern in this repo for
  exactly this reason. A fix without one is untested by construction.
- The existing `installCheckPhase` assertion at `nix/package.nix` —
  `! grep -nE '"(node|gjs)"' $plugin/*.qml` — must keep passing, which means
  whatever replaces the current code must still be substituted by the
  `--replace-fail '"node"'` at `nix/package.nix:175`. That `--replace-fail`
  stops the build if the literal ever moves, so the two must stay in step.
- No behaviour change for the imperative installer.
- The fix must not silently break a deployment that sets the variable today: if
  the decision is to ignore it, that should be observable, not mysterious.

## Open questions

All three answered by the approver on 2026-09-26.

1. **Ignore the variable entirely, or keep an explicit deployment escape?**
   **Ignore it entirely.** The branch is deleted and the interpreter comes from
   the substituted `"node"` literal, exactly as `MenuSearch.qml` already does.
   No escape is designed: on a desktop session the card and the shell share an
   environment, so an "escape an rc file cannot reach" cannot be built honestly.
   A deployment that needs a different interpreter overrides the package, the
   same answer #76 settled on.

2. **If ignored, silent or visible?** **Visible.** A deployment that sets the
   variable today would otherwise change behaviour with no signal. The card
   says once that it ignored it, naming the variable, so the behaviour is a
   message rather than a mystery.

3. **Does `HUGINN_INTERNAL` get removed here or separately?** **Separately.**
   It is unrelated dead code that happens to share the expression, and this
   change stays about the security boundary. Filed as its own issue.

## Note

#76 is merged (PR #78) and pinned the four `NIXI_*_COMMAND` wrapper variables.
This is the same defect class one level up. The residual surface after both —
`NIXI_DIR`, `NIXI_FALLBACK_DIR`, `NIXI_DATA`, `NIXI_CWD` — remains open and is
listed in `spec/2026-09-25-76-pin-adapter-commands.md`; `NIXI_DIR` is the one
that matters most, since it aims the real `nixi-context` at any directory.
