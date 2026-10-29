---
status: draft
issue: 119
spec: spec/2026-10-29-119-review-docs-small-fixes.md
coders:
  1: agy     # docs and wording; agy in accept-edits via the handoff skill
  2: agy
reviewers:
  - codex
---

# Plan: docs say what the code does, and small review fixes

## Approved decisions

- README Guide bullet: one sentence. A switch to Guide inside a conversation stops
  changes at once; read-only shell commands can run until a new chat, because rules
  are fixed when a conversation starts.
- The card's `/guide` acknowledgement says "Guide is complete from your next chat"
  when the session started at Mechanic.
- `docs/architecture.md:349-350`: learned facts are written only at Mechanic, and
  skipped at Guide (#51).
- `herdrWriteDetail` and `auditSend` join argv arrays.
- `role: "Claude"`: no change.

## Steps

1. **Docs and card text.**
   - `README.md` Guide bullet (~196-202): add the sentence.
   - `docs/architecture.md:349-350`: replace the sentence.
   - `Conversation.qml`: find the `/guide` acknowledgement, the status text set when
     trust becomes Guide (~2147 and the trust-change handler). When the conversation
     had started at Mechanic, append " Guide is complete from your next chat." There
     is a session-start trust property, or `sessionStartTrust` is set from the first
     `trust` event; check.

   Verify: read the diff; `node --test` still green.
   Traps:
   - `Conversation.qml` is also edited by #120 (line ~1251): touch only the Guide
     text lines.
   - No behaviour change.
2. **herdr argv.**
   - `bridge/herdr-policy.js:20-23`: `const command = toolCall?.rawInput?.command;
     const text = Array.isArray(command) ? command.join(" ") : (command ?? "");` then
     match `text`.
   - `bridge/bridge.js:624-626` `auditSend` fallback: the same join.
   - `bridge/herdr-policy.test.js`: argv `["herdr","agent","prompt","p1","hi there"]`
     → `{ pane: "p1", text: "hi there" }`.

   Verify: `cd bridge && node --test`; `nix flake check`.

## Tests

- `cd bridge && node --test`; `nix flake check`.

## Rollback

Revert the merge commit.
