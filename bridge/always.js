// Remembered approvals (#114). An "always" on the card is kept here, by the bridge,
// for one agent in one folder and one exact command, and answered allow_once to the
// adapter next time, so no adapter-side rule ever widens it. Only plain shell
// commands qualify: never an edit, a herdr write, a chained command or a secret path.
import { mkdir, readFile, rename, rm, rmdir, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { isHerdrWrite } from "./herdr-policy.js";
import { shellQuote } from "./permission-detail.js";
import { secretBashRules } from "./trust-policy.js";

// A shell command that runs other commands: a standing yes to it would also approve
// whatever is chained after it. The same rule as the companion's CHAINED_RE (#94, S26).
const CHAINED = /&&|\|\||[;|&<>`\n]|\$\(/;
const commandText = (command) => Array.isArray(command) ? command.join(" ") : typeof command === "string" ? command : "";
// An argv array (codex: ["bash", "-lc", "a; b"]) is joined first, as herdr-policy does.
export const isChained = (toolCall) => CHAINED.test(commandText(toolCall?.rawInput?.command));

const SECRETS = secretBashRules().map((rule) => rule.slice("Bash(*".length, -"*)".length));

export const storePath = (stateHome) => join(stateHome, "nixi", "always.json");

// The exact command, ends trimmed and nothing else: a key that normalised more would
// match a command the user never saw.
export function keyOf(toolCall) {
  const command = toolCall?.rawInput?.command;
  if (Array.isArray(command)) return command.map(shellQuote).join(" ");
  return typeof command === "string" ? command.trim() : "";
}

// cwd: the bridge's folder. A tool call that names its own directory (codex `cwd`, opencode
// `workdir`) elsewhere is not remembered: the key is this folder.
export function rememberable(toolCall, cwd) {
  if (toolCall?.kind !== "execute") return false;
  const dir = toolCall.rawInput?.cwd ?? toolCall.rawInput?.workdir;
  if (dir !== undefined && dir !== cwd) return false;
  const key = keyOf(toolCall);
  return Boolean(key) && !isChained(toolCall) && !isHerdrWrite(toolCall)
    && !SECRETS.some((secret) => commandText(toolCall.rawInput.command).includes(secret));
}

export function createAlways(path) {
  // Only a missing file is empty. Anything else unreadable throws, so a write never
  // replaces entries it could not read (#103).
  async function load() {
    let store;
    try {
      store = JSON.parse(await readFile(path, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return { version: 1, entries: [] };
      throw new Error(`${path} is not valid JSON or not readable`);
    }
    if (!store || typeof store !== "object" || Array.isArray(store) || store.version !== 1 || !Array.isArray(store.entries))
      throw new Error(`${path} is not a version 1 always store`);
    return store;
  }

  // One write at a time, a fresh read before each change, and rename() so a reader
  // never sees half a file -- mergeSettings' rules (#103).
  let queue = Promise.resolve();
  let writes = 0;
  // The card's bridge and the companion's share the file: mkdir is the cross-process lock,
  // so a touch() in one can't write back an entry the other just forgot. A lock older than
  // 10s is a crashed writer's and is taken over.
  const lock = `${path}.lock`;
  async function locked(fn) {
    await mkdir(dirname(path), { recursive: true });
    for (let tries = 0; ; tries++) {
      try { await mkdir(lock); break; } catch (error) {
        if (error.code !== "EEXIST") throw error;
        const age = await stat(lock).then((s) => Date.now() - s.mtimeMs, () => 0);
        if (age > 10000) { await rmdir(lock).catch(() => {}); continue; }
        if (tries >= 100) throw new Error(`${path} is locked by another nixi`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    }
    try { return await fn(); } finally { await rmdir(lock).catch(() => {}); }
  }
  function change(edit) {
    const run = queue.then(() => locked(async () => {
      const store = await load();
      const result = edit(store);
      if (!result) return result;           // nothing changed: no write that could undo another's
      const tmp = `${path}.tmp-${process.pid}-${++writes}`;
      try {
        await writeFile(tmp, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
        await rename(tmp, path);
      } catch (error) {
        await rm(tmp, { force: true });
        throw error;
      }
      return result;
    }));
    queue = run.catch(() => {});
    return run;
  }

  // Reads wait for queued writes: a yes recorded a moment ago must already match.
  const settled = async () => { await queue; return load(); };
  const mine = (agent, cwd) => (entry) => entry.agent === agent && entry.cwd === cwd;
  const list = async (agent, cwd) => (await settled()).entries.filter(mine(agent, cwd))
    .map((entry, i) => ({ n: i + 1, command: entry.command, added: entry.added, lastUsed: entry.lastUsed }));
  // Removes the n-th of this agent's and folder's entries, as list() numbers them.
  const drop = (agent, cwd, keep) => (store) => {
    let i = 0;
    const before = store.entries.length;
    store.entries = store.entries.filter((entry) => !mine(agent, cwd)(entry) || keep(++i));
    return before - store.entries.length;
  };

  return {
    load,
    list,
    match: async (agent, cwd, command) => (await settled()).entries.some((entry) => mine(agent, cwd)(entry) && entry.command === command),
    record: (agent, cwd, command) => change((store) => {
      if (store.entries.some((entry) => mine(agent, cwd)(entry) && entry.command === command)) return false;
      const now = new Date().toISOString();
      store.entries.push({ agent, cwd, command, added: now, lastUsed: now });
      return true;
    }),
    touch: (agent, cwd, command) => change((store) => {
      const entry = store.entries.find((e) => mine(agent, cwd)(e) && e.command === command);
      if (entry) entry.lastUsed = new Date().toISOString();
      return Boolean(entry);
    }),
    forget: (agent, cwd, n) => change(drop(agent, cwd, (i) => i !== n)),
    clear: (agent, cwd) => change(drop(agent, cwd, () => false)),
  };
}
