import { agentLabel } from "./harness-policy.js";

const LOGIN = /authentication required|not logged in|please log in|please login/i;
const CLOSED = /^(?:ACP )?connection closed\.?$/i;

export function needsNewSession(error) {
  const message = String(error?.message || error || "");
  return LOGIN.test(message) || CLOSED.test(message);
}

export function explainHarnessError(error, agent) {
  const message = String(error?.message || error || "Unknown agent error");
  const name = agentLabel(agent);
  if (LOGIN.test(message))
    return `${name} needs a login. Open the system ${agent} harness and sign in, then start a new session in Nixi.`;
  if (/requires? (?:a )?newer|upgrade.*(?:codex|claude|opencode)|(?:codex|claude|opencode).*outdated/i.test(message))
    return `${name} needs an update. Update the system harness, then start a new session in Nixi. ${message}`;
  if (CLOSED.test(message))
    return `${name} closed the connection. Start a new session; if it happens again, check that the system harness opens successfully outside Nixi.`;
  return message;
}
