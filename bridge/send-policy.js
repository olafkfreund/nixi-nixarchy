// A herdr write is a command that types into another agent's session (#95).
// The bridge forces a card for it in every mode, so detection must not miss one.
// Fail-safe, not a parser: ANY command that mentions herdr (or its socket) counts,
// also with quotes and backslashes removed so `her""dr` and `h\erdr` are caught.
// A false positive is an extra card, never a hidden write.
// Known residual: `$H agent prompt` with H set earlier has no "herdr" text.
const MENTIONS_HERDR = /herdr/i;

export function isHerdrWrite(toolCall) {
  let command = toolCall?.rawInput?.command;
  if (Array.isArray(command)) command = command.join(" ");   // an argv, as permission-detail.js also handles
  if (typeof command !== "string") return false;
  return MENTIONS_HERDR.test(command) || MENTIONS_HERDR.test(command.replace(/\\\n/g, "").replace(/['"\\]/g, ""));
}

// Best effort, for the audit line only: the exact shape of a plain send.
const HERDR_WRITE = /\bherdr\b(?:\s+--session\s+\S+)?\s+(?:agent\s+(?:prompt|send-keys)|pane\s+(?:send-text|send-keys))\s*(\S*)\s*([\s\S]*)/;

// {pane, text} for the audit line, or null when the command does not parse.
export function herdrWriteDetail(toolCall) {
  const command = toolCall?.rawInput?.command;
  const text = Array.isArray(command) ? command.join(" ") : (command ?? "");
  const match = HERDR_WRITE.exec(text);
  return match ? { pane: match[1], text: match[2].trim() } : null;
}

// A wrapper or alias without the word gog remains a residual hidden send.
const GOG = /\bgog\b/i;
const API = /\bapi\b/i;
const SEND = /\b(?:send|reply-all|replyall|reply|forward|fwd|autoreply|post|create|respond|rsvp)\b/i;
const DRAFT_ONLY = /\bdrafts\s+(?:create|reply|forward|update)\b/gi;

export function isGogSend(toolCall) {
  let command = toolCall?.rawInput?.command;
  if (Array.isArray(command)) command = command.join(" ");
  if (typeof command !== "string") return false;
  // Two readings, and either counts: quotes removed (keeps a send inside ${UNSET:-$(gog …)}), and also ${…} and
  // $ removed (g$'o'g and g${X}og are gog to the shell) (#219 reviews).
  const plain = command.replace(/\\\n/g, "").replace(/['"\\]/g, "");
  // Any shell expansion ($…, `…`) in a gog command can assemble a send word ("${U:-se}nd"), so it counts (#219 review).
  return [plain, plain.replace(/\$\{[^}]*\}/g, "").replace(/\$/g, "")].some((words) =>
    GOG.test(words) && (API.test(words) || /[$`]/.test(command) || SEND.test(words.replace(DRAFT_ONLY, ""))));
}

export const isClickOnly = (toolCall) => isHerdrWrite(toolCall) || isGogSend(toolCall);

const GOG_COMMANDS = [
  "chat messages create", "chat messages post", "chat messages send", "gmail drafts post",
  "gmail drafts send", "gmail reply-all", "gmail replyall", "gmail autoreply",
  "gmail forward", "gmail reply", "gmail send", "gmail fwd", "mail send", "send", "api",
  "chat dm send", "chat dm create", "chat dm post", "calendar respond", "calendar rsvp", "calendar reply",
];
const POSITIONAL_ID = new Set([
  "gmail reply", "gmail reply-all", "gmail replyall", "gmail forward", "gmail fwd",
  "gmail drafts send", "gmail drafts post", "chat messages send", "chat messages create", "chat messages post",
  "chat dm send", "chat dm create", "chat dm post",
]);
// gog's global flags, which may come before the command words (the gog skill writes `gog -a "$ACCT" --no-input
// gmail send …`). These take a value; any other leading flag is taken as a switch.
const GLOBAL_VALUE_FLAGS = new Set(["-a", "--account", "--color", "--home", "--client", "--access-token",
  "--quota-project", "--enable-commands", "--enable-commands-exact", "--disable-commands", "--select"]);

const VALUE_FLAGS = new Set(["--body", "--body-html", "--body-file", "--raw-file", "--subject", "--text", "--html", "--file", "--attach"]);
const ADDRESS = /^[^\s@,'"]+@[^\s@,'"]+$/;

const unquote = (word) => word.replace(/"((?:\\.|[^"\\])*)"|'([^']*)'|\\(.)/g, (_, d, s, e) =>
  d !== undefined ? d.replace(/\\(.)/g, "$1") : s !== undefined ? s : e);

export function gogSendDetail(toolCall) {
  const raw = toolCall?.rawInput?.command;
  const words = Array.isArray(raw) ? raw : typeof raw === "string"
    // whole shell words: adjacent quoted and unquoted parts are one argument (--body="a "--bcc=x is one)
    ? (raw.match(/(?:"(?:\\.|[^"\\])*"|'[^']*'|\\.|[^\s'"\\])+/g) ?? []).map(unquote) : [];
  const start = words.findIndex((word) => /(?:^|\/)gog$/.test(word));
  let tail = words.slice(start + 1);
  while (tail[0]?.startsWith("-")) tail = tail.slice(GLOBAL_VALUE_FLAGS.has(tail[0]) ? 2 : 1);
  const command = start < 0 ? "unknown" : GOG_COMMANDS.find((entry) =>
    entry.split(" ").every((word, index) => tail[index] === word)) ?? "unknown";
  if (command === "unknown") return { kind: "gog", command, to: "" };
  // A heredoc or a second line is stdin or another command, not arguments: no recipient is read from it.
  if (typeof raw === "string" && /<<|\n/.test(raw)) return { kind: "gog", command, to: "" };
  const count = command.split(" ").length;
  const recipients = [];
  for (let i = count; i < tail.length; i++) {
    if (VALUE_FLAGS.has(tail[i])) { i++; continue; }        // its value is message text, whatever it looks like
    const flag = /^(--to|--cc|--bcc)(?:=(.*))?$/.exec(tail[i]);
    if (!flag) continue;
    const value = (flag[2] ?? tail[++i] ?? "").replace(/^(['"])(.*)\1$/, "$2");
    // Only addresses are kept: anything else is ambiguous and may be text (#219 review).
    if (!value.split(",").every((one) => ADDRESS.test(one.trim()))) return { kind: "gog", command, to: "" };
    recipients.push(value);
  }
  const positional = tail[count]?.replace(/^(['"])(.*)\1$/, "$2") ?? "";
  const to = recipients.length ? recipients.join(", ")
    : POSITIONAL_ID.has(command) && !positional.startsWith("-") && /^[\w@./:+-]+$/.test(positional) ? positional : "";
  return { kind: "gog", command, to };
}
