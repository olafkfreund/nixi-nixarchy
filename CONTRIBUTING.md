# Contributing

## Before a change

```
nix flake check          # builds the package + runs the behavioural self-check
python3 tools/test_nixi.py   # the same self-check, without Nix
```

CI runs both, plus `ruff`, `shellcheck`, `actionlint`, a Home Manager
activation build, an installer run against a throwaway `$HOME`, and a server
smoke test. Everything is reproducible locally — there is nothing CI does that
you cannot run yourself.

## House rules

**Python standard library only.** No runtime dependencies. The only vendored
code is `marked` and `DOMPurify`, and they exist so model output can be
rendered without a network fetch.

**Never rename an Omarchy integration point.** nixarchy runs Omarchy's real
tree, so `omarchy menu`, `omarchy-launch-*`, `~/.config/omarchy/` and friends
must stay exactly as they are. `tools/test_nixi.py` asserts this — if you make
it fail, you have broken the desktop integration, not the test.

**Keep the state boundary.** Anything Nix or a dotfile manager may own is
static and lives in `~/.config/nixi`. Anything Nixi writes at runtime lives in
`~/.local/share/nixi` and is touched only through the descriptor-bound
primitives (`secure_read` / `secure_write`). Do not add a plain `open()` on a
private state file.

**Non-trivial logic leaves a check behind.** One assertion in
`tools/test_nixi.py` that fails if the logic breaks. No frameworks.

**Answers must be true on NixOS.** If you touch `share/faq.json`,
`share/KNOWLEDGE.md`, the curriculum or the system prompt: no `pacman`, no
AUR, no "just install it". The Install menu queues into
`~/.config/nixarchy/apps.nix` and `nixarchy apply` applies it.

## The two install paths

`install.py` (imperative) and `nix/hm-module.nix` (declarative) must keep
producing the same layout. If you add a file to one, add it to the other, and
extend the installer job in CI so it is actually checked.

## Upstream

Nixi is a fork of [Archy](https://github.com/respira-crece-lidera) by Luke
Warren Wills. A fix that is not NixOS-specific probably belongs upstream too —
please say so in the PR and I will help send it there.
