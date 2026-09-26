---
status: approved
issue: 20
intent: intent/2026-09-21-20-permission-keys.md
---

# Spec: Y and N answer a permission prompt

## Decisions carried from the intent review

- Y and N answer a prompt **only while the composer is empty**. That is the
  guard against a sentence being typed turning into consent.
- **Return does nothing** while a prompt is up.

## Design

All of it is in `Conversation.qml`, in two places.

**1. The composer's key handler** (`prompt`, the `TextArea` with
`Keys.priority: Keys.BeforeItem`) gets a first branch that runs before
anything else while a prompt is showing (`root.pendingPermissionId !== ""`):

- **Y or N**, with no modifier other than Shift, **and `prompt.text` empty**:
  `root.answerPermission(key === Y)`, and the key is accepted, so no letter
  reaches the composer.
- **Return or Enter** (any modifiers): accepted and ignored. It neither
  submits a steering message nor runs a search row.
- **Anything else**, including Y or N with text in the composer: falls
  through unchanged, so typing a steering message still works. The dialog
  stays up, and the buttons still answer it.

**2. The two existing `Shortcut { sequence: "Y" / "N" }` pairs** (overlay
and pinned window) get the same guard. Their `enabled` becomes
`root.pendingPermissionId !== "" && prompt.text.length === 0`. They still
matter when focus is not in the composer (the transcript, or a composer that is
disabled because the agent does not advertise steering), and with the guard both paths
follow one rule.

The dialog's button labels stay `N  Deny` and `Y  Allow`. One line is added
under the buttons, visible only while the composer has text: "Clear the
message box to answer with Y or N", so the rule is visible rather than
remembered.

## Alternatives rejected

- **A delay (Y counts only after 300 ms)**: rejected in the intent review in
  favour of the empty-composer rule, which is deterministic and needs no
  timer.
- **Taking focus away from the composer while a prompt is up**: it would
  drop what someone is typing as a steering message, which is exactly what
  steering exists for.
- **Return = Allow**: rejected in the intent review. One stray Return
  approving a command is the failure this issue is about.

## Risks

- **Agents that do not advertise steering** (`_meta.steering.supported` at
  initialize; the bridge decides this per agent, not by name): the composer
  is disabled while waiting, so only the `Shortcut` path runs. The guard is
  harmless there: a disabled composer holds whatever was typed before, and
  Y/N then need a cleared box or a click, the same rule as everywhere.
- **A search row selected when the prompt appears**: Return is ignored while
  a prompt is up, so it cannot run the row either. That is intended.

## Verification

- `tools/test_nixi.py` gains `test_permission_keys_guard`, a static check
  that the composer's handler tests `pendingPermissionId`, `text.length ===
  0` and `Key_Y`/`Key_N`, accepts Return while a prompt is up, and that every
  Y/N `Shortcut` carries the same `text.length === 0` guard. It is seen to
  fail on `master`. A runtime QML test is out of reach offline, which is why
  the razer run below matters.
- `nix flake check`, and the bridge tests at 41/41.
- **On razer**, using the shared method in #19's spec (a store copy and a
  symlink swap, then restored), in Mechanic with Claude, in the overlay *and*
  in a pinned window:
  1. A prompt appears with the composer empty. Y allows it, no `y` appears
     in the composer, and the agent proceeds.
  2. Another prompt appears. N denies it, with no `n` typed.
  3. Type `hello` while a prompt is up. `hello` goes into the composer, N
     only types `n`, the hint line shows, and the dialog stays.
  4. Return while a prompt is up sends nothing (the transcript is unchanged).
  5. After the prompt, Y types normally.

  Screenshots go in the PR.
