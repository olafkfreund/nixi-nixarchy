#!/usr/bin/env bash
# Install the Omarchy Helper for the current user (no sudo, fully reversible).
#
# Consent is feature-specific (marketplace security review): with no flags
# only the CORE is installed — widget files, launcher, chat server service,
# menu entry. Each persistent extra is opt-in:
#   --with-watcher   background tip watcher (usage-aware coaching, 1/day max)
#   --with-skill     agent skill in ~/.claude/skills (tutor method for agents)
#   --with-hooks     post-boot welcome + post-update/weekly manual refresh
#   --all            everything above (what the plugin's documented
#                    first-click setup uses; the README enumerates the list)
set -euo pipefail
ROOT="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")" && pwd)"
DIR="$HOME/.config/omarchy-help"

WATCHER=0; SKILL=0; HOOKS=0
for a in "$@"; do
  case "$a" in
    --with-watcher) WATCHER=1 ;;
    --with-skill)   SKILL=1 ;;
    --with-hooks)   HOOKS=1 ;;
    --all)          WATCHER=1; SKILL=1; HOOKS=1 ;;
    *) echo "unknown flag: $a" >&2; exit 64 ;;
  esac
done

# Refuse to write through symlinked destinations we own (no-follow policy).
no_symlink() {
  if [[ -L "$1" ]]; then
    echo "refusing: $1 is a symlink (dotfile-managed?) — not overwriting" >&2
    return 1
  fi
}

mkdir -p "$DIR" "$HOME/.local/share/omarchy-help" "$HOME/.local/bin" "$HOME/.config/omarchy/extensions"
for f in CLAUDE.md KNOWLEDGE.md ui.html faq.json AGENTS.md; do
  no_symlink "$DIR/$f" || continue
  cp "$ROOT/share/$f" "$DIR/$f"
done
cp -r "$ROOT/share/vendor" "$DIR/"
for b in omarchy-help omarchy-help-server omarchy-help-update-manual; do
  no_symlink "$HOME/.local/bin/$b" || continue
  install -m755 "$ROOT/bin/$b" "$HOME/.local/bin/$b"
done

# The widget server runs as a user service (like omarchy-crash-watch).
mkdir -p "$HOME/.config/systemd/user"
cp "$ROOT/systemd/omarchy-help.service" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable --now omarchy-help.service 2>/dev/null || true

if [[ $SKILL == 1 ]]; then
  # The tutor method ships as a skill (the Omarchy way — cf. diagnose-crash).
  mkdir -p "$HOME/.claude/skills"
  rm -rf "$HOME/.claude/skills/omarchy-help"
  cp -r "$ROOT/skills/omarchy-help" "$HOME/.claude/skills/omarchy-help"
  cp "$ROOT/skills/omarchy-help/SKILL.md" "$DIR/SKILL.md"
else
  echo "skipped: agent skill (add with --with-skill)"
fi

if [[ $WATCHER == 1 ]]; then
  # Tip watcher: one workflow suggestion a day, max. Turn off any time:
  #   systemctl --user disable --now omarchy-help-watch
  no_symlink "$HOME/.local/bin/omarchy-help-watch" && \
    install -m755 "$ROOT/bin/omarchy-help-watch" "$HOME/.local/bin/omarchy-help-watch"
  cp "$ROOT/systemd/omarchy-help-watch.service" "$HOME/.config/systemd/user/"
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable --now omarchy-help-watch.service 2>/dev/null || true
else
  echo "skipped: tip watcher (add with --with-watcher)"
fi

if [[ $HOOKS == 1 ]]; then
  # First-boot welcome (fires once ever) + manual refresh after updates and
  # weekly (doc-only changes between releases).
  mkdir -p "$HOME/.config/omarchy/hooks/post-boot.d" "$HOME/.config/omarchy/hooks/post-update.d"
  install -m755 "$ROOT/hooks/archy-welcome.hook" "$HOME/.config/omarchy/hooks/post-boot.d/archy-welcome.hook"
  install -m755 "$ROOT/hooks/archy-manual-refresh.hook" "$HOME/.config/omarchy/hooks/post-update.d/archy-manual-refresh.hook"
  cp "$ROOT/systemd/omarchy-help-manual.service" "$ROOT/systemd/omarchy-help-manual.timer" "$HOME/.config/systemd/user/"
  systemctl --user daemon-reload 2>/dev/null || true
  systemctl --user enable --now omarchy-help-manual.timer 2>/dev/null || true
else
  echo "skipped: boot/update hooks + weekly manual timer (add with --with-hooks)"
fi
"$HOME/.local/bin/omarchy-help-update-manual" || true

# Menu entry: merged non-destructively, written atomically, backup kept,
# never through a symlink.
EXT="$HOME/.config/omarchy/extensions/omarchy-menu.jsonc"
if [[ -L "$EXT" ]]; then
  echo "menu: $EXT is a symlink — leaving it alone; add the 'help' entry yourself" >&2
elif ! grep -q '"help"' "$EXT" 2>/dev/null; then
  python3 - "$EXT" <<'EOF'
import os, re, sys, tempfile
p = sys.argv[1]
row = '"help": {"icon": "\U000f0625", "label": "Help", "description": "Ask anything about Omarchy", "action": "omarchy-help", "aliases": ["how", "ayuda"]}'
try:
    fd = os.open(p, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd) as f:
        s = f.read(262144)
except OSError:
    s = ""
if s.strip():
    with open(p + ".bak-archy", "w") as f:
        f.write(s)
if not re.sub(r"//.*", "", s).strip().strip("{}").strip():
    out = "{\n  " + row + "\n}\n"
else:
    i = s.rindex("}")
    body = s[:i].rstrip()
    sep = "," if body.rstrip().endswith(("}", '"', "]")) and not body.rstrip().endswith("{") else ""
    out = body + sep + "\n  " + row + "\n}\n"
d = os.path.dirname(p)
fd, tmp = tempfile.mkstemp(dir=d, prefix=".menu-")
with os.fdopen(fd, "w") as f:
    f.write(out)
    f.flush()
    os.fsync(f.fileno())
os.replace(tmp, p)
EOF
  echo "menu: Help entry added (backup: omarchy-menu.jsonc.bak-archy)"
fi

echo "Installed. Run omarchy-help for the chat widget (omarchy-help --tui for a terminal session)."
echo "Optional: bind SUPER+H (free in stock Omarchy) — add to ~/.config/hypr/bindings.lua:"
echo "  o.bind(\"SUPER + H\", \"Archy (Omarchy help)\", \"omarchy-help\")"
echo "Uninstall: see README (Remove section)."
