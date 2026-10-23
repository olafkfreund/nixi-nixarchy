---
status: draft
issue: 97
author: olafkfreund
---

# Intent: Secret files stay protected when Codex is nixi's agent

## Problem

nixi promises that at Guide its agent cannot read secrets (`SECRET_PATHS`: `~/.ssh/**`,
`~/.aws/**`, `.env`, `.age`, …), and that at Mechanic reading one needs the user's OK. #96 made
that true for Claude: the permission rules nixi passes to Claude turn a secret read, by tool or
by shell, into a request the bridge can cancel or show as a card.

With **Codex** as nixi's agent, the promise doesn't hold. During #96's live checks (Q6), Codex in
a conversation that started at Guide read a canary `~/x.age` and returned its contents.

- nixi runs codex-acp in Codex's `read-only` sandbox mode at both levels
  (`bridge/trust-policy.js` `MODES.codex`). That sandbox blocks writes and network but permits
  reading any file the user can read.
- nixi's secret rules are Claude permission rules (`claudePermissions`). Codex gets no
  equivalent: `CODEX_CONFIG` only carries the model and reasoning effort (`bridge/bridge.js`
  ~206-212).
- Codex auto-approves commands it considers safe (`cat`, `head`, `ls`…), so these reads never
  become a permission request the bridge could cancel.

Anyone who picks Codex (SUPER+, in the card, or `services.nixi.agents`) gets a weaker guarantee
than the docs state. #95's session summaries and the companion make that matter more.

## Proposed outcome

- With Codex as nixi's agent, a secret path can't be read at Guide, and reading one at Mechanic
  asks first. This is measured live with the same canary method as #96.
- If Codex offers no reliable per-path read restriction, nixi says so **honestly** in the card
  and the docs. Possible responses: decline to run Codex at Guide, warn when Codex is selected,
  or another measured mitigation. The docs must not keep claiming a guarantee nixi can't enforce.
- Tests cover whatever nixi sends to Codex. The live canary check is recorded in
  `docs/model-verification.md` for adapter bumps.

## Affected users and systems

- nixi: `bridge/trust-policy.js` / `bridge/bridge.js` (what nixi passes codex-acp), possibly
  `bridge/harness-policy.js`, `docs/architecture.md`, README "Trust", the agent selector if a
  warning is needed.
- Users who choose Codex as nixi's agent, in the card or the companion.

## Constraints

- No reliance on the model refusing.
- Claude's behaviour from #96 is unchanged.
- The user's own `~/.codex/config.toml` keeps working for what *they* configured. nixi
  constrains the agent, not the person (the same principle as `settingSources: ["user"]`).
- Measured, not assumed: codex-cli 0.163.0 / codex-acp as installed. Every claim about Codex's
  sandbox or approval behaviour gets a live check.

## Open questions

1. If Codex can restrict reads per path (a sandbox or config option), is that enough, or does
   nixi also need Codex's "untrusted" approval policy at Guide so every command becomes a
   cancellable request? (The spec measures what 0.163.0 supports.)
2. If neither works reliably: **block Codex at Guide** (Guide falls back to Claude, or refuses
   with an explanation), or **allow it with a clear warning** in the card that Guide's secret
   protection doesn't cover Codex?
3. opencode was inconclusive in #96 (an empty reply). Measure it in this issue too, or leave it
   for its own issue?
