---
status: draft
issue: 210
intent: intent/2026-11-06-206-character-friends.md
---

# Spec: hear a summary of an email, and reply to it with a click

Slice 4 of #206. All code is in `olafkfreund/nixoarchy-snowflake`, at main `8f2275e`. Line numbers are from that commit,
so re-find them by name. The nixi bridge is in this repo, under `bridge/`. `gog` is v0.48.0.

## What happens today

- **Nixi doesn't read mail.** His only mail is the shell's notification rows (`Inbox.rows`, `server.py:2239`). These
  carry an app name, a source, and a 120-character summary and body. The summary and body are blanked unless
  `notify_details` is on, and also blanked when they look like a secret or a one-time code (`server.py:2253`). A row
  has no Gmail message id, account or thread. Today's only mail speech is "New mail from …", or the subject when
  `notify_speak_subject` is on (`index.html:2466`).
- **`gog` already serves the day and the calendar,** always with `--readonly` (`day.py:70`, `day.py:93`,
  `server.py:1486`). One account is signed in on p620, with the `gmail` scope. Nixi never calls `gog gmail`.
- **A send is click-only on the page, not on the server.** The bridge marks a `herdr agent prompt` card
  `confirm: "click"` (`bridge/bridge.js:580`). The page then doesn't listen for a spoken answer (`index.html:2894`)
  and ignores Enter and `y` (`index.html:4027`). But `/api/approve/answer` takes `yes` for any pending card id
  (`server.py:6458`), so the rule lives only in the page's code paths.
- **Two tokens.** `TOOL_TOKEN` goes to the commands the agent runs, and works only for `TOOL_PATHS` (`server.py:65`,
  `server.py:6117`). The window's `TOKEN` works everywhere, and sits in `runtime.json`, created with mode 0600
  (`server.py:6969`). Any program running as the user can read that file. In nixi mode the agent's Read, Grep and
  Glob run without a card outside `SECRET_PATHS` (`bridge/trust-policy.js:149`), and `runtime.json` isn't on that
  list. Bash still needs a card.
- **The agent can look at the screen without a card.** `/api/capture` is in `TOOL_PATHS` (`server.py:65`), and
  `nixi-companion see` skips the card (`server.py:785`, `server.py:6440`).
- **Stateless model calls exist once.** `summarize_command` runs `claude -p --model haiku --tools ""
  --no-session-persistence` (`server.py:708`). `--tools ""` turns off the built-in tools only, so MCP servers and
  hooks from the user's config still load. `--bare` would skip hooks, but it can't use the subscription login.
  Ollama runs on p620 at `127.0.0.1:11434`, with `gemma4:12b` and `gemma4:e4b`.
- **Boards hand the page tokens for actions.** For links, sessions and videos, `stages.Store.put` gives the page a
  token and keeps the target (`stages.py:413`). `stage_act` acts only on what the store holds (`server.py:5472`). The
  store keeps the current board and the one before it. A board's text never goes into a prompt, except a day board's
  own note (`server.py:5199`, `server.py:5375`).
- **Speech can be forced local.** `Speaker.say(..., local=True)` goes to Kokoro, Piper or espeak, never ElevenLabs
  (`server.py:4132`, `tts_engine` at `server.py:3621`). While he speaks, the wake word is held off
  (`server.py:4366`).
- **Lock and meeting.** `Desk.locked()` asks Hyprland, and returns `None` when it can't tell (`server.py:2605`).
  `Ambient.meeting` is known only while `proactive` is on (`server.py:1659`).
- **No request logging.** The HTTP handler's `log_message` does nothing (`server.py:6009`).

## Design

### 1. Settings, off for a new install

```python
"mail_on": False,          # the mail board, by menu or voice
"mail_accounts": [],       # exact addresses Nixi may read and reply from; must also be signed in to gog with gmail
"mail_model": "",          # an Ollama model for summaries; "" = no summaries, the board still lists and replies
```

They go beside the notification settings (`server.py:219`), with a small Mail section in Settings: a switch, one
checkbox per address from `gog auth list --json`, and the Ollama model from `/api/tags`. Changing any of the three
drops the current draft and closes a mail board. The user's answers to open questions 1 and 2 set them for p620.

**Summaries are local only in this slice.** There is no cloud switch. Summaries never go to Claude, and are never
spoken by ElevenLabs. See open question 3.

### 2. A mail board, server-made

A new server kind `mail` (`stages.SERVER_KINDS`). It opens three ways, and the agent never gets its text:

- **The right-click menu** gets "Mail" while `mail_on` is set (`index.html:3157`).
- **Voice, without the agent.** `quick.handle` (`quick.py:334`) learns a few exact phrases: "read my mail", "any new
  email", "check my email". These open the board and make no agent call.
