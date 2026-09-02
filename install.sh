#!/usr/bin/env bash
# Thin wrapper: all mutations live in install.py (descriptor-bound, atomic,
# rollback-safe). Flags pass straight through — see install.py for the list.
#   ./install.sh                core only (widget, server service, menu entry)
#   ./install.sh --with-watcher --with-skill --with-hooks   opt-in extras
#   ./install.sh --all          everything at once (manual installs only —
#                               the bar click installs core only; extras
#                               are consented one by one inside the widget)
set -euo pipefail
exec python3 "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/install.py" "$@"
