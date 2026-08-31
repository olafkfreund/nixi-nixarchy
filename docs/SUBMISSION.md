### Repository URL

https://github.com/respira-crece-lidera/archy-omarchy

### Category

Productivity

### Tags

AI, Bar, Quickshell

### Suggest a missing tag

_No response_

### Maintainer notes

Archy is a bar widget (Quickshell) plus a small local helper (Python 3, stdlib only, bound to 127.0.0.1) run as systemd **user** units. It teaches new users Omarchy hands-on: an 11-step live guided tour verified through Hyprland events, a 14-stop learning path that skips what the user already does, and a chat that answers through the user's own configured Omarchy agent (Claude Code or Codex, headless) — grounded in the locally fetched official manual. With no agent configured it falls back to curated getting-started chips. Optional consented "do it for me" mode edits only user-level config, always backing up first (cp X X.bak-archy) and reporting the one-line undo.

Dependencies: python3 (no pip packages), an Omarchy default agent for AI answers (optional). Markdown rendering libs (marked, DOMPurify) are vendored and served locally — no CDN or network calls from the widget. Install, removal, and license (MIT) are documented in the README.

### Submission checklist

- [x] The repository is public and contains installation and removal instructions.
- [x] I have documented the plugin license and any external dependencies.
- [x] I confirm that I own or have permission to submit this plugin and its preview assets.
- [x] The plugin does not overwrite user configuration without explicit consent.
- [x] I understand that approval is for listing and is not a security review.
