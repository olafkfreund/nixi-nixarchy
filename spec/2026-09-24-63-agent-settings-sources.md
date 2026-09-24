---
status: approved
issue: 63
intent: intent/2026-09-24-63-agent-settings-sources.md
---

# Spec: The agent must not be able to rewrite the rules that govern it

The intent's three open questions are answered below. The first two were
answered by **running it**, not by reading the adapter, because the whole
question was whether a documented behaviour actually holds here.

## Design

Pass `settingSources: ["user"]` in the `claudeCode` options at
`bridge/bridge.js:255-265`, beside the `permissions` object already sent there.

The adapter accepts it -- it appears in its options destructuring alongside
`permissionMode` and `disallowedTools`, and feeds
`allowedSources: (settingSources ?? ["user","project","local"]).map(...)`. The
default is all three; naming only `user` drops `project` and `local`, which are
precisely `.claude/settings.json` and `.claude/settings.local.json` **in the
agent's working directory**.

This removes the capability rather than policing a path. There is no list to
keep current and no second enforcement mechanism -- the #41 lesson.

### Question 1: does this cost the tutor brief? No. Measured.

The cwd is `~/.config/nixi` so Claude Code loads `CLAUDE.md` there. If settings
sources and memory were the same mechanism, this fix would trade the brief for
the boundary.

They are not. Run in a scratch directory containing both a `CLAUDE.md` and a
`.claude/settings.json`:

```
claude --setting-sources user -p "What is the SECRET WORD?"   ->  PINEAPPLE
```

`CLAUDE.md` is still loaded. `claudeMd` in the adapter is a separate
managed-settings injection and is not the path the tutor brief takes.

### Question 1b: does it actually stop project settings? Yes. Measured.

Same directory, `.claude/settings.json` setting `env.ZZ_PROBE`:

| sources | `echo $ZZ_PROBE` |
| --- | --- |
| default | `project-settings-were-loaded` |
| `user` | empty |

So the escalation route closes and the brief survives. Both directions checked,
because "it should not load project settings" and "it still loads CLAUDE.md"
are different claims and only one of them is the security one.

### Question 2: `user` rather than `[]`

Nixi is a card on someone else's machine, not the owner of their agent
configuration. `settingSources: []` would also close the hole and would
silently discard a user's own deliberate Claude Code settings. Keeping `user`
means Nixi constrains what the **agent** can do to itself, and leaves what the
**person** has configured alone.

### Question 3: no write-side deny as well

A `deny` on `~/.config/nixi/.claude/**` would be the denylist-of-one the #52
enumeration warned against, and it is redundant once the source is not read:
the agent may write the file, and nothing will load it.

## Alternatives rejected

**`deny` writes to `~/.config/nixi/.claude/**`.** Polices one path instead of
removing the capability, needs maintaining, and does not stop
`Bash(echo >> file)` -- which the #52 enumeration recorded as an honest limit of
every path rule.

**Manage `.claude/` in `hm-module.nix`.** Helps only the Nix path, only between
activations, and does nothing for `install.py`.

**`settingSources: []`.** See question 2.

## Risks

- **Codex and OpenCode are not covered.** This is the Claude `_meta` path;
  the other adapters take different options and were not examined. Fixing the
  instance again is exactly what the #52 enumeration warned about, so this is
  recorded as a known gap and a follow-up rather than quietly implied to be
  done.
- **A user who genuinely wants project settings for Nixi's agent loses them.**
  Judged acceptable: that directory is Nixi's, not theirs, and their own `user`
  settings still apply.
- **The adapter could change its option name or default.** The test asserts what
  is actually sent at `newSession`, so a rename shows up as a failing
  assertion rather than a silent reopening.
- Host-specific risk: none.

## Verification

1. `bridge/trust-policy.test.js`, via the behavioural harness that drives the
   real bridge and asserts what was transmitted: `settingSources` is
   `["user"]` in the Claude `newSession` meta, and is absent for Codex and
   OpenCode.
2. The assertion must be shown to fail without the change.
3. `node --test bridge/*.test.js`; `nix flake check`.
4. Runtime, not automatable here: with the card running, a
   `~/.config/nixi/.claude/settings.json` granting a permission must have no
   effect, and the tutor must still answer from `CLAUDE.md`.
