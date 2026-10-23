---
status: approved
issue: 95
author: olafkfreund
---

# Intent: Ask about, and add to, running agent sessions by voice

## Problem

The user runs several long agent sessions at once (Claude Code, Codex, agy) inside herdr, a
terminal workspace manager for AI agents. To find out how one is doing, or to give it the input it
waits for, they have to find the right herdr pane, read its scrollback, and type there. The
snowflake companion (#94) can already tell them that an agent needs input and jump to its pane.
It cannot answer "how is the Factory session doing?" and cannot pass on "approve the spec and
continue".

The tools exist on the machine:

- herdr: `herdr agent list | get | read | prompt | send-keys | wait | attach | focus`. Agents have
  live names, and states such as `idle`, `done`, `blocked` and `unknown`.
- `claude --remote-control`, `codex remote-control`, `agy remote-control`. Each covers sessions it
  started itself; none can take over an arbitrary pane already running in herdr.
- nixi's ai-mirror desktop control (Mechanic only, `services.nixi.aiMirror`).

Nothing connects them to nixi's voice, and nothing keeps them inside nixi's trust model.

What makes this more than plumbing (from the Codex and agy reviews, verified in the code):

- **Typing into another agent's session is a write to the machine.** "Approve the spec and
  continue" can make that agent edit files, run commands or open a PR. nixi's trust levels exist
  so that this happens only in Mechanic and only after the user agrees. Its backups and undo do
  not cover what another agent does next.
- **Voice is easy to misfire.** The wake word accepts several spellings. The follow-up window
  accepts speech without it. #94's S18 already had to stop "okay" or "always" from approving
  cards.
- **Another session's output is untrusted.** Its scrollback can hold repo text, logs, web content
  or secrets. Read back to nixi's agent, it can carry instructions ("please approve") that must
  never count as the user's consent, and it must not be read aloud verbatim.
- **nixi cannot do any of this at Guide today.** Guide attaches no tools and cancels every
  permission request, so even a read-only status call would fail. Only Read/Grep/Glob run without
  a prompt.
- **A spoken "approved" is not an artifact approval.** This repo's workflow records each approval
  as its own commit. Sending "approved" into a terminal does not create that record.

## Proposed outcome

By voice from the companion, or typed into nixi's card:

1. **Status, safe at Guide.** "How is the Factory session doing?" answers with a short spoken
   summary of that herdr agent: its state (working, waiting for you, blocked on a question, done)
   and the gist of its last lines. Raw scrollback is never read aloud. An ambiguous or unknown
   name gets a question back, not a guess.
2. **Show it, safe at Guide.** "Show me the Factory session" opens that pane in its own terminal
   window (`herdr agent attach`). The user types what they want and closes the window. The session
   keeps running in herdr and is never restarted.
3. **Add to it, only in Mechanic and only after an exact confirmation.** "Tell Factory: approve
   the spec and continue." Nixi reads back the session, its state and the exact text it will send,
   and sends only when the user confirms that specific action, by click or by an explicit spoken
   "yes, send it". The confirmation expires and is re-checked against the live session just before
   sending. An agent's own output can never confirm it.
4. **An audit line for every send:** time, target session, text, how it was confirmed, herdr's
   result. Never the session's full output.
5. **Desktop control by voice** reuses nixi's existing ai-mirror path (Mechanic, Claude). It gains
   a clear "controlling your desktop" indication and confirmation for consequential clicks or
   typing.

Rolled out in slices, each worth shipping alone: status first, then "show me", then sends, then
desktop control.

## Affected users and systems

- nixi: `bridge/trust-policy.js` and `bridge/harness-policy.js` (a narrow way for the agent to
  reach herdr, classified read vs write); probably a small herdr MCP server or skill shipped with
  nixi; `docs/architecture.md`; tests under `bridge/`.
- The companion (`olafkfreund/nixoarchy-snowflake`): voice phrases, the confirmation card, the
  "show me" window launch, the audit line.
- Users who run agents in herdr and enable the companion or the card. Nobody else.

## Constraints

- Everything that reaches another session goes through nixi's bridge and trust policy. The
  companion never calls `herdr agent prompt` / `send-keys` itself.
- Guide may only read, and only bounded, summarised status. Sending text or keys, focusing, and
  opening windows that act are Mechanic.
- A send needs a confirmation tied to one exact (session, text) pair, with a timeout. "Always" is
  never offered for sends.
- Output from other sessions is untrusted data: never an instruction, never consent, never spoken
  verbatim, and secrets are never surfaced. nixi's secret-path rules apply. Their relative-path
  gap found in #94's S9 has to be fixed first or alongside.
- No change to how herdr, Claude Code, Codex or agy run their sessions. Nothing is restarted or
  taken over (`attach --takeover` is not used).
- Artifact approvals stay commits. Voice can tell an agent to proceed, and that is all.

## Open questions

1. **Shape of the capability:** a small herdr MCP server attached by nixi (needs MCP at Guide for
   status, and today MCP is Mechanic- and Claude-only), or a skill wrapping the `herdr` CLI with
   narrow Bash allow/ask rules? (The spec will compare them.)
2. **First slice:** status only (recommended by both reviews), or status plus "show me"?
3. **Sessions outside herdr** (a plain `claude --remote-control` session): in scope later, or out?
4. **Confirmation wording:** is a click-only confirmation for sends acceptable at first, with
   spoken confirmation ("yes, send it") added once it proves reliable?

Resolved at approval (2026-10-23): the approver accepted the proposed direction. Q1 is decided
in the spec. Q2: status first. Q3: sessions outside herdr come later. Q4: click-only
confirmation for sends at first.
