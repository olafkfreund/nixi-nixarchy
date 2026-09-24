---
status: approved
issue: 53
spec: spec/2026-09-24-53-allow-always.md
---

# Plan: Let the user say "yes, and stop asking" once

Approved decisions, carried over so this file stands alone:

- **Render one button per option the agent offers**, labelled with the agent's
  own `name`. Only the agent knows what "always" scopes to.
- **Answer with the `optionId`**, not a boolean.
- **No keyboard binding for the persistent choices.** `Y`/`N` bind to the
  `allow_once` / `reject_once` options specifically.
- **`reject_always` included**, since rendering every option makes it free.
- **Degrade** to today's two buttons for an agent that offers nothing more.

## Steps

1. `Conversation.qml:45`: add `options: []` to `noPermission`, so the card's
   bindings are safe when nothing is pending.
   -> verify by the card rendering with no request.

2. `Conversation.qml:1115-1125`: `answerPermission(allow)` becomes
   `answerPermission(optionId)`, writing `{ type: "permission", id, optionId }`.
   -> verify by the bridge test in step 6.

3. `Conversation.qml:2203-2226`: replace the two hardcoded buttons with a
   `Repeater` over `pendingPermission.options`, one button per option, labelled
   with the agent's `name` rendered as **plain text** and length-bounded (it is
   agent-authored, see #42).
   -> verify by runtime check 2 and the degradation test.

4. `Conversation.qml:868-869`: bind `Y` and `N` to the `optionId` whose `kind`
   is `allow_once` / `reject_once`, found in `pendingPermission.options`, and
   disable each shortcut when no such option exists.
   -> verify by runtime check 3.

5. `bridge/bridge.js:328`: resolve with the chosen option rather than deriving
   one. Add `select(options, optionId)` beside `choose(options, kind)`; `choose`
   stays for YOLO (`:230`) and the allow-all path (`:371`), which pick a kind on
   the user's behalf rather than honouring a choice.
   -> verify by step 6.

6. `bridge/testing/fake-agent.js`: offer `allow_always` and `reject_always`
   alongside the existing pair, behind `FAKE_AGENT_OPTIONS=always`, so existing
   tests' expectations are untouched.
   -> verify by step 7.

7. `bridge/trust-policy.test.js`: assert that choosing `allow_always` resolves
   with **that** optionId; that `reject_always` likewise; that YOLO still selects
   `allow_once` and is not tempted by `allow_always`; that Guide still cancels
   with no option presented; and that an unknown `kind` is passed through when
   chosen.
   -> verify by `node --test bridge/*.test.js`.

## Tests

```bash
node --test bridge/*.test.js        # expect all pass, 5 new
nix flake check --print-build-logs  # package assertions + selfcheck
```

Runtime, after rebuild and `omarchy-restart-shell`:

1. **The actual complaint.** In Mechanic with Claude, trigger a prompt, choose
   the agent's always-option, then trigger the same shape of action again -- it
   must not ask. This is the check that decides whether #53 is fixed, and CI
   cannot do it.
2. **Degradation.** An agent offering only two options shows exactly two
   buttons, as today.
3. **Keyboard.** `Y` and `N` still answer once-allow and once-deny, and no key
   triggers a persistent choice.
4. **Guide.** Still cancels; no permission card appears at all.

## Deviations, found during implementation

**1. The SDK renames the fields between agent and client.** The spec said
options arrive as `{ optionId, name, kind }`. They do not: the agent *sends*
those names, and the SDK delivers `{ id, label, kind }` to the client. Only the
ACP response back to the agent uses `optionId`.

`choose()` already knew this and matched on `.id`; my `select()` matched on
`.optionId` and found nothing, so every answer resolved to `cancelled`. The QML
would have rendered **blank buttons** for the same reason. Caught only by
running against the real bridge -- reading the code did not reveal it, because
the two names are both plausible and both appear in the file.

**2. An unknown permission `kind` is not reachable, so its test was removed.**
The spec listed "an unknown kind is passed through when chosen" as a case, and
the risks section worried about unknown kinds breaking the card. ACP enumerates
the four kinds and the SDK rejects anything else with `Invalid params` **before
the request leaves the agent** -- measured: a fifth option with an invented kind
fails the whole turn, so the card can never be offered one. The concern is void
and a test for it would have asserted an impossibility. The reason is recorded
in the test file where the case used to be.

**3. The status line read a field that no longer arrives.** `answerPermission`
emitted `message.allow ? "Working…" : "Tool denied"`, which after step 2 is
always undefined and so always said "Tool denied". It now derives from the
chosen option's kind.

## Rollback

`git revert` the implementation commit.

- The QML and bridge changes are stateless; reverting restores the two-button
  card exactly.
- **The agent's memory is not ours and does not revert.** An "always" already
  granted stays granted wherever the agent recorded it -- Nixi cannot undo it
  and does not know where it lives. That is a known limitation of the design,
  not of the rollback, and is stated in the spec.
- If only the button rendering proves wrong (a hostile or over-long agent
  label), steps 3 and 4 can be reverted while keeping 2 and 5, which leaves the
  protocol correct and the card as it is today.
