// What a permission prompt is asking to approve, as plain text built from the
// ACP tool call's own fields: the command or raw input, the diffs, and any
// text content. The card renders it as PlainText, so nothing here is escaped.

// ponytail: the byte cap counts UTF-16 characters, not UTF-8 bytes; the same
// for ASCII, and a few KB more for non-ASCII text is harmless.
export const CAP_BYTES = 16 * 1024;
export const CAP_LINES = 400;

const lines = (text) => text.replace(/\n$/, "").split("\n");

function rawInputText(rawInput) {
  if (!rawInput || typeof rawInput !== "object") return "";
  if (typeof rawInput.command === "string") return rawInput.command;
  if (Array.isArray(rawInput.command)) return rawInput.command.join(" ");
  return Object.keys(rawInput).length ? JSON.stringify(rawInput, null, 2) : "";
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
