---
status: approved
issue: 111
intent: intent/2026-10-26-111-acp-auth-status.md
---

# Spec: put `--settings` before `auth status` in the pinned Claude adapter

## Design

Change one file: `nix/adapters.nix`. The pinned claude adapter gets upstream's v0.97.0 fix (commit 6a33ded, #1392), applied as a `postPatch`:

```nix
claudeAcp = authStatusFix (adapterFor "claude" "claude-agent-acp");
```

where

```nix
authStatusFix = acp:
  if acp == null || lib.versionAtLeast acp.version "0.97.0" then acp
  else acp.overrideAttrs (old: {
    postPatch = (old.postPatch or "") + ''
      substituteInPlace src/acp-agent.ts --replace-fail \
        'args.push("--settings", JSON.stringify(context.override))' \
        'args.unshift("--settings", JSON.stringify(context.override))'
    '';
  });
```

How it behaves:

- **Placement.** The patch wraps the result of `adapterFor`, so it only ever sees a package that already evaluated. When unfree is refused, `adapterFor` still returns null, and the existing `hm-module-eval` asserts still hold.
- **Version gate.** At 0.97.0 or later the patch is skipped, and the adapter is the stock nixpkgs package from the binary cache. Nothing needs removing by hand.
- **`--replace-fail`.** If a version below 0.97 has a different line, the build fails with a message that names the file. It never ships an unpatched adapter silently.
- **The edited line.** The patch changes the TypeScript source, which the package compiles in its own build. I built exactly this outside the repo: the output's `dist/acp-agent.js:1811` reads `args.unshift("--settings", …)`.
- **Who gets it.** Only the adapter nixi pins. A user who passes their own build (`pkgs.nixi.override { claudeAcp = myBuild; }`, see `nix/hm-module.nix:68`) or relies on PATH keeps what they chose.

## Alternatives rejected

- **Bump the adapter to 0.97.0 in nixi with `overrideAttrs` on `src` and `npmDepsHash`.** It pulls in four releases of unrelated adapter changes, and nixi would have to track two hashes. That's a much bigger change than a one-word fix.
- **Drop `settings` from the session `_meta`.** The trust permissions would stop reaching Claude Code, which is a security regression.
- **Filter the log line in the bridge.** It hides the error but the sign-in check still fails.
- **Wait for nixpkgs.** The intent rejects this: the error keeps appearing for an unknown time.
- **Put the patch in the system flake (`~/.config/nixos`).** It fixes only p620, not every nixi user.

## Risks

- **No binary cache.** The patched adapter has a new store path, so every host that pins it compiles it locally (about a minute on p620) until nixpkgs reaches 0.97.
- **npm-deps rebuild.** `postPatch` is inherited by the `npmDeps` fixed-output derivation, so that is rebuilt too. Its hash didn't change in the trial build, because the patch touches no lockfile.
- **Upstream edits the line before 0.97 lands in nixpkgs.** The build fails loudly, which is intended, and the fix is to update or drop the patch.

## Verification

1. **Flake checks.** `nix flake check` passes, including `hm-module-eval`, whose `claudeAcp == null` and `!= null` asserts still hold.
2. **Build.** Build the package from p620's flake with `--override-input nixi` pointing at this branch. The pinned adapter's `dist/acp-agent.js` must contain `args.unshift("--settings"`.
3. **Runtime.** Run `claude --settings '<json>' auth status --json` and check that it returns JSON with `loggedIn`. This is already checked by hand on 2.1.310.
4. **Live.** Point `NIXI_CLAUDE_ACP_COMMAND` at the patched adapter, start the bridge for one Claude session, and check that its stderr has no `unknown option '--settings'`. The current adapter shows the error on every session.