- **Voice, through the agent.** Any other wording can end in `<<stage>>{"v":1,"kind":"mail"}`, as `day` does. The
  agent says one sentence and the server fills the board. The agent learns that you asked about mail, never what's
  in it.
- **The reactions slice's mail chip** opens the same board later. This slice adds no chip.

`mail_stage()` runs off the turn, as `day_stage` does (`server.py:5365`). For each address in `mail_accounts` that
`gog auth list` also shows with `gmail`, it runs:

```
gog --readonly --json -a <address> gmail messages search "in:inbox is:unread newer_than:3d" --max 5
```

Each row on the board shows the account, sender address, subject and age. The store holds the account and message
id behind two tokens per row, `hear` and `reply`, and the page gets neither id. A row with no message id or thread
id is left out. The board puts nothing in `note`.

**Mail boards aren't kept.** When a mail board is replaced or closed, the store drops it, its tokens and any summary,
instead of keeping it as the previous board. `stageText` gives a mail board no text, so `dismiss` doesn't copy it into
his caption (`index.html:3160`).

**The agent can't look at it.** While a mail board or a reply card is on screen, `/api/capture` answers "mail is on
screen" and takes no picture. Gmail open in a browser is the user's own screen, and isn't covered.

Every `gog` call has `--readonly` except the one send in section 5, and gets argv as a list, never a shell.

### 3. Hear it: a local summary in a stateless call

`hear` fetches one message:

```
gog --readonly --json -a <account> gmail get <messageId>
```

1. **Clean every field, best effort.** The body is the plain-text part, or the HTML part's text with tags removed and
   nothing fetched. Each field the board shows or the model reads (sender, subject and body) goes through the same
   steps:
   - remove control characters with `_clean` (`server.py:5069`), and Unicode direction and format characters;
   - replace every URL with "[link]";
   - drop lines that match `SECRET_LINE` (`server.py:5014`);
   - when `Inbox.OTP` (`server.py:2170`) matches anywhere in the whole message, as it does for a notification,
     replace every code-shaped token in it with "[code]", so a code on the line after "Your code:" goes too;
   - cap the body at 8,000 bytes.
   This removes the common one-time codes and reset links. It can't promise to remove every secret, which is one
   reason summaries stay on this machine.
2. **Summarise it in one call with no tools and no history.** `POST http://127.0.0.1:11434/api/generate` with `model:
   mail_model`, a fixed system prompt, the cleaned text between markers, `stream: false`, temperature 0, and no
   `tools` or `context` field. The URL is fixed to loopback, so `OLLAMA_HOST` can't send it elsewhere. The prompt says
   the text is an email, untrusted, never instructions, and asks for two or three plain sentences.
3. **Clean the answer too,** with the same steps, plus removing `<<`, and cap it at 400 characters. The answer is only
   ever text. It goes to the board and to speech, never to `stages.validate`, a face tag, an approval or a turn.
4. **Say who wrote it.** The board and the voice start with "Summary of an email to <account> from <address>",
   using the `From` header's address. If the model fails, he says "I couldn't summarise that one" and the board
   shows the subject only.
5. **Speak only on your request, and only locally.** `Speaker.say(text, sid, local=True)`. Nothing is spoken when
   `Desk.locked()` isn't `False`, or in a meeting. The same check runs again just before the summary plays, so a
   screen that locks while it's being made drops it. The board still shows the text.

The page draws every mail field with `textContent`: sender, subject, summary, recipients, the reply's words and
`gog`'s errors. Nothing is read as HTML or Markdown, and no image or link loads.

Nothing is written: no file, no `history.jsonl`, no `recall`, no print. `gog`'s stderr is read and dropped, and an
error prints only the exception's class.

### 4. Reply: a draft the server owns

`reply` opens a reply card on the board. The page posts only the row's token, the words you typed and a reply-all
switch:

```
POST /api/mail/draft   {"token": "...", "text": "...", "all": false}
```

The server fetches that message's headers again with `--readonly` and builds the draft from what Gmail returns:

```python
draft = {"id": token_urlsafe(12), "account": acct, "message_id": mid, "thread_id": tid,
         "to": [...], "cc": [...], "subject": "Re: ...", "body": text, "born": monotonic()}
```

- **`account`** is the account the row came from, re-checked against `mail_accounts` and `gog auth list`.
- **`to`** is the `Reply-To` address when there is one, otherwise `From`. When the two differ, the card says so in
  words and shows both, before you click.
