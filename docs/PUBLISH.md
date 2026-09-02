# Publishing Archy — the runbook

Everything below is prepared; the two accounts are the only gates.

## 1. Public GitHub repo (needs: `gh auth login` on the Geekom)

    cd ~/rcl-system/coding/omarchy-helper
    # secrets sweep is done (see below) — repo contains no tokens/IPs/keys
    gh repo create archy-omarchy --public --source . --push \
      --description "Archy — a live guided tour and AI tutor for new Omarchy users"

Secrets sweep checklist (re-run before push if anything changed):
no `.env`, no tokens, no tailnet IPs/hostnames, no personal paths beyond
`$HOME`-relative. `grep -rniE "token|secret|passw|100\.|\.ts\.net" .`

## 2. AUR package (lives in the AUR, not in this tree)

The marketplace installs from git; AUR packaging is a separate distribution
channel and is maintained in the AUR repository itself, where the PKGBUILD
can pin a real `sha256sums` for the exact tagged release tarball (a PKGBUILD
inside the plugin tree can never carry the checksum of the archive that
contains it). Tag a release (`git tag vX.Y.Z && git push --tags`), then in
the AUR clone: write the PKGBUILD for that tag, `updpkgsums`,
`makepkg --printsrcinfo > .SRCINFO`, commit, push.

## 3. The demo (Luke, ~10 min)

Record the live tour once on a fresh-ish session: SUPER+H → 🚀 → do the
11 steps → the dismiss-and-recall finale. Omarchy screen recording captures
it; keep it under 60s (2x speed is fine). Upload as GIF/mp4 to the repo and
embed at the top of README.

## 4. The approach (Luke posts, personal account)

GitHub → basecamp/omarchy → Discussions → "Show and tell" (or Ideas).
Draft: `docs/PITCH.md`. One post, the video, the install line, done.
Optional: a short X post; DHH engages with things that demo well.

## What we do NOT do

- No cold pull request into their tree — Discussion first, PR only if invited.
- No feature begging or long essays; the demo carries it.
