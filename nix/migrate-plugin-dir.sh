#!/usr/bin/env bash
# Upgrading from nixi 0.9.x: the Home Manager module used to link the plugin
# file by file, so ~/.config/omarchy/plugins/<id> is a REAL directory holding
# Home Manager's own links. 0.10 links the whole directory instead, and Home
# Manager's checkLinkTargets refuses to replace a real directory -- the whole
# activation fails. This runs before that check and removes the old directory,
# but only when every entry in it is a link into a home-manager-files store
# path, i.e. provably Home Manager's. Anything else (a plugin-manager checkout,
# a file of the user's) is left alone and reported, and the collision error
# stays, because deleting it would lose data.
#
# usage: migrate-plugin-dir.sh <dir>   (DRY_RUN=1 prints instead of deleting)
set -euo pipefail

dir="$1"
[[ -d "$dir" && ! -L "$dir" ]] || exit 0

foreign=$(find "$dir" -mindepth 1 \( -not -type l -o -not -lname '/nix/store/*-home-manager-files/*' \) -print -quit)
if [[ -n "$foreign" ]]; then
  echo "nixi: $dir is not only Home Manager's links (found $foreign); move it aside, then switch again" >&2
  exit 0
fi

if [[ "${DRY_RUN:-}" == 1 ]]; then
  echo "nixi: would remove the 0.9 plugin directory $dir"
  exit 0
fi
find "$dir" -mindepth 1 -maxdepth 1 -type l -delete
rmdir "$dir"
echo "nixi: removed the 0.9 plugin directory $dir (Home Manager links only)"
