<!-- fixture for tools/test_nixi.py test_tools_route: one section of olafkfreund/nixarchy docs/manual/troubleshooting.md at 28208eeffc7691019c20446e6d1f96ce7bb62df3 (MIT) -->
### I picked an app in Install and it never appeared

Three things to check, in order:

1. Did you *Apply changes*? Picking only edits `~/.config/nixarchy/apps.nix`.
2. Does your flake `imports = [ ./nixarchy-apps.nix ];`? Without it the
   rebuild succeeds and installs nothing. `nixarchy-apply` warns when nothing
   imports the file.
3. Is the app one you already had? The menu dims rows for apps already on
   `PATH`, and the doctor lists them under *Omarchy apps you already have*.
