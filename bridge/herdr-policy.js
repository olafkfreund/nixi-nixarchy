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
