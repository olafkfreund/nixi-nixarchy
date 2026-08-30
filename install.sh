#!/usr/bin/env bash
# Install the Omarchy Helper for the current user (no sudo, fully reversible).
# - copies the tutor brief + knowledge into ~/.config/omarchy-help/
#   (COPIES, not symlinks: LEARNED.md grows there and belongs to you)
# - links the launcher command into ~/.local/bin
# - adds a Help entry to the Omarchy menu (merged, non-destructive)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$HOME/.config/omarchy-help"
mkdir -p "$DIR" "$HOME/.local/share/omarchy-help" "$HOME/.local/bin" "$HOME/.config/omarchy/extensions"
cp "$ROOT/share/CLAUDE.md" "$ROOT/share/KNOWLEDGE.md" "$ROOT/share/ui.html" "$ROOT/share/faq.json" "$ROOT/share/AGENTS.md" "$DIR/"
install -m755 "$ROOT/bin/omarchy-help" "$HOME/.local/bin/omarchy-help"
install -m755 "$ROOT/bin/omarchy-help-server" "$HOME/.local/bin/omarchy-help-server"
install -m755 "$ROOT/bin/omarchy-help-update-manual" "$HOME/.local/bin/omarchy-help-update-manual"

# The tutor method ships as a skill (the Omarchy way — cf. diagnose-crash):
# agents pick it up from ~/.claude/skills; a copy sits in the config dir for
# harnesses without a skill mechanism.
mkdir -p "$HOME/.claude/skills"
rm -rf "$HOME/.claude/skills/omarchy-help"
cp -r "$ROOT/skills/omarchy-help" "$HOME/.claude/skills/omarchy-help"
cp "$ROOT/skills/omarchy-help/SKILL.md" "$DIR/SKILL.md"

# The widget server runs as a user service (like omarchy-crash-watch).
mkdir -p "$HOME/.config/systemd/user"
cp "$ROOT/systemd/omarchy-help.service" "$ROOT/systemd/omarchy-help-watch.service" "$HOME/.config/systemd/user/"
systemctl --user daemon-reload 2>/dev/null || true
systemctl --user enable --now omarchy-help.service 2>/dev/null || true
# The tip watcher (one workflow suggestion a day, max). Turn off any time:
#   systemctl --user disable --now omarchy-help-watch
install -m755 "$ROOT/bin/omarchy-help-watch" "$HOME/.local/bin/omarchy-help-watch"
systemctl --user enable --now omarchy-help-watch.service 2>/dev/null || true
"$HOME/.local/bin/omarchy-help-update-manual" || true

EXT="$HOME/.config/omarchy/extensions/omarchy-menu.jsonc"
if ! grep -q '"help"' "$EXT" 2>/dev/null; then
  python3 - "$EXT" <<'EOF'
import json, re, sys, os
p = sys.argv[1]
row = '"help": {"icon": "\U000f0625", "label": "Help", "description": "Ask anything about Omarchy", "action": "omarchy-help", "aliases": ["how", "ayuda"]}'
if not os.path.exists(p) or not re.sub(r"//.*", "", open(p).read()).strip().strip("{}").strip():
    open(p, "w").write("{\n  " + row + "\n}\n")
else:
    s = open(p).read()
    i = s.rindex("}")
    body = s[:i].rstrip()
    sep = "," if body.rstrip().endswith(("}", '"', "]")) and not body.rstrip().endswith("{") else ""
    open(p, "w").write(body + sep + "\n  " + row + "\n}\n")
EOF
  echo "menu: Help entry added"
fi

echo "Installed. Run omarchy-help for the chat widget (omarchy-help --tui for a terminal session)."
echo "Optional: a compact floating helper window — add to ~/.config/hypr/bindings.lua:"
echo "  o.bind(\"SUPER + SHIFT + H\", \"Omarchy helper\", \"foot --app-id=omarchy-help --title='Omarchy Help' -e omarchy-help\")"
echo '  o.window("^omarchy-help$", { float = true, center = true, size = { 620, 700 } })'
echo "Uninstall: rm -rf ~/.config/omarchy-help ~/.local/bin/omarchy-help (and the menu entry)."
