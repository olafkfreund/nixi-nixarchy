# Release process

A release is an immutable `v<version>` tag on the `master` tip, with a GitHub
release beside it. Nixi has no release workflow: upstream omarchy-ask publishes
through one, this fork does not, and the doc used to describe theirs.

## Prepare

1. Set `manifest.json` and `button/manifest.json` to the intended semantic
   version, without a leading `v`. They move together: Omarchy reads each
   plugin's own manifest, and a version skew between the card and its bar
   button is invisible until someone reads one of them.
2. Run the checklist in [`docs/testing.md`](testing.md), including the Nixi
   section — the compositor-facing half is the part CI cannot reach.
3. Commit and push to `master`; confirm CI is green on that exact commit.

## Publish

```sh
git fetch origin master
gh release create "v$VERSION" \
  --target "$(git rev-parse origin/master)" \
  --title "Nixi $VERSION — <what it is>" \
  --generate-notes --notes "…what changed, and what upgrading costs…"
```

Check before running it, because none of this is enforced for you:

- `manifest.json` holds exactly `$VERSION`;
- `v$VERSION` does not exist yet (`git ls-remote --tags origin`);
- the target commit is the `master` tip and its CI is green.

Afterwards, confirm the release points where you meant:

```sh
gh release view "v$VERSION" --json tagName,targetCommitish,isDraft
```

Write the notes for somebody upgrading: what changed, what was removed, and
what an existing install has to do about it. `--generate-notes` adds the commit
list underneath; it does not say what any of it means.

## Who consumes a release

Nothing does, today. nixarchy pins nixi by **commit**, not by tag (its
`flake.nix` says so, and checks it), so a release is a marker for people rather
than an input to a build. Bumping nixarchy's pin is a separate pull request
there, and is what actually ships a new nixi to a desktop.
