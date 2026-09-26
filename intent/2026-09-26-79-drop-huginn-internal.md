---
status: approved
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

Answered before the spec, on 2026-09-26.

1. **Does anything outside this repository read it?** **No.** Two independent
   trees searched, each with a positive control so a silent miss would show:
   - `omarchy-4.0.4` as packaged — **1489 files, 0 matches**, case-insensitive.
   - the resolved shell tree quickshell actually runs (`$OMARCHY_PATH`,
     following symlinks) — **1407 files, 0 matches**; control: 90 of the first
     200 files match `omarchy`, so the search was really reading them.

   This matters because my first attempt at this check searched the unresolved
   tree, which is a symlink farm of **2 entries**, and reported a clean "no
   matches" that meant nothing. A second attempt then used `grep -l … -L`,
   where `-L` silently inverts `-l` and lists files *without* the match — it
   printed two filenames that looked like hits and were the opposite. Both are
   recorded because the conclusion here is a negative, and a negative is only
   as good as the instrument that produced it.

   So: remove, not document.

2. **Is the `env` prefix still needed?** Yes. It still carries `NIXI_AGENT`,
   `NIXI_MODEL` and `NIXI_REASONING_EFFORT`. Only the one assignment goes.

3. **Does the absence assertion belong in `tools/test_nixi.py`?** Yes.
   Asserting a string is absent is a weak test, but CI cannot execute QML at
   all, and `Conversation.qml` has been edited three times in two days. The
   cost is one line; the thing it prevents is the marker quietly coming back.
