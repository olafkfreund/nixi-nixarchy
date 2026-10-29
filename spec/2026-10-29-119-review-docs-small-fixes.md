---
status: approved
issue: 119
intent: intent/2026-10-29-119-review-docs-small-fixes.md
---

# Spec: docs say what the code does, and small review fixes

## Design

1. **Guide mid-session.**
   - README "Trust", in the Guide bullet: add one sentence. "Switching to Guide inside
     a conversation stops every change at once; read-only shell commands can still
     run until you start a new chat, because an agent's rules are fixed when a
     conversation starts."
   - The card: `Conversation.qml:2147`'s status text and the `/guide` acknowledgement
     say "Guide is complete from your next chat" when the switch happened inside a
     session that started at Mechanic. That is the one line that already reports the
     switch.
   - No behaviour change: offering to start a new chat is out of scope (intent).
2. **Learned facts.** `docs/architecture.md:349-350` becomes "The bridge writes it, not
   the agent, and only at Mechanic: at Guide it is skipped (#51)." That matches
   `bridge/bridge.js:555` and line 70 of the same doc.
3. **herdr audit with argv.** `herdrWriteDetail` (`bridge/herdr-policy.js:20-23`) joins
   an array command with spaces before matching, as `isHerdrWrite` does. `auditSend`'s
   fallback `text` (`bridge/bridge.js:625`) does the same.
4. **`role: "Claude"`: no change.** The role is only compared with `"You"`
   (`Conversation.qml:1521`) and never shown, so it has no user-visible effect.
   Renaming it would be churn in a file #120 also edits.

## Alternatives rejected

- Rename the role to the agent's label: there's no user-visible effect, and it adds
  a merge conflict risk.
- A behaviour change that restarts the session on `/guide`: out of scope per intent.

## Risks

- Docs-only for 1 and 2. Item 3 changes only the audit line's content.

## Verification

- `herdr-policy.test.js` (or `permission-detail.test.js`, wherever the herdr tests
  live): an argv `["herdr","agent","prompt","p1","hi there"]` gives
  `{pane:"p1", text:"hi there"}`.
- `node --test` green; `nix flake check`.
- Read the README and architecture diff.
