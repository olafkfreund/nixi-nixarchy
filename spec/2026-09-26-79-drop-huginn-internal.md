---
status: approved
issue: 79
intent: intent/2026-09-26-79-drop-huginn-internal.md
---

# Spec: Remove HUGINN_INTERNAL

## Design

Two deletions. Nothing else changes, because nothing reads the variable.

### 1. `Conversation.qml:199`

```qml
readonly property var bridgeCommand: ["env", "HUGINN_INTERNAL=1",
  "NIXI_AGENT=" + agentName, …]
```

becomes

```qml
readonly property var bridgeCommand: ["env",
  "NIXI_AGENT=" + agentName, …]
```

The `env` prefix **stays**. It still carries `NIXI_AGENT`, `NIXI_MODEL` and
`NIXI_REASONING_EFFORT`, and the pinned interpreter literal from #77 follows
it. Only the one assignment goes.

### 2. `bridge/bridge.js:142`

```js
const childEnvironment = { ...process.env, HUGINN_INTERNAL: "1" };
```

becomes

```js
const childEnvironment = { ...process.env };
```

The lines immediately below it — `CODEX_PATH` and `CLAUDE_CODE_EXECUTABLE`,
each assigned conditionally — are real, load-bearing, and untouched. The
comment above them describes those, not the marker, so it stays as written.

### What this does not do

It does not rename anything, does not touch the `env` wrapper, and does not
change what the agent or its children can see beyond removing one name. The
agent's environment is otherwise byte-identical.

## Alternatives rejected

- **Document it at both sites instead of removing it.** This was the live
  alternative while question 1 was open. It is now rejected on evidence: two
  independent trees, 1489 and 1407 files, zero matches each with a positive
  control. Documenting a marker with no reader anywhere would be writing down
  a meaning that does not exist.
- **Leave it alone as harmless.** Rejected in the intent. It is propagated into
  the agent and every child process, and during #77 I proposed gating a
  security decision behind it — a marker that reads as load-bearing and is not
  invites exactly that mistake.
- **Remove only the QML half**, since that is the one a reader is most likely
  to see. Rejected: it would leave the bridge still tagging the agent's whole
  process tree, which is the half that actually propagates.

## Risks

- **An out-of-tree reader exists that neither search found.** The searches
  covered this repository, `omarchy-4.0.4` as packaged, and the resolved shell
  tree. They did not cover upstream Omarchy's git history, a user's own
  scripts, or anything on a machine other than these two. The blast radius if
  such a reader exists is a conditional that silently stops firing — quiet, not
  loud, which is the unpleasant kind.

  Judged acceptable: the variable names a project that no longer exists, has no
  reader in two full trees, and has never had one in this repository's history.
  `git revert` restores it in one commit.
- **Nothing else.** No behaviour change, no Nix change, no protocol change.

## Verification

1. **New assertion in `tools/test_nixi.py`** — `HUGINN` appears nowhere in
   `Conversation.qml` or `bridge/bridge.js`. CI never executes QML, so a string
   check is the only guard for the first file; the second gets one for
   symmetry, since the point is that the *name* is gone rather than that one
   file changed.

   This is an absence assertion, which is weak by nature. It is included
   because the failure it prevents is the marker being reinstated by someone
   pattern-matching on the surrounding code, and it costs one line.

2. **Negative test, required.** Reintroduce `HUGINN_INTERNAL` into either file,
   confirm `tools/test_nixi.py` fails naming the file, restore. On #76 an
   assertion that could never match passed two full builds before the regex was
   tested directly; on #77 the same discipline caught nothing but cost nothing.

3. **Suites:** `tools/test_nixi.py`, `node --test` in `bridge/` (106),
   `nix build .#nixi`, `nix flake check`.

4. **Runtime, on a real desktop.** Start a session and confirm the agent still
   answers — the only thing that could break is a malformed argv. Then confirm
   the marker is gone from the live process tree:

   ```bash
   tr '\0' '\n' < /proc/<bridge-pid>/environ | grep -c HUGINN   # expect 0
   ```

   Worth doing on the **bridge** process rather than quickshell: quickshell
   never had the variable, so checking it there would return 0 either way and
   prove nothing. That mistake was already made once in this issue's
   investigation.
