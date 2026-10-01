// ACP content blocks -> markdown, for the card. The agent can send an image or a
// resource link instead of text; the bridge writes the bytes into a private
// media directory itself (never the agent, so this works in Guide) and hands the
// card a file:// markdown image, which the card's allowlist (TextFormat.js)
// admits only from that directory.
//
// Everything here is synchronous: the caller sits inside the agent_message_chunk
// handler and a later await could reorder streamed text.
import { lstatSync, mkdirSync, readdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash, randomBytes } from "node:crypto";

// The extension comes from this table, never from the agent.
const EXTENSION = {
  "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp",
  "image/svg+xml": "svg", "image/gif": "gif",
};
const MIME_BY_SUFFIX = {
  ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".gif": "image/gif",
};
export const LIMITS = { bytes: 4 * 1024 * 1024, files: 200, total: 64 * 1024 * 1024 };

// A declared type must match the bytes: an agent cannot park something else
// under an image name.
function looksLike(mime, bytes) {
  const head = bytes.subarray(0, 16);
  switch (mime) {
    case "image/png": return head.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    case "image/jpeg": return head[0] === 0xff && head[1] === 0xd8;
    case "image/gif": return head.subarray(0, 4).toString("latin1") === "GIF8";
    case "image/webp": return head.subarray(0, 4).toString("latin1") === "RIFF" && head.subarray(8, 12).toString("latin1") === "WEBP";
    case "image/svg+xml": return bytes.toString("utf8", 0, 4096).includes("<svg");
    default: return false;
  }
}

// Created 0700; refuses a symlinked directory. Then oldest-first pruning to the
// count and byte budget, so the directory is a bounded cache, not a transcript.
export function prepareMediaDir(dir, limits = LIMITS) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (!lstatSync(dir).isDirectory()) throw new Error("media directory is not a directory");
  const files = [];
  for (const name of readdirSync(dir)) {
    try {
      const stat = lstatSync(join(dir, name));
      if (stat.isFile()) files.push({ name, size: stat.size, time: stat.mtimeMs });
    } catch {}
  }
  files.sort((a, b) => a.time - b.time);
  let total = files.reduce((sum, file) => sum + file.size, 0);
  let count = files.length;
  for (const file of files) {
    if (count <= limits.files && total <= limits.total) break;
    try { unlinkSync(join(dir, file.name)); } catch {}
    count--;
    total -= file.size;
  }
}

// Atomic, 0600, never through a symlink. The same bytes twice are one file.
function save(dir, bytes, hash, mime) {
  const path = join(dir, `${hash}.${EXTENSION[mime]}`);
  try {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    // prepareMediaDir refuses a symlinked directory at startup, but the bridge
    // only reports that failure and carries on -- and mkdirSync above succeeds
    // through a symlink that already points at a directory, so the write would
    // land in its target. Re-check here, where the file is actually created.
    if (!lstatSync(dir).isDirectory()) return null;
    try {
      return lstatSync(path).isFile() ? path : null;
    } catch {}
    const temp = join(dir, `.${hash}.${randomBytes(8).toString("hex")}.tmp`);
    writeFileSync(temp, bytes, { mode: 0o600, flag: "wx" });
    renameSync(temp, path);
    return path;
  } catch { return null; }
}

function fromBase64(data) {
  if (typeof data !== "string" || data.length === 0 || data.length > LIMITS.bytes * 2) return null;
  if (data.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return null;
  const bytes = Buffer.from(data, "base64");
  return bytes.length > 0 && bytes.length <= LIMITS.bytes ? bytes : null;
}

const percent = (c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`;
function link(name, uri) {
  const label = String(name).replace(/[\u0000-\u001f\u007f[\]\\]/g, " ").trim().slice(0, 200) || "link";
  return `\n[${label}](${String(uri).replace(/[\u0000- \u007f()<>]/g, percent)})\n`;
}
// The alt text is never empty. Qt's markdown importer drops an image whose alt
// is "" -- `![](file://x.png)` renders nothing at all, while `![image](...)`
// renders -- so an empty alt would mean every image the bridge writes is
// silently invisible in the card. Proved against a live Quickshell window.
function image(path, alt) {
  const label = String(alt || "").replace(/[\u0000-\u001f\u007f[\]\\]/g, " ").trim().slice(0, 80) || "image";
  return `\n![${label}](file://${path})\n`;
}

// Returns { markdown, error }. markdown is "" when nothing could be shown;
// error says why, for a diagnostic.
// localFiles says whether a resource_link may be read off disk and shown. It is
// false at Guide: naming a path there would let the agent put any readable file
// on screen without a permission request, which is the one thing Guide promises
// it cannot do (its own Read tool would be cancelled). The link still shows.
export function blockMarkdown(block, dir, localFiles = false) {
  try {
    if (block.type === "image") {
      const mime = EXTENSION[block.mimeType] ? block.mimeType : null;
      if (!mime) return { markdown: "", error: `image type not allowed: ${String(block.mimeType).slice(0, 40)}` };
      const bytes = fromBase64(block.data);
      if (!bytes || !looksLike(mime, bytes)) return { markdown: "", error: "image data is not valid" };
      const hash = createHash("sha256").update(block.data).digest("hex").slice(0, 16);
      const path = save(dir, bytes, hash, mime);
      return path ? { markdown: image(path, "image") } : { markdown: "", error: "could not write the image" };
    }
    if (block.type === "resource_link") {
      if (typeof block.name !== "string" || typeof block.uri !== "string" || !block.name || !block.uri)
        return { markdown: "", error: "resource link without name and uri" };
      const mime = MIME_BY_SUFFIX[extname(block.uri.split(/[?#]/)[0]).toLowerCase()];
      if (localFiles && mime && block.uri.startsWith("file://")) {
        const source = fileURLToPath(block.uri);
        const stat = lstatSync(source);
        if (stat.isFile() && stat.size <= LIMITS.bytes) {
          const bytes = readFileSync(source);
          if (looksLike(mime, bytes)) {
            const hash = createHash("sha256").update(bytes).digest("hex").slice(0, 16);
            const path = save(dir, bytes, hash, mime);
            if (path) return { markdown: image(path, block.name) };
          }
        }
      }
      return { markdown: link(block.name, block.uri) };
    }
    return { markdown: "" };
  } catch (error) {
    // A resource_link whose file cannot be read is still a link.
    if (block?.type === "resource_link" && typeof block.name === "string" && typeof block.uri === "string")
      return { markdown: link(block.name, block.uri) };
    return { markdown: "", error: "could not read the content block" };
  }
}

// A chart the bridge drew itself (MediaModel.chartSvg), saved like any image.
// Returns the markdown image, or null when it could not be written.
export function svgMarkdown(svg, title, dir) {
  const bytes = Buffer.from(svg, "utf8");
  if (bytes.length > LIMITS.bytes) return null;
  const path = save(dir, bytes, createHash("sha256").update(bytes).digest("hex").slice(0, 16), "image/svg+xml");
  return path ? image(path, title || "chart") : null;
}
