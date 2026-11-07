---
status: draft
issue: 211
spec: spec/2026-11-07-211-agent-approvals.md
coders:
  3: codex   # the request lifecycle and the click key: small, security-critical state logic
  4: codex   # one flag on #95/#219 cards and a keyed answer path: small, must not weaken #219
  5: codex   # the hook launcher prints each agent's exact allow/deny JSON: small, fails open if wrong
  6: coder   # result matching and the `working` kind: ordinary server code next to step 3
  7: coder   # the page: card, key claim, result line, decorative terminal; follows existing CP and card code
  8: agy     # docs/GUIDE.md hook lines and the settings text: mechanical prose
  9: coder   # nixos_config module, modelled line for line on agent-voice.nix
reviewers:
  - codex    # the answer path and #219 interplay need a second reader on security
  - agy      # independent read of the page and nixos wiring
---

# Plan: approve and deny for other agents

Everything an implementer needs is here; the spec is the record of why. Snowflake line numbers are from
`origin/main` `3725751`; steps 3–8 start only after #208 and #219 have merged, so **re-find every region by the
name given, never by number**.

## Approved decisions (carried over from the spec and its approval)

1. **Claude Code and Codex only.** Their `PermissionRequest` hook fires where the agent itself would ask and can
   answer allow or deny. **agy gets no approve or deny** (no hook at its own prompt; its `PreToolUse` runs on every
   step and `allow` skips agy's prompt). agy keeps "open the session". Check again at each agy update.
2. **Hook `nixi-companion approve --from claude|codex`** reads the hook JSON on stdin, POSTs `/api/agent-approve`
   with `from, session_id, turn_id, tool_use_id (if any), cwd, tool_name, tool_input` and the same `target` as
   `attention`, blocks, then prints the agent's allow JSON only when the server says a click allowed that request
   id, the agent's deny JSON when a click denied it, and **nothing (exit 0) in every other case**.
3. **Card:** `t="approve"`, `confirm:"click"`, `always:false` for every tool; the server also refuses `always` for
   an agent card. `detail` is the real command (`tool_input.command` verbatim, newlines kept, argv shell-quoted as
   #50); other tools show tool name plus input JSON with any `description` key removed. The `description` is never
   shown or spoken. Head line: "Codex · <project> wants to run". `N`/Escape still deny (deny is the safe answer).
4. **One answer:** id `secrets.token_hex(8)`; each request moves once, under the lock, from pending to exactly one
   of answered / expired / released / cancelled; the answer call checks the deadline itself.
5. **Click key:** `CLICK_KEY` per server run, never on disk or in the environment. The page claims it once from
   `/api/click-key` (full token). Agent approvals stay off until it is claimed; a second claim fails and turns agent
   approvals off for the run, with a line saying why. **Approving any `confirm:"click"` card needs
   `X-Nixi-Click`**: agent cards and Nixi's own #95 herdr-write and #219 gog-send cards. A deny needs only the
   token, as today. The page sends the key only from a button handler where `event.isTrusted` holds.
6. **Wait 60 s** (a constant, `AGENT_APPROVE_WAIT = 60`, not a setting), then the card goes and the hook prints
   nothing; the agent's hook timeout is 75 s and the launcher's HTTP timeout 70 s. An "Answer in the terminal" button releases the hook with no decision. A closed hook connection
   removes the card. Hidden, locked or in a meeting: the card still comes; the voice says only "Codex wants to run
   a command".
7. **Result:** `nixi-companion result --from claude|codex` on `PostToolUse` (and Claude's `PostToolUseFailure`)
   sends a key, ok/failed and an exit code only where probe 1 found one; never output. Key = `tool_use_id` when the
   agent gives it at both ends, else `(agent, session_id, turn_id, tool_name, sha256(json.dumps(tool_input,
   sort_keys=True, separators=(",", ":"))))`. Consumed once; two answered requests with one key → "unclear".
   States: "Codex ran it ✓/✗ (exit N)", "approved, result unknown" (15 min), "denied in Nixi", red "a matching
   command ran after you denied". Event `t="agent_result"` `{agent, ok, state}`.
8. **#219 not bypassed:** every agent card click-only; no `always`; no automatic answer (Trust/Root, auto-yes);
   gog sends and herdr writes on agent cards are logged with #219's `send_detail` + `sends_log`; the key closes
   today's runtime.json path for #95/#219 cards. This slice does not widen #219 to other agents' own rules.
9. **Working signal:** Claude's and Codex's `UserPromptSubmit`, agy's `PreInvocation` → `nixi-companion attention
   --from X --hook` → `attention_parse` kind `working`, no text. The page shows the code panel with the agent's
   name, decoration only, shrinks after ~1 min, ends on "finished" or 15 min silence. The 30 s rate limit stays.
10. **Off by default:** setting `agent_approvals` false; off → `/api/agent-approve` answers "no decision" at once.
11. **Hooks** go in nixos_config (Codex's in the managed `requirements.toml`); `docs/GUIDE.md` for everyone else.
12. **coder-guard** (agy auto-allow): one live check in step 1; any fix is a nixos_config issue outside this slice.
13. **Trust boundary:** requests and results come from same-user processes; forgery can make a fake card or a fake
    result line, never make an agent run something without a click on a real request.

## Where the work happens (snowflake, `origin/main` `3725751`)

| File | Region (find by name) | This plan | Also touched by |
|---|---|---|---|
| `app/server.py` | `TOKEN`/`TOOL_TOKEN` (~60-66) | add `CLICK_KEY` | — |
| | `DEFAULTS` (~220) and the settings save list | `agent_approvals` | #208 (`reactions` at :220, `NOTIFY_FLAGS` :4787, :6177, :6510) |
| | `is_nixi_see` … `Tickets` (~796) | **read only**: `click_only`, `send_detail`, `sends_log` | #219 adds them here |
| | `class Approvals` (~811-905): `ask`, `ask_bridge`, `answer` | one `item["click"]` line in each of `ask` and `ask_bridge`; `answer` gains `keyed` | #219 edits `ask` (~830-870) |
| | after `APPROVALS = Approvals()` (~905) | new `class AgentApprovals`, `AGENT_APPROVALS` | — |
| | `attention_parse` (~1166-1200) | `working` kind | #208 reads `attention` |
| | `send_hooks_file` / `build_cmd` (~4900-5045) | **not touched** | #219 |
| | `do_POST` (~6643-6700): `/api/approve/answer` | keyed answer | — |
| | `do_POST`: new `/api/click-key`, `/api/agent-approve`, `/api/agent-result` | new | — |
| `app/static/index.html` | card: `queueApproval`, `nextApproval`, `answer`, `approvalGone` (~2865-2912) | head line, key header, terminal button, result line | — |
| | keys (~4037) | unchanged (Y/Enter already swallowed for click cards) | — |
| | event dispatch (~2305-2325): `attention`, `approve_done` | `working`, `agent_result` | #208 (attention → mark) |
| | `const CP` (~4040-4140) | decorative mode for another agent | — |
| | settings, Agents section (~918) | one switch | #208 adds a switch nearby |
| `bin/nixi-companion` | the `attention` block (~28-80) | `approve`, `result` subcommands after it | — |
| `docs/GUIDE.md` | the hook lines (~150-160) | new lines | — |
| `tests/` | `test_approvals.py` (#219) | extend for the key | #219 creates it |
| | new `test_agent_approvals.py`, `tests/fixtures/hooks/` | new | — |

**Never edit #219's helpers** (`_send_texts`, `_is_gog_send`, `click_only`, `send_detail`, `sends_log`,
`send_hooks_file`, the #219 lines of `Approvals.ask`, `build_cmd`'s `--settings`). Call them.

**How the key changes #95/#219 cards without weakening them.** `Approvals.ask` already computes `co =
click_only(cmd)`; add `item["click"] = co` right after `item` is built. `ask_bridge` gets `item["click"] = confirm
== "click"`. `Approvals.answer(aid, ans, keyed=False)` returns False and leaves the item pending when
`item["click"]` and either `ans == "always"`, or `ans == "yes"` and not `keyed`. So an unkeyed yes is simply not an answer: the card
stays, the timeout and #219's `sends_log(..., "timeout")` behave as before, and `N`/no still answers. This only
removes approve paths. Trust/Root still asks and `sends.log` is unchanged (values stay `allow`/`deny`/`timeout`).
One #219 behaviour changes on purpose: #219 turns "always" on a click-only card into a one-time yes
(`ans == "always" and not can_always` → `"yes"`); this plan refuses it and the card stays pending (see "Changed on
purpose").

nixos_config: new `modules/programs/nixi-agent-hooks.nix`, imported from `hosts/common/nixos/omarchy-nixi-companion.nix`
(p620, razer). Pattern: `modules/programs/agent-voice.nix` (managed Claude hooks via
`modules.programs.claude-code-managed.settings.hooks`, Codex via `/etc/codex/hooks/*` + `mkAfter` on
`codex/requirements.toml`, agy via a jq merge of `~/.gemini/config/hooks.json` in home activation).

## Steps

1. **Live probes** (me, with the user, on p620; no repo edits except recording results in this plan).
   Prepare once, in a private directory (never a fixed path, never `rm -rf` of one):
   ```bash
   P=$(mktemp -d /tmp/nixi-probe.XXXXXX); mkdir -p $P/work $P/log; export P
   # the probe hook: $1 = agent, $2 = slot (a|b). Logs its stdin and timing per case, then acts on its mode.
   cat > $P/hook.sh <<'SH'
   #!/bin/sh
   d="$P/log/$CASE"; mkdir -p "$d"; mode=$(cat "$P/mode-$2")
   cat > "$d/$1-$2-$(date +%s%N).json"; echo $$ > "$d/$1-$2.pid"
   echo "start $(date +%s.%N) $mode" >> "$d/$1-$2.timing"
   trap 'echo "killed $(date +%s.%N)" >> "$d/$1-$2.timing"; exit 143' TERM INT
   case "$mode" in
     silent) ;; sleep30) sleep 30 & wait ;; sleep90) sleep 90 & wait ;;
     garbage) echo '{not json' ;; crash1) exit 1 ;; crash2) echo "probe deny" >&2; exit 2 ;;
     allow) cat "$P/allow.json" ;; deny) cat "$P/deny.json" ;;
   esac
   echo "end $(date +%s.%N)" >> "$d/$1-$2.timing"
   SH
   chmod +x $P/hook.sh
   echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}' > $P/allow.json
   echo '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"deny","message":"probe deny"}}}' > $P/deny.json
   echo silent > $P/mode-b                      # slot b is a no-op except in P7
   ```
   Each case: `export CASE=<id>`, write the mode(s) to `$P/mode-a` (and `$P/mode-b`), ask the agent to run
   `touch $P/ran-<id>`, observe, write one line in "Probe results". **Every pass needs the case's own log
   directory to hold a payload with `"hook_event_name": "PermissionRequest"` and that exact command**; without it
   the case is void, not passed. P6 `allow` is the positive control: the same command really runs through the hook.

   **Claude** (session-only: `--settings`; managed settings, including tmux-ccm's hook, still load):
   ```bash
   cd $P/work && claude --settings "$(jq -n --arg a "$P/hook.sh claude a" --arg b "$P/hook.sh claude b" \
     '{hooks:{PermissionRequest:[{hooks:[{type:"command",command:$a,timeout:60},{type:"command",command:$b,timeout:60}]}]}}')"
   ```
   P3 starts a second session with `timeout:20` for slot a. P9 adds `PostToolUse` and `PostToolUseFailure` entries
   running `$P/hook.sh claude a` with `mode-a` = `silent`. First, `/hooks` in the session shows Nixi's probe hooks
   and tmux-ccm's: record what it lists (the effective configuration).
   **Codex** (session-only: a scratch `CODEX_HOME`; `auth.json` is a symlink, never a copy, and a token refresh may
   write through it, which is ordinary use):
   ```bash
   mkdir -p $P/codex-home && ln -s ~/.codex/auth.json $P/codex-home/auth.json
   jq -n --arg a "$P/hook.sh codex a" --arg b "$P/hook.sh codex b" \
     '{hooks:{PermissionRequest:[{hooks:[{type:"command",command:$a,timeout:60},{type:"command",command:$b,timeout:60}]}]}}' \
     > $P/codex-home/hooks.json
   cd $P/work && CODEX_HOME=$P/codex-home codex -a untrusted -s read-only
   ```
   Trust both probe hooks once in `/hooks` (this writes only `$P/codex-home/config.toml`), and record what `/hooks`
   lists, including the managed `requirements.toml` hooks (coder-guard, agent-say).

   | # | Case (`mode-a` / `mode-b`) | Pass when |
   |---|---|---|
   | P1 | `silent` / `silent` | the agent shows its own prompt; `ran-P1` exists only after a yes there |
   | P2 | `sleep30` / `silent` (timeout 60) | recorded, not pass/fail: does the agent's prompt show while the hook sleeps, and does answering it kill the hook (`killed` in the timing file)? Picks the "Answer in the terminal" wording |
   | P2k | `sleep30`, then `kill -KILL $(cat $P/log/P2k/<agent>-a.pid)` after 5 s | the agent shows its own prompt or denies; it never runs unasked |
   | P3 | `sleep90` with hook timeout 20 | after the timeout, the agent shows its own prompt or denies; it never runs unasked |
   | P4 | `garbage` | not run without a terminal yes |
   | P5 | `crash1`, then `crash2` | not run without a terminal yes (crash2 may deny) |
   | P6 | `allow`, then `deny` | allow: runs with no prompt (the positive control); deny: not run, and the agent reports the denial |
   | P7 | `deny` / `allow`, then `allow` / `deny` (both orders) | both slots' timing files show they ran, and in both orders the command is not run. If an allow ever wins, that agent fails |
   | P8 | Claude only: add `permissions.ask:["Bash(*gog *)"]` and `permissions.allow:["Bash(echo:*)"]` to the `--settings`; ask it to run `echo gog send probe`; `silent` | the P8 log holds a `PermissionRequest` payload for that exact command |
   | P9 | payloads | recorded: does Claude's `PermissionRequest` carry `tool_use_id`; where each agent's `PostToolUse` / `PostToolUseFailure` puts the exit code; does Codex's `turn_id` match between `PermissionRequest` and `PostToolUse` |
   | P10 | tmux-ccm: `allow`, then `deny`, with tmux-ccm's managed hook loaded | the outcome equals P6's: tmux-ccm gives no decision |
   | P11 | agy coder-guard: plain `agy` in `$P/work`, `AGY_CODER` unset, synced `hooks.json` as is; ask it to run `touch $P/ran-agy` | recorded: if it runs with no prompt, coder-guard auto-approves; note it for a nixos_config issue (decision 12). No effect on this slice |

   An agent that fails P1, P2k, P3, P4, P5, P6 or P7 is **left out**. Its approve and result hooks are not
   installed in step 9, and `/api/agent-approve` refuses its `from`. P2 picks the wording of "Answer in the
   terminal" (the button is kept either way). P9 fixes the result key and the exit-code path for step 5. agy's
   `PreInvocation` working signal is checked in step 10. Afterwards: `rm -rf "$P"` (the `mktemp` path only).
   → verify by: every row has a recorded outcome below, backed by its own log directory, and the user has seen them;
   and `sha256sum ~/.claude/settings.json ~/.codex/config.toml ~/.codex/hooks.json ~/.gemini/config/hooks.json`
   taken before the first case and after the last are identical.
   Traps: never edit `~/.claude/settings.json`, `~/.codex/config.toml`, `~/.codex/hooks.json` or
   `~/.gemini/config/hooks.json`; never copy `auth.json`; never `pkill -f` a pattern, use the pid file; one batched
   session, one control request (memory: don't repeat live tests).

2. **Gate: #208 and #219 merged** (me). Wait for snowflake #65 and nixi #222 (#219) and the #208 snowflake PR to
   merge; branch `feat/211-agent-approvals` from the new snowflake `origin/main`; re-find every region in the table
   above by name and note the new line numbers in the PR.
   → verify by `gh pr view 65 -R olafkfreund/nixoarchy-snowflake --json state`, `gh pr view 222 -R
   olafkfreund/nixi-nixarchy --json state` and #208's snowflake PR: all MERGED.
   Traps: never work on `main`; never touch the #208 session's worktree.

3. **Server: request lifecycle, endpoints and the key** (codex). `app/server.py`:
   - next to `TOKEN`: `CLICK_KEY = secrets.token_urlsafe(24)`, `CLICK = {"claimed": False, "spoiled": False}`,
     `CLICK_LOCK = threading.Lock()`, `AGENT_APPROVE_WAIT = 60`. Claim and spoil happen only under `CLICK_LOCK`;
     `click_ok(header)` reads both flags under it and compares the key;
   - `DEFAULTS`: `"agent_approvals": False`; add it where settings are saved/served (the same lists #208 extends
     for `reactions`). Switching it off, and spoiling the key, release every pending agent request (no decision);
   - `class AgentApprovals` after `APPROVALS`: `ask(req, conn)` → `{"decision": "allow"|"deny"|None}`. Returns None
     at once when the setting is off, the key is unclaimed or spoiled, `from` not in the probe-passed set
     (`AGENT_APPROVE_FROM`, a constant filled from step 1), or there is no page (`BUS.subs` empty). Otherwise one
     item `{id, from, state:"pending", deadline, key, click:True, target}`, published as `t="approve"` with
     `confirm:"click"`, `always:False`, `agent`, `project` (basename of `cwd`, as `attention_parse`), `detail`
     (decision 3; argv via the same quoting as `approval_text`'s caller), `say` = "<Name> wants to run a command".
     `target` goes through `attention_target` into `_ATTN_TARGET[from]`, so "open the session" focuses it.
   - **One transition, one owner.** `_finish(item, state, decision)` is the only place an item leaves `pending`: under
     `self.lock` it checks `state == "pending"`, and for `allow` also re-checks `click_ok` and `time.monotonic() <
     deadline`; it sets the end state and, for an answered item, registers its result key in the same critical
     section. It returns True to exactly one caller, which then (outside the lock) publishes `approve_done`, the
     immediate `agent_result` for a deny ("denied in Nixi"), and the `sends_log` line for a `click_only(cmd)`
     command, with #219's values only: `allow`, `deny`, or `timeout` for every no-answer end (expired, released,
     cancelled). `answer(aid, ans, keyed)`: `ans` must be `yes`/`no`;
     `yes` needs `keyed`; `always` is refused. `release(aid)` → `released`.
   - **The wait:** the handler thread loops `ev.wait(min(0.5, remaining))` until the item is finished or the
     deadline (then `_finish(..., "expired")`). Between slices it checks the hook's socket: `select([conn], [], [conn],
     0)`; if readable, `conn.recv(1, socket.MSG_PEEK | socket.MSG_DONTWAIT)`; `b""`, `OSError` or an exceptional
     condition → `_finish(..., "cancelled")`; bytes → ignore. The deadline is the hard bound whatever the socket
     says. No lock is held while waiting, publishing or writing the audit line.
   - `do_POST`: `/api/click-key` (full token): under `CLICK_LOCK`, the first call returns the key and sets
     `claimed`; any later call sets `spoiled`, releases pending agent requests, publishes `t="note"` "Agent approvals are off: something else asked for the click key. Restart Nixi
     to turn them back on." and returns 403. `/api/agent-approve` (full token) → `AGENT_APPROVALS.ask`.
     `/api/approve/answer`: `keyed = CLICK["claimed"] and not CLICK["spoiled"] and compare_digest(header
     "X-Nixi-Click", CLICK_KEY)`; an id known to `AGENT_APPROVALS` goes there, anything else to
     `APPROVALS.answer(..., keyed)`. `/api/approve/release` (full token) → `AGENT_APPROVALS.release`.
   - none of the new paths go in `TOOL_PATHS`.
   Tests first, in `tests/test_agent_approvals.py`: off → None at once; switching off releases pending; unclaimed →
   None; one answer; second answer refused; late answer after the deadline refused; `always` refused; yes without
   key refused, with `TOOL_TOKEN` refused, with the full token alone refused; two concurrent claims → one key, then
   spoiled; spoil between header check and answer → no allow; answer/deadline, answer/disconnect and release/answer
   races each give exactly one `approve_done` and one `sends.log` line; closed socket → cancelled; release →
   released; `detail` verbatim and never `description`; JSON input has no `description`; gog send → `sends.log`
   line with no body; the key never appears in `server.log` or `runtime.json`; the only code path that returns
   `allow` is `_finish` after a keyed answer (a grep-style test on the source, as `test_no_herdr_writes` does).
   → verify by `python -m unittest tests.test_agent_approvals tests.test_approvals -v`.
   Traps: never edit #219's helpers; `Approvals.answer`'s own race stays for step 4 to respect, not to redesign;
   a `ThreadingHTTPServer` handler thread blocks for up to 60 s (as `/api/approve` already does for 600 s), so
   never hold a lock while waiting.

4. **The key on Nixi's own click-only cards** (codex). First rebase onto what actually merged for #219: its heads
   moved in round 3 (for example `$` and backticks count as a send, and `<<` or a newline logs no recipient), so
   re-find `Approvals.ask`, `ask_bridge`, `answer`, `click_only`, `send_detail`, `sends_log` and
   `tests/test_approvals.py` by name at that point, and read the merged `ask` before editing it.
   `app/server.py`: in `Approvals.ask`, `item["click"] = co`
   right after `item = {...}`; in `ask_bridge`, `item["click"] = confirm == "click"`; `Approvals.answer(self, aid,
   ans, keyed=False)`: if `it.get("click")`, refuse `always` outright (return False; the card stays) and refuse an
   unkeyed `yes`, before setting `ans`. `ask_bridge` also publishes `always=False` when `confirm == "click"`. Extend `tests/test_approvals.py`: a gog-send card and a bridge `confirm:"click"` card are not
   approved by an unkeyed yes (still pending, then `sends.log` says `timeout`), are approved by a keyed yes, are
   denied by an unkeyed no, and refuse `always` keyed or not (including a bridge card whose options contain
   `allow_always`); a plain command card still takes an unkeyed yes.
   **Changed on purpose, in the same step:** #219's test "an always answer counts once" becomes "always on a
   click-only card is refused and the card stays pending" (then times out unless a keyed yes or a no comes).
   `ask`'s own `ans == "always" and not can_always` → `"yes"` line stays for plain chained commands, which are not
   click-only. New test: every `sends.log` line written in `test_approvals` and `test_agent_approvals` has
   `decision` in exactly `{"allow", "deny", "timeout"}`.
   → verify by `python -m unittest tests.test_approvals tests.test_agent_approvals -v` and the whole suite (below).
   Traps: the only #219 lines touched are the one `item["click"]` line, `answer`'s signature and guard, and the one
   test above; Trust/Root's bypass, `can_always` and the `sends_log` values stay as #219 wrote them.

5. **The launcher** (codex). `bin/nixi-companion`, after the `attention` block, the same Python-in-shell style and
   the same `runtime.json` lookup and `target` code (factor nothing out of `attention`; copy the 10 lines):
   - `approve --from claude|codex`: read stdin (no 2 s cap: the hook payload is always piped), POST
     `/api/agent-approve` with the fields of decision 2 and an HTTP timeout of 70 s; on
     `{"decision":"allow"}` print `{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}`;
     on `deny`, the same with `"behavior":"deny","message":"The user said no in Nixi."`; anything else, an
     exception or a timeout: print nothing. Always exit 0. Use exactly the JSON P6 proved for each agent.
   - `result --from claude|codex`: read stdin; compute the key of decision 7 (the P9 findings say which fields);
     `ok` from the payload's own status as P9 found it (a non-zero exit code is a failure even in `PostToolUse`;
     `PostToolUseFailure` is always a failure); `exit` only where P9 found one; POST `/api/agent-result`
     with `{from, key, ok, exit}` only, timeout 2 s; print nothing; exit 0. Never send `tool_response` text.
   - `tests/fixtures/hooks/`: the recorded P9 payloads (scrubbed of paths and text), and tests that run the
     launcher against a fake server and check the printed JSON byte for byte, silence on 500/timeout/refused, and
     that `approve` and `result` compute the same key.
   → verify by `python -m unittest tests.test_agent_hooks -v`.
   Traps: hooks must never break an agent: no output on any error, exit 0; no `set -e` path can print a partial
   JSON; the full token stays in the process, never in argv or the environment of a child.

6. **Results and the working signal** (coder). `app/server.py`:
   - `AgentApprovals` keeps finished items for 15 min with their result key; `/api/agent-result` (full token)
     consumes the one item with that key: approved → `state` "ran" (ok, exit) ; denied → "ran-after-deny"; two
     matching items → "unclear", and all of them are dropped so a later result can't guess; none → nothing. Publish `t="agent_result"` `{agent, ok, state, exit?}`. A sweep at
     15 min publishes "unknown" for approved items with no result.
   - `attention_parse`: `hook_event_name` `UserPromptSubmit` (claude, codex) or `PreInvocation` (agy) → kind
     `working`, reason "" (before the existing branches, so agy's `PreInvocation` never reads as "done").
   Tests: one match consumed; double match → unclear; deny then match → ran-after-deny; unknown after 15 min (a fake
   clock); `working` from each agent's payload; the 30 s rate limit applies to `working`.
   → verify by `python -m unittest tests.test_agent_approvals -v`.
   Traps: `attention_accept` publishes `attention`; `working` must not flash, speak or set `attnPend`.

7. **The page** (coder). `app/static/index.html`:
   - claim once per server run: on start, and again only when the window hands over a **new** token (`reauth`
     means the server restarted); keep the key in a closure variable (never `info`, never `localStorage`); on 403
     show nothing (the server's note says why). A page reload in the same run gets 403 and leaves approvals off until
     Nixi restarts, which the note says.
   - card: `nextApproval` uses `a.agent` for the head ("Codex · <project> wants to run") and shows an "Answer in the
     terminal" button only when `a.agent`; the yes/always buttons' click handlers pass `e.isTrusted` to `answer`,
     which adds the `X-Nixi-Click` header only when `ans !== 'no'` and the event was trusted; keyboard and voice
     paths never send the key. The terminal button posts `/api/approve/release`. For a click-only card, `answer`
     awaits the reply and says "okay!" only on `{ok:true}`; on `false` it says "That one had already gone" and
     the card goes (the server's `approve_done` follows).
   - `agent_result`: a tick line with the state text of decision 7, `poke('joy')` for ran ✓, `poke('sad')` for
     denied, a red tick for "ran after you denied"; nothing spoken.
   - `attention` with `kind:'working'`: `CP.agent(name)` opens the code panel titled with the agent's name and plays a
     fixed decorative loop (no real text), smaller after 60 s (`el.classList.add('mini')`), closes on that agent's
     `done` attention or 15 min without `working`; never while the companion's own turn uses CP.
   - settings, Agents section: one switch "Approve other agents' commands here (click only)" bound to
     `agent_approvals`.
   Browser fit test: the card with `agent` set fits, as `tests/agent_voice_fit.mjs` does for its card.
   → verify by the suite with the browser fit tests.
   Traps: Y and Enter are already swallowed for `confirm==='click'` (`keydown` handler) and voice already refuses
   (`askAloud`); don't change those lines; `#208` owns the reaction engine, so use `poke` only.

8. **Docs** (agy). `docs/GUIDE.md`: next to the `attention` hook lines, the `approve`, `result` and `working` hook
   lines for Claude (`~/.claude/settings.json`) and Codex (`requirements.toml` or trusted `hooks.json`), agy's
   `PreInvocation` line, the 75 s hook timeout, the setting, "agy can't be approved from Nixi (no hook at its
   prompt)", and the trust note (decision 13). → verify by reading it against decisions 1–13.
   Traps: agy is given the decisions and the current GUIDE section as files; it has no shell.

9. **Hooks in nixos_config** (coder), after the snowflake release with steps 3–8 is in the flake input.
   `modules/programs/nixi-agent-hooks.nix` (`features.nixiAgentHooks.enable`), modelled on `agent-voice.nix`:
   - Claude, managed: `PermissionRequest` → `sh -c 'command -v nixi-companion >/dev/null || exit 0; exec
     nixi-companion approve --from claude'`, timeout 75; `PostToolUse` and `PostToolUseFailure` → `… result --from
     claude`, timeout 5; `UserPromptSubmit` → `… attention --from claude --hook`, timeout 5.
   - Codex: `/etc/codex/hooks/nixi-approve`, `nixi-result`, `nixi-working` wrappers (managed commands take no
     arguments), appended to `codex/requirements.toml` with `mkAfter` as `[[hooks.PermissionRequest]]` (timeout 75),
     `[[hooks.PostToolUse]]` (5), `[[hooks.UserPromptSubmit]]` (5).
   - agy: jq-merge a `nixi-working` entry `{"PreInvocation":[{"command":"sh -c '…attention --from agy --hook; echo
     {}'","timeout":5}]}` into `~/.gemini/config/hooks.json`, exactly as `agentVoiceAgyHook` does.
   - The approve and result hooks only for the agents that passed step 1; the working hooks for all three (agy is
     never an approval candidate). Import from `hosts/common/nixos/omarchy-nixi-companion.nix`; bump the
     companion input in the same commit, so `approve` exists before a hook calls it.
   → verify by `nix flake check` and `nix build .#nixosConfigurations.p620.config.system.build.toplevel`, then
   `jq .hooks.PermissionRequest /etc/claude-code/managed-settings.json` after switch.
   Traps: from a worktree use `nh os switch .`, not `just deploy`, and check the revision; the coder-guard fix is
   **not** in this step; `~/.gemini` is Syncthing-synced, so merge, never replace.

10. **Deploy and live check** (me, with the user, one session). After switch on p620, with `agent_approvals` on:
    1. Codex asks to run `uname -r`: the card shows it, a click on yes → "Codex ran it ✓";
    2. a fake `gog`: start Codex with `PATH=$D/bin:$PATH`, where `$D=$(mktemp -d)` holds a `gog` script that only
       appends its argv to `$D/called`; ask Codex to run `gog gmail send --to a@example.com --subject t --body t`:
       a click-only card; Y and the voice do nothing; deny → "denied in Nixi" and `$D/called` stays empty; a second
       try approved by a click → `$D/called` has one line; `sends.log` has both lines with no body. No real mail
       is ever sent;
    3. Claude Code: deny → "denied in Nixi", Claude reports it was denied;
    4. let a card time out: the agent shows its own prompt;
    5. "Answer in the terminal": the agent shows its own prompt;
    6. agy and Claude coding: the decorative terminal with their names, smaller after a minute;
    7. a herdr write card from Nixi's own turn (#95) is approved by a click and not by `curl` with the full token.
    Then post on the agent bus; open the PRs (snowflake, nixos_config), each linking intent, spec and plan, and say
    which steps codex, coder and agy did.

## Tests

- `python -m unittest discover -s tests -v` in the snowflake repo (without the browser fit tests): all pass,
  including `test_approvals` (#219) and the new `test_agent_approvals`, `test_agent_hooks`.
- The browser fit tests (`tests/*_fit.mjs` via `tests/_browser.py`): pass.
- nixos_config: `nix flake check`; build p620 and razer.
- Step 10's live checks, once.

## Rollback

- Instant: switch `agent_approvals` off (the hooks then answer nothing and every agent prompts as today).
- Revert the nixos_config commit (hooks gone) and `nh os switch`.
- Revert the snowflake PR. The key on #95/#219 cards goes with it, which restores today's behaviour.

## Probe results

(filled in during step 1)

## Changed on purpose

- **#219's always→yes downgrade on click-only cards** (step 4). #219 counts "always" on a click-only card as one
  yes. This plan refuses it and the card stays pending, because "always" must never be an approval for a send, and
  a refused answer is the stricter, simpler rule now that a yes needs the key. #219's test is updated in step 4.
  Its `sends.log` values stay exactly `allow`, `deny` and `timeout`.
- **The spec's browser-fallback parenthetical** (§3 said approvals never turn on there): see recommendation 2.

## Recommendations recorded for approval

1. **Approved and denied reactions.** #208's approved plan puts "approved, denied, coding" out of its scope, so
   this plan shows them with what exists today: a tick line, `poke('joy')` or `poke('sad')`, and a red line for "ran
   after you denied". Recommended: accept that; props can come in a later reactions follow-up.
2. **The browser fallback claims the key.** The page claims it in the window or in the browser fallback, whichever
   loads first in a run, because with the key required for #95/#219 cards, a fallback that can't claim it could
   never approve a send. Recommended: let the fallback page claim it.

## Reviews (2026-11-07)

Codex reported `gpt-6.1-sol`; agy reported no model. Both read this draft, the spec's decisions and the same
evidence (the #219 diff, `Approvals`, `attention_parse`, the card code, the launcher, Codex's schema), read-only.
agy had no shell, so its evidence was in the prompt. Their findings don't approve anything.

**Confirmed and applied:**

- Codex: the key's claim and spoil had no lock, and a spoil could land between the header check and the answer.
  Both now happen under `CLICK_LOCK`, the transition re-checks the key, and a spoil releases pending requests
  (step 3).
- Codex: a bridge click-only card could still return `allow_always` after a keyed yes. `always` is now refused
  outright for click-only cards, and `ask_bridge` publishes `always=False` for them (step 4).
- Codex: the probes could pass without the hook having run, because there was one shared log and no positive
  control. Each case now has its own log directory and needs a `PermissionRequest` payload for the exact command;
  P6 allow is the control; P7 checks that both hooks ran, in both orders (step 1).
- Codex: the live gog check could send real mail. It now uses a fake `gog` on `PATH` (step 10).
- Both: socket EOF detection was underspecified. It's now concrete: non-blocking peek, errors cancel, and the
  deadline stays the hard bound (step 3).
- Codex: finalisation had no single owner, so events and audit lines could duplicate, and a result could arrive
  before registration. `_finish` now does both under one lock, and step 3 tests the races.
- Codex: the configurable wait contradicted the fixed 75 s hook timeout. The wait is now the constant 60 s, and
  switching the setting off releases pending requests.
- Codex: the page now claims the key again only on a new server run, since `reauth` means the server restarted
  (step 7).
- Codex: the probe isolation was weak. The directory is now `mktemp`, there's an explicit kill case (P2k), P2 is
  separate from the timeout (P3), and the effective hooks are recorded from `/hooks`.
- Codex: denies are published at once, success comes from the exit status, and colliding results are all dropped
  (steps 3, 5, 6).
- Codex: the plan dropped `target`. It now feeds `_ATTN_TARGET`, so "open the session" works (step 3).
- Codex: step 2 now checks nixi #222 too, and agy's working hook installs whatever the probes say (steps 2, 9).
- Codex: the page said "okay!" before the server accepted the answer. It now waits for `{ok:true}` on click-only
  cards (step 7).
- agy: added tests for "Answer in the terminal", for the key never appearing in logs, and that only `_finish`
  returns allow (step 3).

**Refuted:**

- agy: `/api/agent-approve` could return allow without a key. Its only allow is `_finish` after a keyed answer, and
  that's now also a test.
- agy: step 4 weakens #219. Plain cards are unchanged by design, and `click` is set only from #219's own
  `click_only` and `confirm`.
- agy: blocking handler threads need an async redesign. `ThreadingHTTPServer` already holds `/api/approve` for up
  to 600 s, and agent waits are 60 s.
- agy: `approve.py` must exist before the server. That's #219's Trust/Root hook; this plan doesn't use it.
- agy: `always` leaks on non-click cards. That's today's behaviour for plain cards and out of scope.
- agy: reuse `Approvals` instead of a new class. Agent requests need the single-transition lifecycle that
  `Approvals.answer` lacks, and the spec chose to leave that class alone.

**Unverified:** agy suggested that `claude --settings` might write `~/.claude/settings.json` and that `HOME`
should be isolated. Changing `HOME` would break the login, and step 1 already checks that no user config file
changes. Not applied.