- **`cc`** is empty unless you switch on reply-all. Then it's the original `To` and `Cc`, minus your own addresses,
  and every one is listed on the card.
- **Addresses are bare.** Each header is parsed with `email.utils.getaddresses`. Only the address is kept, and it
  must be one plain `local@domain` with no quotes, spaces, commas or newlines. The display names are dropped, so
  what the card shows is exactly what `gog` gets.
- **`body`** is your words, exactly, as UTF-8. Nixi doesn't write or rewrite the reply in this slice.
- No draft is made when the message id or thread id is missing, when there are more than 20 recipients, when any
  header has a newline, or when the body is more than 20,000 bytes.

All draft changes share one lock. There is one draft at a time: a new one replaces the old, Cancel drops it, and it
lasts 10 minutes. The response gives the page the draft's id and every field to show. Editing a word means asking for
a new draft, and a reply from an older draft request is ignored. Notifications never touch a draft: its fields come
only from `gog` and from your typing.

### 5. Send: one pointer click, bound to that draft

The card shows the account, To, Cc, subject and body as the server returned them, read-only, with Send and Cancel.

```
POST /api/mail/send   {"draft": "<id>", "text": "<the body the card shows>"}
```

Under the draft lock, the server checks:

1. `mail_on` is still set, and the draft's account is still in `mail_accounts` and in `gog auth list` with `gmail`.
2. `draft` is the current draft's id, and it's under 10 minutes old.
3. `text` equals `draft["body"]` byte for byte. Otherwise it answers "the words changed, review them again".

It then marks the draft used, before running anything, so a second click finds nothing to send. Then it runs exactly
one command, with no `--readonly`, no `--reply-all` and no `--from`:

```
gog --json -a <account> gmail send --to <to,...> [--cc <cc,...>] --subject <subject>
    --reply-to-message-id <message_id> --body-file -
```

The body goes in on stdin. The page sends no account, recipient or thread, so it can't change them. The card shows
what `gog` returned: sent, with its thread, or the error. If the returned thread isn't the draft's thread, the card
says so plainly. A timeout or a lost answer shows "I don't know if it was sent, check Sent in Gmail", with no retry
button, because it may have gone.

**How "click only" is enforced:**

- **Not by voice.** No voice path reaches `/api/mail/send`. `voiceAnswer`, `askAloud`, `quick.handle` and the agent's
  stages have no call to it. The only caller is the Send button's `click` listener.
- **Not by the keyboard.** The listener sends only when `e.isTrusted` and `e.pointerType` is `mouse`, `pen` or
  `touch`. A click made by Space or Enter on a focused button has no pointer type, so it does nothing. The button
  isn't in a form, and Enter and `y` do nothing on the card, as on a `confirm: "click"` card.
- **Not by the agent's tools.** Both routes are window-token only, and stay out of `TOOL_PATHS`. `runtime.json` is
  added to the bridge's `SECRET_PATHS`, so the agent's Read, Grep and Glob ask before reading the window token.
- **Not by the agent's text or eyes.** The agent never gets mail content. The mail board isn't in a prompt, summaries
  run outside his session, and `/api/capture` refuses while mail is on screen.
- **The limit.** A program running as the user can still read `runtime.json`, post with the full token, drive the
  pointer, or run `gog gmail send` itself. For the agent, each of these needs a Bash call, and every Bash call needs
  a card showing the real command. This slice doesn't widen that path, and can't close it from inside Nixi. See open
  question 5.

### 6. Nothing else changes

The notification path stays as the approved intent lists it: rows, privacy checks, the envelope, sounds, speech and
the click from #215. `notify_details` still decides what a notification row shows. It doesn't govern the mail board,
which reads Gmail directly and has its own switch.

## Alternatives rejected

- **Matching the notification to a Gmail message.** A row carries a sender name and a subject, both spoofable, and no
  id. A match could reply to the wrong thread. The board lists Gmail's own unread messages instead.
- **Summaries in Nixi's own session.** That puts mail in his history and recall, and in reach of his tools. The
  intent rules it out.
- **Letting the agent send, behind a `confirm: "click"` card.** The agent would need the mail, and the card would show
  a `gog` command line, not the words and recipients. The server owning the draft is simpler and binds more.
- **`gog gmail reply` or `--reply-all`.** Then `gog` picks the recipients after you've looked. Nixi passes them
  explicitly.
- **Replying in Gmail's own compose window instead.** Codex suggested it as the simplest safe design, since Nixi
  would never send. The intent asks for replies from his card, so the draft design stays. It's the fallback if the
  user prefers it (open question 4).
