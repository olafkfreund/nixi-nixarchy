// What a permission prompt is asking to approve, as plain text built from the
// ACP tool call's own fields: the command or raw input, the diffs, and any
// text content. The card renders it as PlainText, so nothing here is escaped.

// ponytail: the byte cap counts UTF-16 characters, not UTF-8 bytes; the same
// for ASCII, and a few KB more for non-ASCII text is harmless.
export const CAP_BYTES = 16 * 1024;
export const CAP_LINES = 400;

const lines = (text) => text.replace(/\n$/, "").split("\n");

// POSIX single-quoting, applied only where it is needed. An argv array joined
// on spaces cannot be told from one whose arguments contain spaces, so
// ["rm", "-rf", "/tmp/a b"] read as two paths and was one (#50). Quoting only
// what needs it keeps the ordinary case identical to the shell line the reader
// already knows how to read, and makes the appearance of a quote a signal --
// this argument contains something surprising -- rather than punctuation.
const SHELL_SAFE = /^[A-Za-z0-9_@%+=:,./-]+$/;
const shellQuote = (arg) => SHELL_SAFE.test(String(arg))
  ? String(arg)
  : `'${String(arg).replace(/'/g, "'\\''")}'`;

// Every key, not the first one that matches. Returning `command` alone made
// whatever a tool carries beside it invisible on the card being approved, and
// an allowlist would only move that gap to the NEXT tool's new field, silently
// (#50). `command` goes first because it is the part that must be read.
function rawInputText(rawInput) {
  if (!rawInput || typeof rawInput !== "object") return "";
  const { command, ...rest } = rawInput;
  const head = typeof command === "string" ? command
    : Array.isArray(command) ? command.map(shellQuote).join(" ")
    : command === undefined ? "" : JSON.stringify(command, null, 2);
  const tail = Object.keys(rest).length ? JSON.stringify(rest, null, 2) : "";
  return [head, tail].filter(Boolean).join("\n");
}

function contentText(item) {
  if (item?.type === "diff") return [
    item.path,
    ...(item.oldText ? lines(item.oldText).map((line) => `- ${line}`) : []),
    ...lines(item.newText ?? "").map((line) => `+ ${line}`),
  ].join("\n");
  if (item?.type === "content" && item.content?.type === "text") return item.content.text;
  return "";  // terminals refer to output, not to what will run
}

export function permissionDetail(toolCall) {
  const parts = [rawInputText(toolCall?.rawInput), ...(toolCall?.content || []).map(contentText)];
  const full = parts.filter(Boolean).join("\n\n");
  const kept = full.split("\n").slice(0, CAP_LINES).join("\n").slice(0, CAP_BYTES);
  const omitted = full.length - kept.length;
  if (!omitted) return { detail: full, omitted: 0 };
  return {
    detail: `${kept}\n… ${omitted.toLocaleString("en-US")} more characters not shown. `
      + "If you cannot see all of what you are approving, choose Deny.",
    omitted,
  };
}
