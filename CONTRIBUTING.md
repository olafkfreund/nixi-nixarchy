# Contributing

## Before a change

```
nix flake check                      # builds the package + runs the Python self-check
python3 tools/test_nixi.py           # the same self-check, without Nix
(cd bridge && npm ci && node --test ./*.test.js)   # the bridge and tour logic
```

CI runs those, plus `ruff`, `shellcheck`, `actionlint`, Home Manager activation
builds (all agents with `allowUnfree`, no agents without it), and an offline
installer run against a throwaway `$HOME`. Everything is reproducible locally.

## House rules

**The card stays line-comparable with omarchy-ask.** `Ask.qml`,
`Conversation.qml`, `HarnessSelector.qml` and `MenuSearch.qml` are upstream's,
rebranded. Nixi's additions go in their own files where they can
(`Tour.qml`, `TourModel.js`, `bridge/trust-policy.js`, `bridge/grounding.js`,
`bridge/learned.js`) and stay small inside upstream's, so an upstream fix can
still be applied. Machine-specific paths (node, gjs, fd, gdbus) are pinned by
`nix/package.nix` in the built copy only, never in the repository.

**Guide must stay safe.** Every agent's Guide row in `bridge/trust-policy.js`
cancels every permission request. A new agent is added only after a real write
and a real shell command were shown to arrive as permission requests — see how
OpenCode needed its own permission rules (plan step 17b). Test it through the
bridge, not just against the table.

**Never rename an Omarchy integration point.** nixarchy runs Omarchy's real
tree, so `omarchy-shell`, `omarchy menu`, `omarchy-launch-*`,
`~/.config/omarchy/` and friends stay exactly as they are.
`tools/test_nixi.py` asserts this.

**No bundled agent adapters.** `bridge/package-lock.json` must not contain
`@anthropic-ai/`, `@openai/`, `claude-agent-acp` or `codex-acp`; adapters come
from the user's own system. A test enforces it.

**Non-trivial logic leaves a check behind** — a `node --test` case for bridge
and tour logic, an assertion in `tools/test_nixi.py` for data and packaging.
Show it fails when the bug is reintroduced.

**Answers must be true on NixOS.** In `share/faq.json`, `share/KNOWLEDGE.md`,
`share/tour.json`, `share/learn.json` or the tutor brief: no `pacman`, no AUR,
no "just install it". The Install menu queues into
`~/.config/nixarchy/apps.nix` and `nixarchy apply` applies it. Tour and learning
text is CommonMark: use a blank line, not a single newline, between lines.

## The two install paths

`install.py` (plugin manager) and `nix/hm-module.nix` (declarative) must keep
producing the same layout. If you add a file to one, add it to the other, and
extend the matching CI job so it is actually checked.

## Upstream

Nixi's card is [omarchy-ask](https://github.com/clickety-clacks/omarchy-ask);
Nixi itself began as a fork of [Archy](https://github.com/respira-crece-lidera)
by Luke Warren Wills. A fix that is not NixOS-specific probably belongs
upstream too — please say so in the PR.
