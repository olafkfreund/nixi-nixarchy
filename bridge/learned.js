// The learned-fact broker, moved from nixi-server. The tutor ends an answer
// with `LEARNED: <one sentence>` lines when the user corrects it. The bridge
// hides those lines from the card and appends them to LEARNED.md, which
// nixi-context searches.
//
// The bridge writes the file rather than the agent -- but that is about who
// holds the pen, not about whose machine is written to, so it does NOT make
// this safe in Guide. Guide promises nothing on your machine changes, and a
// file that steers every later session is the most consequential kind of
// change to make invisibly. bridge.js skips the append in Guide (#51).
import { mkdir, readFile, rename, writeFile, lstat } from "node:fs/promises";
import { join } from "node:path";
import { randomBytes } from "node:crypto";

const MARK = "LEARNED:";
const MAX_FACTS = 5;
const MAX_FACT = 300;
const MAX_FILE = 262144;
const KEEP_TAIL = 200000;

// Streams text through, holding back only a line that could still turn out to
// be a LEARNED line, so the card sees ordinary text as soon as it arrives.
export function createLearnedFilter() {
  let pending = "";
  const facts = [];

  function couldBeMark(line) {
    const start = line.trimStart();
    return start.length < MARK.length ? MARK.startsWith(start) : start.startsWith(MARK);
  }

  function take(line) {
    const start = line.trimStart();
    if (!start.startsWith(MARK)) return line;
    const fact = start.slice(MARK.length).trim().slice(0, MAX_FACT);
    if (fact) facts.push(fact);
    return null;
  }

  return {
    push(text) {
      pending += text;
      let visible = "";
      let index;
      while ((index = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, index);
        pending = pending.slice(index + 1);
        const kept = take(line);
        if (kept !== null) visible += kept + "\n";
      }
      if (pending && !couldBeMark(pending)) {
        visible += pending;
        pending = "";
      }
      return visible;
    },
    flush() {
      const kept = pending ? take(pending) : null;
      pending = "";
      return { visible: kept || "", facts: facts.splice(0) };
    },
  };
}

// Bounded, private, atomic append -- the same limits nixi-server used.
export async function appendLearned(facts, dataDir, now = new Date()) {
  if (!facts.length) return;
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  const path = join(dataDir, "LEARNED.md");
  try {
    if ((await lstat(path)).isSymbolicLink()) return;
  } catch {}
  let current;
  try { current = await readFile(path, "utf8"); }
  catch { current = "# Learned on this machine\n"; }
  const day = now.toISOString().slice(0, 10);
  current += facts.slice(0, MAX_FACTS).map((fact) => `- ${day}: ${fact}\n`).join("");
  if (current.length > MAX_FILE) current = current.slice(-KEEP_TAIL);
  const temp = join(dataDir, `.LEARNED.md.${randomBytes(8).toString("hex")}.tmp`);
  await writeFile(temp, current, { mode: 0o600, flag: "wx" });
  await rename(temp, path);
}
