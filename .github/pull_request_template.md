## What and why

<!-- The behaviour change. If it fixes an issue: "Fixes #123". -->

## How it was verified

<!-- Say what you actually ran, not what should pass. -->

- [ ] `nix flake check`
- [ ] `python3 tools/test_nixi.py`
- [ ] Tried it on a real nixarchy desktop (say which parts — the compositor-facing
      code is the half CI cannot reach)

## Checklist

- [ ] No new runtime dependency (stdlib only)
- [ ] No Omarchy integration point renamed
- [ ] Private state still goes through `secure_read` / `secure_write`
- [ ] Both install paths updated (`install.py` **and** `nix/hm-module.nix`), if layout changed
- [ ] Any user-facing answer is true on NixOS (no `pacman`, no AUR)
