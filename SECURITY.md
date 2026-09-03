# Security policy

## Reporting a vulnerability

Please report privately, not in a public issue:
[open a security advisory](https://github.com/olafkfreund/nixi-nixarchy/security/advisories/new).

Include what an attacker gains and how to reproduce it. I will confirm receipt
and give you an assessment; if the flaw is inherited from upstream
[Archy](https://github.com/respira-crece-lidera) or from
[nixarchy](https://github.com/olafkfreund/nixarchy), I will say so and help
route it.

## What Nixi is exposed to

Nixi runs a small HTTP server on `127.0.0.1`. **Loopback is not a trust
boundary** — every local user can reach it, and every website in your browser
can attempt to. The defences that matter, and which are therefore in scope:

| surface | defence |
|---|---|
| Another local user's requests | peer uid checked against yours via `/proc/net/tcp`, fail-closed |
| A website in your browser (CSRF / DNS rebinding) | per-session token on every state-touching request, `Host`/`Origin` allowlist, no CORS header ever sent |
| Model output rendered as HTML | DOMPurify, an escaping fallback renderer, and a CSP with `default-src 'none'` |
| Private state (token, trust level, learned facts) | descriptor-bound I/O: validated directory fd, `O_NOFOLLOW`, `O_EXCL` temps, rename over a non-symlink target |
| Agent subprocesses | one transient systemd scope each, killed by unit **name** so no reused PID is ever signalled |
| The one network path (`nixi-update-manual`) | two pinned repos, pinned commits, every page verified against its git blob hash before use |
| Acting on your machine | Guide (default) never gets a write-capable tool; Mechanic requires an explicit level change *and* a per-request click |

### In scope

Anything that bypasses a row above: reading or writing another user's Nixi
state, getting a state change without the token, escaping the manual fetch's
hash verification, or reaching Mechanic behaviour from Guide.

### Not in scope

- What your agent does once **you** have selected Mechanic and clicked 🔧. That
  level is documented as unconfined on purpose — it is your own agent with its
  normal powers, and no claim is made otherwise.
- An attacker who already has your uid. They can read `~/.local/share/nixi`
  directly; nothing here defends against that, and nothing pretends to.
- Prompt injection changing what the model *says*. Grounding reduces it; it is
  not a security boundary. It becomes in scope if it causes an **action** at
  Guide trust.