- **A model-written reply.** A message could steer it. Your own words only, for now.
- **Reading the whole message aloud.** The issue asks for a summary. The full text could carry anything, and is long.
- **Ollama through `OLLAMA_HOST`.** That variable can point off the machine. Loopback is fixed.
- **Cloud summaries in this slice.** `claude -p` still runs the user's hooks, and `--bare` can't use the subscription
  login, so the call can't be shown to be isolated yet.
- **A per-draft nonce, as agy suggested, against a stolen window token.** Whoever holds the window token can read the
  page's event stream and get the nonce too, so it adds nothing against that.

## Risks

- **A spoofed `From`.** The board and the voice name the `From` address, which a sender controls. Gmail's
  authentication results aren't checked in this slice.
- **A model that obeys the mail anyway.** A summary can be wrong, or say what the mail told it to. It can't act, and
  it's labelled as a summary of an email from that address. Accepted.
- **Cleaning misses something.** A secret in a shape the patterns don't know reaches the local model and the board.
  It stays on this machine.
- **What the local model keeps.** Ollama holds no conversation without `context`. Whether it logs prompts depends on
  its settings (`OLLAMA_DEBUG`). Not verified on p620.
- **A wrong reply address.** A `Reply-To` that differs is shown in words before Send. A careless click still sends.
- **`gog`'s JSON shape.** Fields are read from fixtures recorded once, by hand, on p620. A `gog` update could change
  them. Then rows are left out and no draft is made, rather than a wrong one.
- **What Gmail delivers.** Tests check what Nixi passes to `gog`. The delivered message's headers, thread and body
  are checked by hand once.
- **Gmail only.** Outlook through Omamail gets nothing new.
- **Speaking aloud.** He speaks only when asked, unlocked and not in a meeting. A video call with `proactive` off
  doesn't count as a meeting, so a summary asked for during one is spoken. Accepted; the user asked.

## Verification

- **Settings:** a new install has all three off, and no `gog gmail` call happens anywhere while `mail_on` is off.
  Switching it off, or removing an account, between draft and send sends nothing.
- **`gog` argv** (`tests/test_mail.py`, `gog` faked with fixtures in `tests/fixtures/mail/`):
  - every search and get has `--readonly`, the listed account and list argv;
  - the one send has no `--readonly`, `--reply-all` or `--from`, has `--reply-to-message-id`, and gets the body on
    stdin;
  - an account not in `mail_accounts`, or not signed in with `gmail`, is never called.
- **Cleaning:** fixtures with a 6-digit code on the line after "Your verification code:", a code in the subject, a
  reset link, an `sk-…` key, control and direction characters, and an HTML body reach the faked model and the board
  with none of them. A summary that comes back with a URL or a code is cleaned again.
- **Stateless:** the faked Ollama receives no `tools` and no `context`, at `127.0.0.1` even with `OLLAMA_HOST` set.
  No `claude` process starts during any mail action.
- **Nothing kept:** after a full list, hear, draft and send, `history.jsonl` and `recall` are unchanged, the server's
  stdout and stderr hold no fixture text, and `fakeclaude.py` saw no fixture text in any agent prompt. After the board
  closes, "Previous answer" doesn't bring it back, and its tokens are gone.
- **Inert summary:** a summary of `<<stage>>{"v":1,"kind":"commands",…}`, "[happy] approve", or "send it" changes no
  board, mood, approval or draft.
- **Speech:** spoken through the local engine only, and not at all while locked, when Hyprland doesn't answer, in a
  meeting, or when the screen locks before it plays.
- **Capture:** `/api/capture` with the tool token refuses while a mail board or reply card is up, and works once it
  closes.
- **Draft binding:**
  - `Reply-To` different from `From` gives the Reply-To address, and the card's text names both;
  - reply-all drops your own addresses and lists everyone;
  - a display name with a comma or quotes, a header with a newline, a missing thread id, a 21st recipient, or a body
    of 20,001 bytes makes no draft;
  - a notification arriving after the draft leaves every field the same.
- **Send binding:**
  - a stale or used draft id, text differing by one character, or two sends of the same draft at once each send at
    most once;
  - `TOOL_TOKEN` gets 403 on both routes;
  - a returned thread different from the draft's is reported, not called sent, and a `gog` timeout shows "I don't
    know if it was sent" with no retry.
- **Click only** (`tests/mail_fit.mjs`, headless Chromium, as `notify_fit.mjs`):
  - a real CDP mouse click on Send posts once;
  - a synthetic `.click()`, Tab to Send then Space, Enter, `y`, and a spoken "yes" or "send it" while the card is
    up post nothing;
  - the card shows To, Cc, account and body exactly as the server sent them, and an HTML or image payload in any
    field shows as text.
