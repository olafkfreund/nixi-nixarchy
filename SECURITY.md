# Security policy

## Reporting a vulnerability

Please report privately, not in a public issue:
[open a security advisory](https://github.com/olafkfreund/nixi-nixarchy/security/advisories/new).

Include what an attacker gains and how to reproduce it. I will confirm receipt
and give you an assessment; if the flaw is inherited from upstream
[omarchy-ask](https://github.com/clickety-clacks/omarchy-ask) or from
[nixarchy](https://github.com/olafkfreund/nixarchy), I will say so and help
route it.

## What Nixi is exposed to

Nixi has no server and opens no port. The card runs inside the Omarchy shell
and starts one bridge process per conversation, talking to it over a pipe; the
bridge starts the chosen agent's ACP adapter the same way. The defences that
matter, and which are therefore in scope:

| surface | defence |
|---|---|
| Acting on your machine at Guide (the default) | the bridge cancels every ACP permission request before it reaches the card, and sets the agent's most restrictive mode as a second layer |
| An agent whose own defaults skip permission requests | OpenCode is always started with Nixi's rules (`*` asks, read-only tools allowed, `plan_exit` denied), replacing any `OPENCODE_CONFIG_CONTENT` from the environment |
| Reaching auto-approve | YOLO is honoured only at Mechanic, and leaving Mechanic cancels anything still waiting |
| Learned facts | written by the bridge, not the agent: `0600`, atomic, bounded, a symlinked `LEARNED.md` refused |
| The manual fetch (`nixi-update-manual`) | two pinned repos, pinned commits, every page verified against its git blob hash before use |
| Bundled code | no agent adapter or SDK in `bridge/node_modules`; adapters come from your system |

### In scope

Anything that bypasses a row above: an agent change at Guide, an OpenCode tool
that runs without a request, reaching YOLO from Guide, writing outside
`~/.local/share/nixi` through the learned-fact path, or escaping the manual
fetch's hash verification.

### Not in scope

- What your agent does at **Mechanic** after you approve it, or in YOLO. That
  is your own agent with its normal powers, by your choice.
- An attacker who already has your uid. They can read your state and run your
  agent directly.
- Prompt injection changing what the model *says*. Grounding reduces it; it is
  not a security boundary. It becomes in scope if it causes an **action** at
  Guide.
- The agent provider's own handling of your conversation.
