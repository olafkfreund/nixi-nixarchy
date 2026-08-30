# Publishing Archie — the runbook

Everything below is prepared; the two accounts are the only gates.

## 1. Public GitHub repo (needs: `gh auth login` on the Geekom)

    cd ~/rcl-system/coding/omarchy-helper
    # secrets sweep is done (see below) — repo contains no tokens/IPs/keys
    gh repo create archie-omarchy --public --source . --push \
      --description "Archie — a live guided tour and AI tutor for new Omarchy users"

Secrets sweep checklist (re-run before push if anything changed):
no `.env`, no tokens, no tailnet IPs/hostnames, no personal paths beyond
`$HOME`-relative. `grep -rniE "token|secret|passw|100\.|\.ts\.net" .`

## 2. AUR package (needs: an AUR account + SSH key, aur.archlinux.org)

Tag a release first: `git tag v0.9.0 && git push --tags`.
Then claim + push the package:

    git clone ssh://aur@aur.archlinux.org/archie-omarchy.git /tmp/aur-archie
    cp packaging/PKGBUILD /tmp/aur-archie/ && cd /tmp/aur-archie
    updpkgsums && makepkg --printsrcinfo > .SRCINFO
    git add -A && git commit -m "archie-omarchy v0.9.0" && git push

After that, anyone: SUPER+SPACE → Install → AUR → archie-omarchy.

## 3. The demo (Luke, ~10 min)

Record the live tour once on a fresh-ish session: SUPER+SHIFT+H → 🚀 → do the
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
