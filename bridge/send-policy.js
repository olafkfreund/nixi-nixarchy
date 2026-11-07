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
const SEND = /\b(?:send|reply-all|replyall|reply|forward|fwd|autoreply|post|create)\b/i;
const DRAFT_ONLY = /\bdrafts\s+(?:create|reply|forward|update)\b/gi;

export function isGogSend(toolCall) {
  let command = toolCall?.rawInput?.command;
  if (Array.isArray(command)) command = command.join(" ");
  if (typeof command !== "string") return false;
  const words = command.replace(/\\\n/g, "").replace(/['"\\]/g, "");
  return GOG.test(words) && (API.test(words) || SEND.test(words.replace(DRAFT_ONLY, "")));
}

export const isClickOnly = (toolCall) => isHerdrWrite(toolCall) || isGogSend(toolCall);

const GOG_COMMANDS = [
  "chat messages create", "chat messages post", "chat messages send", "gmail drafts post",
  "gmail drafts send", "gmail reply-all", "gmail replyall", "gmail autoreply",
  "gmail forward", "gmail reply", "gmail send", "gmail fwd", "mail send", "send", "api",
];
const POSITIONAL_ID = new Set([
  "gmail reply", "gmail reply-all", "gmail replyall", "gmail forward", "gmail fwd",
  "gmail drafts send", "gmail drafts post", "chat messages send", "chat messages create", "chat messages post",
]);

export function gogSendDetail(toolCall) {
  const raw = toolCall?.rawInput?.command;
  const words = Array.isArray(raw) ? raw : typeof raw === "string"
    ? raw.match(/"(?:\\.|[^"\\])*"|'[^']*'|(?:\\.|[^\s'"\\])+/g) ?? [] : [];
  const start = words.findIndex((word) => /(?:^|\/)gog$/.test(word));
  const tail = words.slice(start + 1);
  const command = start < 0 ? "unknown" : GOG_COMMANDS.find((entry) =>
    entry.split(" ").every((word, index) => tail[index] === word)) ?? "unknown";
  if (command === "unknown") return { kind: "gog", command, to: "" };
  const count = command.split(" ").length;
  const recipients = [];
  for (let i = count; i < tail.length; i++) {
    const flag = /^(--to|--cc|--bcc)(?:=(.*))?$/.exec(tail[i]);
    if (!flag) continue;
    const value = flag[2] ?? tail[++i];
    if (!value || value.startsWith("--")) return { kind: "gog", command, to: "" };
    recipients.push(value.replace(/^(['"])(.*)\1$/, "$2"));
  }
  const positional = tail[count]?.replace(/^(['"])(.*)\1$/, "$2") ?? "";
  const to = recipients.length ? recipients.join(", ")
    : POSITIONAL_ID.has(command) && !positional.startsWith("-") && /^[\w@./:+-]+$/.test(positional) ? positional : "";
  return { kind: "gog", command, to };
}