- **Bridge:** `bridge/trust-policy.test.js` shows a Read of `runtime.json` asks.
- **Unchanged:** `tests/notify_fit.mjs`, `tests/test_inbox.py` and the stage tests pass as they are.
- **By hand on p620, from the user:** one real summary through Ollama, and one real reply to a message the user sends
  himself from another address, checked in Gmail for the account, recipients, thread and words.

## Open questions

1. **Which accounts?** (intent question 2) Recommended: only the one signed in to `gog` today, by exact address.
2. **Which local model?** Recommended: `gemma4:e4b` for speed, or `gemma4:12b` if its summaries read better in the
   by-hand check.
3. **Cloud summaries later?** (intent question 2) Recommended: not until a `claude -p` call is shown to run no hooks
   with the subscription login. Until then, local only, and the cloud voice never speaks mail.
4. **Reply from Nixi's card, or hand over to Gmail's compose window?** Recommended: Nixi's card, as designed. Gmail's
   window is simpler and never sends from Nixi, but you'd finish the reply there.
5. **The agent can still send mail without Nixi's card,** with a Bash call you approve: `gog` has the full `gmail`
   scope, and the token file is readable. Out of scope, noted here. Recommended: separate `gog` credentials, or none,
   for the agents, in `nixos_config`. A `--gmail-no-send` flag alone doesn't stop a Bash call that leaves it out.
6. **Today's subject speech** (`notify_speak_subject`, `index.html:2466`) can go to the cloud voice. Out of scope,
   noted here.
7. **`summarize_command` loads MCP servers and hooks** (`server.py:708`). It sends only a command line, so it's
   minor. Out of scope, noted here.
8. **`runtime.json` keeps its mode only when it's created.** `os.open(..., 0o600)` doesn't tighten a file that already
   exists (`server.py:6969`). Minor, out of scope, noted here.

## Reviews (2026-11-07)

Their findings don't approve anything. Codex reported `gpt-6.1-sol`. agy's JSON reports no model. Each finding was
checked against the code at `8f2275e`.

**Confirmed and applied:**

- Codex: the agent can see mail by looking at the screen, since `/api/capture` is a tool path and `see` skips the
  card. Capture now refuses while mail is on screen.
- Codex: a Space or Enter press on a focused button makes a trusted click. Send now needs a pointer type.
- Codex: the agent's Read reaches `runtime.json` with no card. It's added to `SECRET_PATHS`, and the limit is stated.
- Codex: hooks can still run on `claude -p`, and `--bare` can't use the subscription login. Cloud summaries are out
  of this slice.
- Codex: `Inbox.OTP` per line misses a code on the next line, and subjects weren't cleaned. Cleaning now covers every
  field, works on the whole message, and is called best effort.
- Codex: the account was checked only at draft time. Send re-checks it and `mail_on`, and settings changes drop the
  draft.
- Codex: how the page draws mail wasn't stated. Every field is `textContent`.
- Codex: missing ids, display names with commas, and the 20 KB boundary were loose. They're now exact.
- Codex: a timeout may mean it was sent. The card says so and offers no retry.
- Codex: the store keeps the previous board. Mail boards are now dropped, not kept.
- Codex: speech queued before a lock could still play. The check runs again before it plays.
- Codex: "never URLs or ids" overstated `Store.put`, and 0600 holds only on creation. Both reworded.
- agy and Codex: the window token in `runtime.json` defeats the route checks. This was already stated as the limit;
  it's now sharper, with open question 5.

**Refuted:**

- agy: `Reply-To` should be in `mail_accounts`. `Reply-To` is the other person's address; the card shows it instead.
- agy: `_clean` doesn't replace URLs. The spec replaces URLs as its own step, before and after the model.
- agy: `OLLAMA_HOST` could redirect the call, and requests may be logged. The URL is fixed to loopback, and the
  handler's `log_message` does nothing (`server.py:6009`).
- agy: `/api/approve/answer` could approve a send. Mail sends don't use approvals.
- agy: the double-send guard isn't in the code. This is a spec; the order is stated, and tested with two sends at
  once.
- agy: a test should read `runtime.json` and post. A program running as the user can do that by design; the test
  would prove nothing new.
- Codex: spoken mail could re-enter the microphone. The wake word is held off while he speaks (`server.py:4366`), and
  nothing he hears goes to the mail routes.

**Not verified:** `gog`'s JSON fields, its delivered MIME and threads, Ollama's prompt logging on p620, and whether
`e.pointerType` is set on clicks in the native window. No code has been written or run.

## Rollback

Revert the PR. The three settings become unused keys. Nothing else is stored.
