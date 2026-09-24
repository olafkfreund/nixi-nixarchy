---
status: draft
issue: 41
intent: intent/2026-09-24-41-guide-read-gate.md
---

# Spec: Document what Guide actually does, and close the Grep/Glob gap

Approved direction: **make the docs match Guide**. Unprompted `Read`/`Grep`/
`Glob` in Guide stays, as a deliberate design decision -- a read-only tutor that
can inspect the machine it is teaching about. The secret-path protection is
fixed, because a denylist covering one of three allowed read tools is not doing
its job.

## Design

Two parts. No change to `claudePermissions`'s trust behaviour.

**1. Close the Grep/Glob gap (`bridge/trust-policy.js:57-74`).**

`CLAUDE_SECRET_READS` is 16 `Read(...)` patterns. Claude Code matches rules per
tool name, so `Read(~/.ssh/**)` does not constrain `Grep` or `Glob`. Since
`claudePermissions` returns `allow: ["Read", "Grep", "Glob"]`, two of the three
allowed tools can reach every enumerated path with no prompt.

Generate the `ask` list over all three tool names from the single existing path
list, rather than writing 48 literals:

```js
const SECRET_PATHS = [ "~/.ssh/**", "~/.gnupg/**", ... ];   // today's 16, unchanged
const SECRET_READS = ["Read", "Grep", "Glob"]
  .flatMap((tool) => SECRET_PATHS.map((p) => `${tool}(${p})`));
```

The path list stays the single source of truth, so a path added later is covered
for all three tools automatically -- which is the property whose absence caused
this.

Claude Code resolves `deny > ask > allow` across all settings sources, so these
`ask` entries win over the `allow`, and the user's own rules still win over
both. That ordering is already relied on by the existing list and is unchanged.

**2. Correct the documentation.**

Four places state or imply that Guide cancels everything:

- `README.md:156-158` -- "The bridge **cancels every permission request** before
  it reaches you". Becomes: the bridge cancels every permission request it
  receives; reading and searching are allowed without a prompt so Nixi can look
  at your configuration, and sensitive paths still ask. "Nothing on your machine
  changes" is accurate and stays.
- `README.md:33` -- the walkthrough caption, same correction in one clause.
- `README.md:163-166` -- the per-agent table rows reading "requests cancelled"
  gain the reads exception.
- `docs/architecture.md:134-136` -- "every ACP permission request is cancelled in
  the bridge and never reaches the card" gains the same qualification, and gains
  a sentence explaining *why* no request appears for those three tools: Claude
  Code applies the allowlist itself, so they never reach ACP.
- `bridge/trust-policy.js:1-12` -- the header comment, which is the origin of the
  claim. It must state the actual invariant: Guide cancels every request that
  reaches the bridge, and Read/Grep/Glob are allowed by the agent's own settings
  and so never produce one. Secrets ask in both trust levels.

The distinction the docs must carry is between *changing* the machine, which
Guide genuinely prevents, and *reading* it, which Guide permits without asking.
The current wording conflates them.

## Alternatives rejected

**Trust-gate `claudePermissions` so Guide prompts for reads.** The alternative
direction, explicitly not chosen. It would make Guide match today's wording, at
the cost of the #27 prompt fatigue reappearing in the default level.

**Write 48 literal patterns.** Rejected: three copies of one list, drifting the
moment a path is added -- the same shape of defect as the one being fixed.

**A `PreToolUse` hook enforcing the boundary.** Rejected: a second enforcement
mechanism beside the settings-based one, for a case the settings already express.

**Leave the Grep/Glob gap and document it too.** Rejected: the approved option
explicitly retains closing it, and unlike the read allowance it has no design
rationale -- nothing wanted secrets greppable.

## Risks

- **Prompt fatigue returns via the back door.** Tripling the `ask` list means a
  legitimate `Grep` across the home directory can now match a secret pattern and
  prompt. This is the intended trade, but it lands in Mechanic too, which is
  where #27 originally complained. Worth watching in the runtime check.
- **Pattern semantics differ per tool.** `Read(~/.ssh/**)` matches a file;
  `Glob(~/.ssh/**)` matches a pattern argument. The generated rules must be
  confirmed to actually match, not merely to be well-formed -- an `ask` rule
  that never fires is worse than none, because it looks like protection.
- **Docs and code drifting again.** Mitigated by making the header comment in
  `trust-policy.js` the precise statement and having the prose reference it.
- Host-specific risk: none. No packaging, module or unit change.

## Verification

1. **Automated.** Extend `bridge/trust-policy.test.js`: assert the generated
   `ask` list contains a `Read(`, a `Grep(` and a `Glob(` entry for the same
   path, that `SECRET_PATHS` has not shrunk, and that `allow` is unchanged for
   both trust levels. The existing behavioural harness already asserts what the
   bridge sends at `newSession`, so the generated object is checked as sent.
2. **Automated.** `nix flake check`; `node --test bridge/*.test.js`.
3. **Runtime, the gap.** In Mechanic, ask the agent to grep a pattern under
   `~/.ssh/`. It must prompt. Before this change it does not.
4. **Runtime, no regression.** In Mechanic, an ordinary `Grep` under
   `~/.config/nixi` must still run without a prompt.
5. **Docs review.** Read `README.md:156-158` and `docs/architecture.md:134-136`
   against `trust-policy.js` with the code open, and confirm a reader would
   correctly predict that Guide reads files without asking.
