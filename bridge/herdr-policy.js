// A herdr write is a command that types into another agent's session (#95).
// The bridge forces a card for it in every mode, so detection must not miss one.
// It matches anywhere in the command, not at a segment start: `env X=1 herdr …`,
// `sudo`, `timeout 5`, `bash -c "…"`, `$(…)` and backticks all wrap the call.
// shortcut: no shell parsing, so `echo herdr agent prompt` also matches. A false
// positive is an extra card, never a hidden write.
const HERDR_WRITE = /\bherdr\b(?:\s+--session\s+\S+)?\s+(?:agent\s+(?:prompt|send-keys)|pane\s+(?:send-text|send-keys))\s*(\S*)\s*([\s\S]*)/;

export function isHerdrWrite(toolCall) {
  const command = toolCall?.rawInput?.command;
  return typeof command === "string" && HERDR_WRITE.test(command);
}

// {pane, text} for the audit line, or null when the command does not parse.
export function herdrWriteDetail(toolCall) {
  const match = HERDR_WRITE.exec(toolCall?.rawInput?.command ?? "");
  return match ? { pane: match[1], text: match[2].trim() } : null;
}
