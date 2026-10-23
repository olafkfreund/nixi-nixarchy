# Model verification — September 4, 2026

The previous adapter bundled Codex 0.148.0: an Astra prompt returned a server
error requiring a newer CLI even though ACP reported readiness and end_turn.
Upgraded codex-acp to 1.10.0 and claude-agent-acp to 0.74.0. The lockfile
installs Codex 0.153.4 and Claude SDK 0.3.257.

Real prompts requested `NIXI_MODEL_OK`, with tools forbidden in the prompt.
Verified response text as well as completion; readiness alone is insufficient.
The medium/high/xhigh/max sweep used the installed plugin bridge; initial low
tests used the identical source bridge and upgraded dependencies.

Verified models: gpt-6-astra, gpt-5.6-luna, gpt-5.6-terra, gpt-5.6-sol,
claude-opus-4-8, claude-opus-5, claude-fable-5, claude-fable-5-1.
Verified effort settings: low, medium, high, xhigh, max.
ACP config responses were checked for the selected model and effort.
Opus 5 resolves to `opus[1m]`, whose adapter metadata explicitly identifies
Opus 5. Versioned Claude selections are passed through per-session settings;
substring matching was removed to prevent Fable 5 selecting Fable 5.1.

UI checks: Hyprland send_shortcut opened the selector in overlay and pinned
windows. Home selected Luna, Return persisted it, and a shell restart retained
the selection. End/Return restored Astra. Super+comma is registered only in
the temporary nixi submap; the global notification binding is unchanged.
wtype did not reliably deliver the chord on this machine.

No release was published as part of this repair.

## System-harness follow-up

The adapter dependency versions above are not the harness launch policy.
Ask now explicitly resolves system Codex/Claude from PATH (or the documented
executable override), and fails visibly rather than using a transitive copy.
With no saved Ask override, the bridge reads Omarchy’s Default Agent.

`node bridge/model-smoke.js --full` passed all 41 live cases: the system
default and eight explicit models at low/medium/high/xhigh/max. Every explicit
case checked final ACP model/effort metadata and an exact `NIXI_SYSTEM_OK`
response, not merely readiness. System versions were Codex 0.153.3 and Claude
Code 2.1.259. Tests did not alter credentials or default settings.

An isolated Quickshell popup rendered an unsupported-harness error, restarted
with system Codex, and rendered `NIXI_RECOVERY_OK`. The installed popup was
then reloaded with no existing Ask conversations open: its selector showed
“Omarchy default” and its real Astra/low prompt rendered `NIXI_INSTALLED_OK`.
The live nixi.json and defaults/agent SHA-256 hashes remained unchanged.

The automated policy tests also cover missing defaults, changed defaults,
saved/explicit overrides, unsupported agents, missing binaries, executable
directories, named/path overrides, and structured startup failures.

Final failure checks used the installed bridge with temporary, empty credential
directories and minimal environments. Real Codex and Claude both produced a
structured fatal login message explaining how to sign in to the system harness
and start a new Ask session. No real credentials were moved. Prompt-time auth
failures are terminal too, so the popup exposes its recovery controls.
Closed-connection and outdated-version message handling is covered by unit
tests; the system harnesses were not downgraded to reproduce an old release.
Unrecognized errors retain their original details. All six automated tests pass.

During final checks, `mise which claude` unexpectedly pruned older tool
installations and reported an inactive Claude entry. No mise configuration was
changed by Ask. A subsequent real Ask/Claude prompt still succeeded. This is
distinct from the completed 41-case model sweep recorded above.

## Shell canary on adapter bumps (#96)

At Guide, Claude auto-approves read-only shell commands unless an `ask` rule
matches. After any claude-agent-acp or Claude Code bump, re-run the canary:
start at Guide and ask for `head ~/x.age` (a throwaway file) and
`cat /etc/hostname`; both must be cancelled. Start at Mechanic: both show a card;
the check is that the secret one still shows a card after "always allow" was
given for `head`.

## Codex secret-read canary (#97)

Measured 2026-10-23 with codex 0.163.0 and codex-acp 2.1.1: at Guide, Codex ran
`cat` on a throwaway `~/.ssh` file and returned it, since its `read-only` sandbox
permits all reads. A permission profile (`default_permissions` with `":root" =
"read"` and the secret paths `"none"`) is accepted by `codex exec` and denied the
named files for every spelling, but codex-acp 2.1.1 fails `newSession` with
`Internal error` when `CODEX_CONFIG` carries one. Nixi therefore refuses Codex at
Guide. After any codex or codex-acp bump, retry: set the profile in
`CODEX_CONFIG`, check `newSession` succeeds, then `cat ~/.ssh/<canary>` (and
`cd ~ && cat .ssh/<canary>`) must be denied while `cat /etc/hostname` works.
Resolve `/run/agenix` with `realpath` first (bubblewrap rejects symlinks).

## OpenCode secret-read canary (#102)

Measured 2026-10-23 with opencode 2.0.32 through the bridge: config `read` denies
keep a throwaway `~/.ssh` file out of the read tool (the model fell back to the
shell, which asks); `glob` ignores path denies; `grep` and `list` were
inconclusive, so they ask. After any opencode bump, re-run at Guide and Mechanic:
`read` of `/etc/hostname` works; `read` of `~/.ssh/<canary>`, `~/x.age` and a
`.env` is denied; `glob ~/.ssh/*` and `grep -r CANARY ~/.ssh` ask. If `glob` or
`grep` now apply the denies, they can return to `"*": "allow"` plus the denies.
