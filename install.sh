#!/usr/bin/env bash
# Install the Omarchy Helper for the current user (no sudo, fully reversible).
# - copies the tutor brief + knowledge into ~/.config/omarchy-help/
#   (COPIES, not symlinks: LEARNED.md grows there and belongs to you)
# - links the launcher command into ~/.local/bin
# - adds a Help entry to the Omarchy menu (merged, non-destructive)
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DIR="$HOME/.config/omarchy-help"
mkdir -p "$DIR" "$HOME/.local/bin" "$HOME/.config/omarchy/extensions"
cp "$ROOT/share/CLAUDE.md" "$ROOT/share/KNOWLEDGE.md" "$DIR/"
install -m755 "$ROOT/bin/omarchy-help" "$HOME/.local/bin/omarchy-help"

EXT="$HOME/.config/omarchy/extensions/omarchy-menu.jsonc"
if ! grep -q '"help"' "$EXT" 2>/dev/null; then
  python3 - "$EXT" <<'EOF'
import json, re, sys, os
p = sys.argv[1]
row = '"help": {"icon": "\U000f0625", "label": "Help", "description": "Ask anything about Omarchy", "action": "xdg-terminal-exec omarchy-help", "aliases": ["how", "ayuda"]}'
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

echo "Installed. Try: omarchy-help \"how do workspaces work?\""
echo "Optional keybinding — add to ~/.config/hypr/bindings.lua:"
echo '  o.bind("SUPER + SHIFT + H", "Omarchy helper", "xdg-terminal-exec omarchy-help")'
echo "Uninstall: rm -rf ~/.config/omarchy-help ~/.local/bin/omarchy-help (and the menu entry)."
