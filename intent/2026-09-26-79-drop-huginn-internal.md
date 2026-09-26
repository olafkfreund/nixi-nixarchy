---
status: draft
issue: 79
author: olafkfreund
---

# Intent: A marker nobody reads, on every process the agent spawns

## Problem

`HUGINN_INTERNAL` is set in two places and read in none:

- `Conversation.qml:199` — in the `env` prefix of every bridge launch:
  `["env", "HUGINN_INTERNAL=1", …]`
- `bridge/bridge.js:142` — `const childEnvironment = { ...process.env,
  HUGINN_INTERNAL: "1" };`, which is the environment handed to the agent, and
  therefore inherited by every process the agent spawns

```
$ grep -rn HUGINN_INTERNAL . --include=*.qml --include=*.js --include=*.py --include=*.nix
Conversation.qml:199
bridge/bridge.js:142
```

Nothing branches on it. Not the bridge, not the card, not the Python tools, not
the Nix build, and not the Omarchy tree on either host (checked: no match in
`nixarchy-omarchy-tree`, none under `/run/current-system/sw/share/omarchy`).

It is not inert. It is propagated into the agent and from there into every
child process, so it is a marker on a whole process tree with no stated
meaning. Either it means something, in which case the meaning and its reader
should be written down, or it does not, in which case it should go.

### Provenance

`bridge/bridge.js`'s copy dates to `f14489e Initial release of Omarchy Ask` —
the first commit. `Conversation.qml`'s was added later at `1b792d9 Refine
conversation layout and retain pinned sessions`.

This corrects something I wrote in #79 and in #77's intent: I said it entered
at `184fe92 Rebrand omarchy-ask as Nixi (#8)`. It did not. The rebrand renamed
the sibling `ASK_BRIDGE_COMMAND` to `NIXI_BRIDGE_COMMAND` but did not touch
this variable at all. So the tidy story — "carried over during a rename, never
noticed" — is wrong. It has been set since the first commit and appears never
to have had a reader in this repository's history.

### Why it is worth removing rather than leaving

It reads as meaningful. During #77 I proposed gating a security decision behind
"the same internal marker already in that argv" — which would have gated the
bridge's own substitution check on a variable nothing consumes. I caught it by
grepping for the reader before writing the spec. The next person may not.

A marker that looks load-bearing and is not is worse than no marker, because it
invites exactly that mistake.

## Proposed outcome

Nothing in the repository sets `HUGINN_INTERNAL`, and the agent's process tree
is no longer tagged with a name from a project that no longer exists. No
behaviour changes, because nothing read it.

## Affected users and systems

- Nobody, if the premise holds. That premise — *no reader anywhere* — is the
  whole risk, and it is the thing the spec must establish beyond this
  repository before deleting.
- Two files: `Conversation.qml`, `bridge/bridge.js`.
- The bridge's `childEnvironment` also carries `CODEX_PATH` /
  `CLAUDE_CODE_PATH`, which are real and stay.

## Constraints

- **Prove the negative properly, or do not remove it.** Checked so far: this
  repository, the Omarchy tree on razer, the installed omarchy package. Not yet
  checked: upstream Omarchy, and `omarchy-ask` if any trace remains.
- **CI never executes QML**, so the QML half needs a `tools/test_nixi.py`
  string assertion the way #77's did, or the removal is untested.
- `Conversation.qml:199` was rewritten by #77 (PR #80). The line to edit is
  the new `bridgeCommand` array, and the `env` prefix stays — only the one
  assignment goes.
- No behaviour change, and no change to `CODEX_PATH` / `CLAUDE_CODE_PATH`.

## Open questions

1. **Does anything outside this repository read it?** Upstream Omarchy is the
   place to check. If something does, this becomes "document it at both sites"
   rather than "remove it", and that is a different change.
2. **Is `env` still needed in the argv?** With the marker gone the prefix still
   carries `NIXI_AGENT`, `NIXI_MODEL` and `NIXI_REASONING_EFFORT`, so yes —
   but worth stating so nobody removes the wrapper along with the variable.
3. **Does the test assertion belong here at all?** Asserting the *absence* of a
   string is a weak test that will annoy someone later. The alternative is to
   delete it and rely on review. I lean towards including it, because CI cannot
   see QML at all and this file has now been edited three times in two days.
