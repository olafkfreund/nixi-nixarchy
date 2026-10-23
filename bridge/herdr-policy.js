// A herdr write is a command that types into another agent's session (#95).
// The bridge forces a card for it in every mode, so detection must not miss one.
const HERDR_WRITE = /^\s*(?:\S*\/)?herdr\s+(?:--session\s+\S+\s+)?(?:agent\s+(?:prompt|send-keys)|pane\s+(?:send-text|send-keys))\b/;

// shortcut: split only, no shell parsing. A quoted `;` in prompt text can add a
// false positive (an extra card), never hide a write.
export function isHerdrWrite(toolCall) {
  const command = toolCall?.rawInput?.command;
  if (typeof command !== "string") return false;
  return command.split(/;|&&|\|\||\||\n/).some((segment) => HERDR_WRITE.test(segment));
}
