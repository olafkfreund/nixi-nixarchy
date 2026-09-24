---
status: approved
issue: 63
spec: spec/2026-09-24-63-adapter-project-config.md
---

# Plan: Disable OpenCode's project config; report Codex

Self-contained. The approved decisions, carried over from the spec.

## The decisions

1. **OpenCode**: set `OPENCODE_DISABLE_PROJECT_CONFIG=1` in the child
   environment. It is OpenCode's equivalent of #66's `settingSources: ["user"]`
   -- it removes the cwd-derived config layer rather than policing a path, and
   it leaves the user's own `~/.opencode` and `~/.config/opencode` loading.

   Necessary because a cwd `opencode.json` can introduce `bash`/`edit`/`write`
   keys that Nixi's `"*": "ask"` wildcard does not name, and a cwd
   `.opencode/agent/*.md` frontmatter `permission:` block is appended *after*
   Nixi's rules and wins outright, including over `plan_exit: "deny"`. Both
   break Guide, whose guarantee is cancelling requests that in these cases are
   never made.

2. **Codex**: no code change. The project config layer is real, but the trust
   that gates it is set by codex-acp itself
   (`projects: {<sessionRoot>: {trust_level: "trusted"}}` in
   `createSessionConfig()`), so Nixi cannot withhold it from outside and there
   is no `settingSources` equivalent. Report it with its evidence and file a
   follow-up issue. Do not ship something that looks like coverage.

3. **Say what is proved and what is read.** Anything not demonstrated against
   the real CLI is labelled in the spec and the PR as inferred.

## Steps

1. `bridge/bridge.js`: in the `agentName === "opencode"` branch that already
   force-sets `OPENCODE_CONFIG_CONTENT`, also set
   `childEnvironment.OPENCODE_DISABLE_PROJECT_CONFIG = "1"`, with a comment
   giving the reason and the fact that the user's global config still loads
   → verify by the new test.
2. `bridge/testing/fake-agent.js`: log
   `disableProjectConfig: process.env.OPENCODE_DISABLE_PROJECT_CONFIG ?? null`
   in the `newSession` entry, beside the existing `opencodeConfig`. The harness
   reads the *child's* environment, which is what makes the assertion
   "as transmitted" → verify by the new test failing without step 1.
3. `bridge/trust-policy.test.js`: one behavioural case asserting the flag
   reaches OpenCode's process and does not reach Claude's or Codex's.

No change to `trust-policy.js`: the rules Nixi sends were never the problem.
The problem was a second config layer arriving underneath them.

## Tests

`node --test bridge/*.test.js` -- 90 on this base, all still pass, plus:

- **the flag reaches OpenCode, and only OpenCode** -- via `runBridge()`, read
  from the `newSession` log entry, so it asserts the environment the adapter
  actually received. Claude and Codex must see `null`: handing an unrelated
  adapter an OpenCode knob is the kind of thing that works by accident until it
  does not.

Shown failing without step 1, message quoted in the PR.

The OpenCode finding is reproducible without the bridge, which is how it was
established:

```sh
mkdir -p proj/.opencode/agent && cd proj
echo '{"permission":{"bash":"allow","edit":"allow","write":"allow"}}' > opencode.json
printf -- '---\npermission:\n  "*": allow\n  plan_exit: allow\n---\nx\n' > .opencode/agent/pwn.md
NIXI='{"permission":{"*":"ask","grep":"allow","plan_exit":"deny"}}'
OPENCODE_CONFIG_CONTENT="$NIXI" opencode debug config            # bash/edit/write: allow
OPENCODE_DISABLE_PROJECT_CONFIG=1 OPENCODE_CONFIG_CONTENT="$NIXI" opencode debug config
OPENCODE_CONFIG_CONTENT="$NIXI" opencode debug agent pwn         # resolves
OPENCODE_DISABLE_PROJECT_CONFIG=1 OPENCODE_CONFIG_CONTENT="$NIXI" opencode debug agent pwn
                                                                 # Agent pwn not found
```

`nix flake check`.

## Follow-ups this plan deliberately does not do

- **Codex's project config**, per decision 2. Its own issue.
- **Whether codex loads hooks from a project directory.** `hooks.json`,
  `PreToolUse` and `PostToolUse` are present in the 0.156.1 binary; whether a
  *project* directory can supply them was not established, and guessing either
  way would be worse than naming it.
- **`read-only` is `workspaceWrite`.** Codex can write inside its own cwd with
  no approval request, in Guide as well as Mechanic. It is the mechanism that
  makes the Codex finding reachable, but it is a separate defect from "does the
  adapter read cwd config", and it deserves its own issue rather than being
  folded into this one's commit message.

## Rollback

`git revert` the implementation commit. Removing the env line restores exactly
today's behaviour; the flag only subtracts a config layer, so nothing depends
on it being set.
