---
status: draft
issue: 211
intent: intent/2026-11-06-206-character-friends.md
---

# Spec: approve and deny for other agents

Slice 5 of the #206 intent: approval for Claude, Codex and agy running in other terminals, with approved and
denied shown, and the coding terminal for other agents. Almost all code is in `olafkfreund/nixoarchy-snowflake`
(line numbers from `3725751`; re-find them by name). Hook wiring is in `olafkfreund/nixos_config`. This repo's
`bridge/` is not touched: it serves Nixi's own turns, and #219's `send-policy.js` stays its guard.

## Spike: what the agents really expose

Read-only, from the installed binaries and their embedded docs. Nothing was configured or run against an agent.

| Agent | Hook that fires at the agent's own prompt | Can it answer? | Result hook |
|---|---|---|---|
| Claude Code 2.1.319 | `PermissionRequest` (already in `/etc/claude-code/managed-settings.json` for tmux-ccm) | allow or deny | `PostToolUse`, `PostToolUseFailure` |
| Codex 0.167.0 | `PermissionRequest` | allow or deny | `PostToolUse` (has `tool_use_id`, `tool_response`) |
| agy 1.5.2 | **none** | no | `PostToolUse` (has `error`) |

Evidence:

- **Codex.** The binary embeds `permission-request.command.input` (`session_id`, `turn_id`, `cwd`, `tool_name`,
  `tool_input`, `permission_mode`; no `tool_use_id`) and `permission-request.command.output` with
  `hookSpecificOutput.decision.behavior` = `allow | deny`. `updatedInput`, `updatedPermissions` and
  `interrupt: true` "currently fail closed". `PreToolUse` declares `allow | deny | ask`, but the binary rejects two of
  them: "PreToolUse hook returned unsupported permissionDecision:allow" and "…:ask". So `PreToolUse` can only deny,
  as known. Events: `PreToolUse PermissionRequest PostToolUse PreCompact PostCompact SessionStart SessionEnd
  SubagentStart SubagentStop UserPromptSubmit Stop`. User hooks in `~/.codex/hooks.json` run only after they are
  trusted in `/hooks`; managed hooks in `/etc/codex/requirements.toml` are trusted (`claude-code-managed.nix:1031`).
- **agy.** The embedded hook guide lists six events only: `SessionStart PreToolUse PostToolUse PreInvocation
  PostInvocation Stop`. There is no permission-prompt event and **no `Notification` event**. `PreToolUse` runs
  before **every** tool step and may return `allow | deny | ask | force_ask` (schema also has
  `deny_unless_prior_grant`); "`allow`: Automatically allow the tool execution". Its input is `toolCall {name,
  args}`, `stepIdx`, `conversationId` and workspace paths, with nothing that says whether agy itself would ask.
- **Consequence for agy.** Answering from `PreToolUse` would mean Nixi deciding *when* to ask, and an `allow` would
  skip agy's own prompt. That breaks two intent rules: "he asks only when the agent itself would ask" and "the
  agent's own guards still run". **agy gets no approve or deny in this slice.** It keeps "open the session".
- **Side finding: agy's "needs you" never fires.** `attention_parse` in `server.py` treats an agy
  `hook_event_name == "Notification"` as "ask", but agy 1.5.2 has no such event, and `~/.gemini/config/hooks.json`
  wires `nixi-companion` to `Stop` only. Today Nixi only ever hears "agy finished".
- **Side finding, not verified live: agy's `coder-guard` may auto-approve everything.** `~/.gemini/config/hooks.json`
  answers `{"decision":"allow"}` on every agy tool step when `AGY_CODER` isn't 1. By agy's own docs, that skips
  agy's prompt for every tool. This belongs to nixos_config, not this slice (see open question 5).
- **Not verified, so it's plan step 1:** whether Claude's and Codex's own prompts show *while* a
  `PermissionRequest` hook is still running, or only after it returns; what each does when the hook prints nothing
  or times out; and how Claude combines two `PermissionRequest` hooks (Nixi's and tmux-ccm's). The probe uses
  session-only settings (`claude --settings <file>`, a scratch `CODEX_HOME`) and changes no config.

## Design

### 1. One new hook command, for Claude and Codex only

`bin/nixi-companion approve --from claude|codex` sits beside `attention` in the launcher and uses the same
`runtime.json` lookup. It reads the hook JSON on stdin and POSTs to a new `/api/agent-approve`:

- `from`, `session_id`, `turn_id` (Codex), `tool_use_id` (Claude, when present), `cwd`, `tool_name`, `tool_input`;
- the same `target` as `attention` (herdr pane and ancestor pids), so "open the session" keeps working.

It blocks until the server answers, then prints exactly one of:

- the agent's own allow JSON, only when the server says a click allowed **this** request id;
- the agent's own deny JSON, when a click denied it;
- **nothing, exit 0**, in every other case: Nixi not running, the setting off, an unknown agent, a lost connection,
  a timeout, "answer in the terminal", or anything unexpected.

What the agent does after "nothing" is a prerequisite, not a claim: plan step 1 must show that each agent then
shows its own prompt, and does not allow. It must also show what a crash, malformed output and a killed hook do, and
how a second `PermissionRequest` hook (tmux-ccm's) combines with Nixi's, including one that allows after Nixi denies.
**If any probe fails, that agent is left out, and the slice ships for the others or not at all.**

No answer is never an approval, and the agent's own permission rules run before the hook is ever called, because
`PermissionRequest` only fires where the agent would have asked. That includes Claude's `ask` rules from #219
(`Bash(*gog *)`). Probe 1 checks this ordering too.

**Trust boundary.** The request comes from a same-user process, as `attention` does today. The server can't tell a
real hook from another program running as you. A forged request only makes a card whose "yes" unblocks nothing
real; a forged result only changes what the card says. The spec claims nothing stronger than that.

### 2. The card: click-only, the real command, one answer

The server reuses `Approvals` and the page's existing card (`queueApproval`, `approvalGone`). An agent card is
published as `t="approve"` with:

- `confirm: "click"` and `always: false`, for every tool.
  - The page already makes yes click-only: voice gets "click to confirm" (`voiceAnswer`, `index.html:2895`), and `Y`
    and Enter are swallowed (`index.html:4037`).
  - `N` and Escape still deny, as for #219's cards. A deny is the safe answer, and "click-only" here means approving.
  - The server also refuses `always` for an agent card, rather than trusting the page not to offer it.
- `detail`: the real command from `tool_input`.
  - For a shell tool, that's `command` verbatim: the full text with newlines kept, and an argv array shell-quoted as
    in #50.
  - Other tools show the tool name and their input as JSON, with any `description` key removed.
  - The agent's `description` is never shown or spoken, because a compromised agent writes it.
- `agent` and `project`, for the head line: "Codex · nixi-nixarchy wants to run".
- `id`: a fresh `secrets.token_hex(8)` per request. The answer names that id.
- Each request moves once, under the lock, from pending to exactly one of answered, expired, released or cancelled.
  The answer call checks the deadline itself. A second answer, a late click after the deadline, a second card or a
  stale click finds nothing. Today's `Approvals.answer` sets `ans` outside the lock, so two answers can overwrite
  each other; agent cards don't use that path.

### 3. A click key that agents can't read

Today any process running as the user can read `runtime.json` (mode 0600, but agents run as the same user) and
POST `/api/approve/answer` with the window's full token. So an agent could approve its own request.

- The server makes a `CLICK_KEY` per run. It is never written to disk or the environment.
- **Agent approvals stay off until the window's page has claimed the key.** Until then, every request gets no
  decision.
- The page claims it once per server run from `/api/click-key`, with the full token. A second claim fails, and it
  switches agent approvals off for this run, with a line on his card saying why.
  - So if something else claims first, the window's claim fails and the user sees it.
  - If no window ever claims (the browser fallback, or the window failed), approvals never turn on.
- **Every `confirm: "click"` card needs `X-Nixi-Click: CLICK_KEY` to be approved:** agent cards, and Nixi's own #95
  herdr writes and #219 gog sends. Today any same-user process can answer those with `runtime.json`. A deny needs
  only the token, as today. This is a requirement of the slice, because §6 depends on it.
- The page sends the key only from a button handler where `event.isTrusted` holds. That stops a synthetic click
  inside the page, nothing more. The server's guard is the key's secrecy.
- **Residual risk, stated plainly:** same-user isolation is weak.
  - A process that wins the claim race at startup holds the key for that run. It's detected (the window's claim
    fails, and approvals go off), not prevented.
  - A process allowed to ptrace the window could read the key. Yama `ptrace_scope` is 1 here, so only the window's
    ancestors can.
  - Binding the key to a window-only channel, such as a pipe inherited at launch, is the upgrade if this proves
    too weak.

