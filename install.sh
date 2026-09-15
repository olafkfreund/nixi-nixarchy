#!/usr/bin/env bash
# Thin wrapper: all mutations live in install.py (descriptor-bound, atomic,
# rollback-safe). Flags pass straight through — see install.py for the list.
#   ./install.sh                core (knowledge, programs, bar button, bridge deps, menu entry)
#   ./install.sh --with-watcher --with-skill --with-hooks   opt-in extras
#   ./install.sh --all          everything at once
set -euo pipefail
exec python3 "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/install.py" "$@"
