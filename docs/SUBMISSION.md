### Repository URL

https://github.com/respira-crece-lidera/archy-omarchy

### Category

Productivity

### Tags

AI, Bar, Quickshell

### Suggest a missing tag

_No response_

### Maintainer notes

Archy is a bar widget (Quickshell) plus a small local helper (Python 3, stdlib only, bound to 127.0.0.1) run as a systemd **user** unit. It teaches new users Omarchy hands-on: an 11-step live guided tour verified through Hyprland events, a 14-stop learning path that skips what the user already does, and a chat that answers through the user's own configured Omarchy agent (Claude Code or Codex, headless) — grounded in the locally fetched official manual and live machine facts. With no agent configured it falls back to curated getting-started chips. File paths in answers are click-to-open (sanctioned `omarchy-launch-config-editor` flow, existing files under known roots only; nothing is executed from a path).

**Consent model.** The bar click installs the core only (widget files, server service, menu entry). Each persistent integration — coaching watcher service, agent skill, boot/update hooks + weekly timer — is a separate explicit choice inside the widget with its own switch. **Trust has two levels only, so no level claims a boundary it cannot enforce:** *Guide* (default) explains and instructs and is never given a write-capable tool; *Mechanic* is the user's explicit opt-in to their own agent's normal tool access on its strongest model, consent per click, backup first, verified, undo reported, never any privilege escalation. Ordinary tutoring is read-only by construction (Codex `--sandbox read-only`, Claude read-only tools); learned facts are appended by the helper, not the agent.

**Boundary.** Every state-reading or state-changing route requires an unguessable per-session capability token (page-injected; 0600 file for local CLI callers); connections are attributed to their owning uid via `/proc/net/tcp` and refused unless they belong to the server's user; Host/Origin allowlisted; JSON-only bounded bodies, chunked refused; no CORS. Every directory is reached component-wise from `$HOME` with `O_NOFOLLOW|O_DIRECTORY`, each step validated (owner, never world-writable, group-writable only if the group is provably exclusive), and the leaf descriptor retained; state files are `O_NOFOLLOW|O_NONBLOCK` opens with fstat validation and bounded reads, written via `O_EXCL` random 0600 temps with file+dir fsync and non-symlink rename. Subprocesses run in transient systemd user scopes killed by name (identity-bound; never a reused numeric PGID) with producer-side output caps and immediate kill on overflow, timeout, error, shutdown. Installer mutations are descriptor-bound, atomic, journaled with rollback of files and service state (all `systemctl` results checked), refuse symlink targets, and log through the same primitive. Manual updater pins a commit, single tarball at that SHA, per-page git blob hash verification, descriptor-relative publish. No shipped bytecode; no in-tree PKGBUILD (AUR packaging lives in the AUR with a real checksum).

Dependencies: python3 (no pip packages), an Omarchy default agent for AI answers and fixes (optional — tour/learning/chips work without one). Markdown rendering (marked, DOMPurify) is vendored and served locally — no CDN or network calls from the widget; no telemetry. Install, removal, license (MIT), and the security model are documented in the README.

### Submission checklist

- [x] The repository is public and contains installation and removal instructions.
- [x] I have documented the plugin license and any external dependencies.
- [x] I confirm that I own or have permission to submit this plugin and its preview assets.
- [x] The plugin does not overwrite user configuration without explicit consent.
- [x] I understand that approval is for listing and is not a security review.