### 4. Timeout, the terminal, and dismissal

- The card waits up to `agent_approve_wait` seconds (default 60, open question 1), then goes away, and the hook
  prints nothing. The hook's timeout in the agent config is that wait plus 15 s.
- The card has an "Answer in the terminal" button. It releases the hook with no decision.
- If the hook's connection closes (the user answered in the terminal and the agent killed the hook, or the agent
  quit), the server notices and removes the card (`approve_done`). Whether the terminal can be answered while the
  hook waits is what plan step 1 finds out. If it can't, the button and the timeout are the only way back.
- When Nixi is hidden, locked or in a meeting, the card still arrives, as approvals do today (intent: "approval
  requests keep getting through"). The voice says only "Codex wants to run a command" and never reads the command.

### 5. Approved and denied show the agent's real result

- **The result hook.** A new `nixi-companion result --from claude|codex` runs on the agents' `PostToolUse` (and
  Claude's `PostToolUseFailure`).
  - It sends a key, ok or failed, and the exit code only when probe 1 shows where the agent reports one. It never
    sends output.
  - The key is `tool_use_id` when the agent gives it at both ends. Claude may; Codex's `PermissionRequest` has none.
  - Otherwise the key is `(agent, session_id, turn_id, tool_name, sha256 of tool_input)`. The launcher serialises the
    input with `json.dumps(sort_keys=True, separators=(",", ":"))` for both `approve` and `result`, so they match.
  - A match is consumed once. If two answered requests share a key, the result is "unclear" and is not guessed.
- **The states never claim more than is known:**
  - Approved, then a matching result: "Codex ran it ✓" or "Codex ran it: failed (exit 2)". Without an exit code
    it's only ✓ or ✗.
  - Approved, with no result within 15 minutes: "approved, result unknown".
  - Denied: "denied in Nixi". Sending the deny proves neither delivery nor obedience, so it never says "didn't run".
  - Denied, then a matching result: "ran anyway" in red, so a broken guard shows. A later identical retry the user
    approved in the terminal also looks like this, so the text says "a matching command ran after you denied".
- These drive the intent's "approved" and "denied" reactions, played by the reactions slice (#208). This slice sends
  `t="agent_result"` with `{agent, ok, state}`.
- A `PostToolUse` that matches nothing does nothing. The hook spawns once per tool call and exits at once when
  nothing is pending. It costs one small process per tool call. A pending-hash file read in the launcher is the
  upgrade if that proves slow.

### 6. #219 is not bypassed

Scope: this slice adds no new way for a send to happen without a click. It does not widen #219 to the other
agents' own permission rules. A send that Codex's or agy's own config already allows never reaches Nixi, and
neither does one through agy's `coder-guard` (open question 5). Claude's managed `ask` rules from #219 still send
Claude's gog sends to a prompt, and so to this card.

- Every agent card is click-only, so a gog send or a herdr write from another agent is too.
- Approving any click-only card, Nixi's own included, needs the click key (§3). The path that exists today, the
  full token from `runtime.json`, is closed.
- "Always" is never offered or stored for agent cards.
- They are excluded from every automatic answer: Trust and Root modes and any auto-yes never reach them.
- The server runs #219's `click_only` / `send_detail` (snowflake PR #65) on the command. A gog send or herdr write
  answered on an agent card goes into `DATA_DIR/sends.log` with the same fields #219 logs: addresses or id and the
  decision, never the body.
- The hook never answers anything the agent wouldn't have asked about, if probe 1 confirms it. The server never
  returns allow without a keyed click on that id.
- This repo's `bridge/` and #219's `send-policy.js` are unchanged.

### 7. The coding terminal for other agents

The working signal comes from hooks that exist: Claude's and Codex's `UserPromptSubmit`, and agy's
`PreInvocation`. Each calls `nixi-companion attention --from X --hook`. `attention_parse` maps them to a new kind
`working` that carries no text. The page shows the existing coding terminal with the agent's name, as it does for his
own turns:

- decoration only, never the agent's real code;
- it shrinks after about a minute;
- it ends on the agent's existing "finished" signal, or after 15 minutes without a signal.

The existing 30 s rate limit per agent and kind keeps agy's per-model-call `PreInvocation` quiet. It plays within
the calm rules from the intent.

### 8. Off until switched on

- A setting, `agent_approvals`, is off by default. When it's off, `/api/agent-approve` answers "no decision" at
  once, and the agent prompts as today.
- Hook lines are documented in `docs/GUIDE.md` beside today's `attention` lines.
- On this machine they go in nixos_config. Codex's go in `/etc/codex/requirements.toml`, because user hooks need
  manual trust. Claude's go in the managed settings, beside tmux-ccm's.

### Files a plan would touch

- `nixoarchy-snowflake`:
  - `bin/nixi-companion`: `approve`, `result`;
  - `app/server.py`: `/api/agent-approve`, `/api/click-key`, the keyed answer, result matching, the `working` kind,
    the setting. **The live #208 session is editing this file**;
  - `app/static/index.html`: the agent card head, the trusted-click key, "Answer in the terminal", the result state,
    the terminal for agents. **The live #208 session is editing this file**;
  - `docs/GUIDE.md`;
  - `tests/test_approvals.py` (from #219);
  - a new `tests/test_agent_approvals.py`.
- `nixos_config`:
  - `modules/programs/claude-code-managed.nix`: Codex `PermissionRequest`/`PostToolUse`/`UserPromptSubmit` in
    `requirements.toml`, and Claude's hooks;
  - `~/.gemini/config/hooks.json` via its owner: agy `PreInvocation`;
  - `hosts/common/nixos/omarchy-nixi-companion.nix` if the setting is set there.
- This repo: none.

## Alternatives rejected

- **agy through `PreToolUse`.** It fires on every step with no "would agy ask" signal, so Nixi would have to guess
  agy's policy, and `allow` skips agy's own prompt. Rejected by the intent's rules.
- **Codex through `PreToolUse`.** It can only deny, and it fires before Codex knows whether it would ask.
- **Typing "y" into the agent's pane with herdr.** It's blind to what the prompt actually shows, it races the
  terminal, and #95 forbids writes from the companion.
- **The `TOOL_TOKEN` for answers.** Agents and hooks hold it by design.
- **A timeout that denies instead of falling back.** It would stop an unattended agent for good, where the agent's
  own prompt can still be answered at the terminal. Silence is still never an approval.
- **Showing tool output in the result.** It could put secrets on a shared screen. Status and exit code are enough
  for "approved" and "denied".
- **Voice answers, with a guard.** The intent says click-only at first.

## Risks

- **The hook blocks the agent's prompt** (if step 1 finds that it does). Then the user at the terminal waits up to
  the card's timeout. This is mitigated by "Answer in the terminal", the 60 s default, and the setting being off by
  default.
- **Two `PermissionRequest` hooks in Claude** (Nixi's and tmux-ccm's) may combine in an order we don't know. If
  tmux-ccm ever returns a decision, it could win. Step 1 checks this.
- **Hook output format drift.** Codex fails closed on reserved fields; what a malformed answer does is unverified
  until probe 1. Tests pin the exact JSON for both agents at the installed versions.
- **Same-user forgery.** Fake cards and fake results are possible (§1, trust boundary), and so is a stolen click key
  at startup (§3). Neither can make an agent run something without a click on a real request.
- **A process per tool call** from the result hook, on p620 and razer.
- **A click-key race at startup.** It's detected, not prevented. See §3.
- **Merge conflicts** with the #208 session in `server.py` and `index.html`. The plan sequences after #208 merges.
- **agy users get less than the intent hoped:** no approve or deny, and today not even "needs you".

## Verification

- **Unit tests** (`tests/test_agent_approvals.py`):
  - one id, one answer: a second answer, a late answer after the deadline and `always` are refused;
  - approving an agent card, a herdr write or a gog send without `X-Nixi-Click` is refused, and so is one with the
    `TOOL_TOKEN` or the full token alone;
  - before the page has claimed the key, every request gets no decision;
  - a second click-key claim fails and turns approvals off;
  - a timeout, a closed connection or the setting off gives no decision;
  - the card's `detail` is the verbatim command and never the `description`;
  - `always` is false and `confirm` is `click` for every agent card;
  - Trust and Root modes and any auto-yes never answer an agent card;
  - a gog send writes a `sends.log` line with no body;
  - the result key matches across `approve` and `result`, is consumed once, and two answered requests with the same
    key give "unclear";
  - a match after a deny gives "ran after you denied"; a deny alone gives "denied in Nixi".
- **The hook script**, given recorded Claude and Codex payloads: allow, deny and silence print exactly the agent's
  schema, which for Codex is `permission-request.command.output` at 0.167.0.
- **Probe 1, a gate before any code is enabled:** the probes listed in §1, with session-only settings, recorded in the
  plan. An agent that fails one is left out.
- **The existing suite:** `python -m unittest` in the snowflake repo, and the browser fit tests for the card.
- **Live, once, on p620 after deploy:**
  1. a Codex session asks to run `uname -r`, the card shows it, a click on yes gives "ran it ✓";
  2. a Codex `gog gmail send …` gives a click-only card, and `Y` and the voice do nothing;
  3. a Claude Code deny gives "denied in Nixi", and Claude doesn't run it;
  4. letting the card time out makes the agent show its own prompt;
  5. agy coding shows the terminal.

## Open questions

1. **How long does a card wait before the terminal takes over?** Recommended: 60 s, plus the "Answer in the
   terminal" button.
2. **Is it OK that agy gets no approve or deny until agy adds a prompt-time hook?** Recommended: yes, keep "open the
   session" for agy, and check again at each agy update.
3. **Where are the hooks installed?** Recommended: nixos_config on your hosts, with Codex's in the managed
   `requirements.toml`, and `docs/GUIDE.md` for everyone else.
4. **Is status and exit code enough for the result?** Recommended: yes, never output.
5. **Does agy's `coder-guard` `{"decision":"allow"}` auto-approve every agy tool today?** Recommended: confirm it
   with one live check, and if it does, fix it in nixos_config, outside this slice.

## Reviews (2026-11-07)

Codex reported `gpt-6.1-sol`; agy reported no model. Both read the draft and the same evidence excerpts, read-only.
agy had no shell, so its evidence was in the prompt. Their findings don't approve anything.

**Confirmed and applied:**

- Both: a process that claims the click key first holds it, and if the window never claims, nothing notices.
  Approvals now stay off until the window claims (§3), and the residual is stated.
- Both: leaving Nixi's own click-only cards unkeyed kept a path around #219. It's now a requirement, and the open
  question is gone (§3, §6).
- Codex: requests and results come from same-user processes and can be forged. The trust boundary is now stated
  (§1).
- Both: the fallback after "no decision", and how two Claude hooks combine, were asserted but unverified. They're now
  probes that gate the slice (§1).
- Codex: §6 overclaimed. A send that an agent's own config allows never reaches Nixi. The scope is now stated.
- Codex: hashing the content can't tell identical calls apart. Now: `tool_use_id` where it exists, a consume-once
  match, and "unclear" when it's ambiguous (§5).
- Codex: "didn't run it" claimed more than a deny proves. It's now "denied in Nixi", and an unknown result stays
  unknown (§5).
- Codex: a single state transition per request, the deadline checked in the answer call, and `always` refused by the
  server (§2). It also noted that today's `Approvals.answer` sets `ans` outside the lock.
- Codex: JSON input for other tools could show a `description` key. It's now removed (§2).

**Refuted:**

- Codex: `N` and Escape deny a click-only card. True, and kept: a deny is the safe answer, as for #219. The spec now
  says click-only means approving.
- agy: "`/api/agent-approve/answer` accepts `TOOL_TOKEN`". The handler checks `TOOL_TOKEN` only for paths in
  `TOOL_PATHS`, and the answer path isn't one.
- agy: a per-run key allows replay. A per-request key gives nothing more to a holder of the full token, who can read
  card ids from the event bus. It's the same root as the claim race.
- agy: the result hash is computed over `approval_text`. Both sides hash the raw `tool_input`, now with a fixed
  serialisation (§5).
- agy: simply reuse `Approvals.ask`. The draft already reuses `Approvals`, and the key is needed because the full
  token is readable.
- agy: the `coder-guard` finding contradicts "agy gets no approve or deny". One is agy's existing config, the other
  is this slice's scope.
- agy: Codex expects `permissionDecision`. That's the `PreToolUse` schema; `PermissionRequest` uses
  `decision.behavior`.

**Unverified:** live hook timing, the fallback after "no decision", how two hooks combine, the meaning of Codex's
`tool_response`, and whether `coder-guard` auto-approves. All are probe 1, or open question 5.
