// Backup, check and undo for files the agent edits in Mechanic (#90). The agent
// writes the file itself, after the bridge answers its permission request, so
// the bridge copies the file first and the agent cannot skip it. One directory
// per turn under stateDir holds the copies and a manifest.json; /undo restores
// the newest turn not yet undone. Shell edits are not covered (generations
// already undo those).
import { mkdir, readFile, readdir, rename, writeFile, lstat, realpath, rm } from "node:fs/promises";
import { basename, dirname, join, resolve, sep } from "node:path";
import { createHash, randomBytes } from "node:crypto";

const MAX_BYTES = 1024 * 1024;
const KEEP_TURNS = 20;

// Home-manager links and store files are read-only and managed elsewhere.
export const isStorePath = (real) => real === "/nix/store" || real.startsWith("/nix/store/");

// Paths are agent-supplied (#42), and notices render as markdown: show them as
// a code span that cannot be closed early.
const show = (path) => "`" + String(path).replace(/[`\r\n]/g, "") + "`";

// A file that only moved lines is the same error: "x.lua:42: bad" == "x.lua:44: bad".
const sameKind = (line) => line.replace(/:\d+/g, ":N").replace(/line \d+/gi, "line N");

const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Current state of a path: sha256, null if missing, "symlink" for a link (never
// followed, so it never matches a recorded hash).
async function hashOf(path) {
  let info;
  try { info = await lstat(path); }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
  if (info.isSymbolicLink()) return "symlink";
  return sha(await readFile(path));
}

// `wx` temp in the target's own directory, then rename: never writes through a
// symlink and never leaves a half-written file.
async function writeAtomic(path, bytes, mode) {
  const temp = join(dirname(path), `.${basename(path)}.${randomBytes(8).toString("hex")}.tmp`);
  await writeFile(temp, bytes, { mode, flag: "wx" });
  await rename(temp, path);
}

export function createChanges({ stateDir, cwd, home, exec }) {
  const hyprDir = join(home, ".config", "hypr") + sep;
  let turn = null; // { dir, entries, baseline }
  let seq = 0;
  let chain = Promise.resolve();
  // Permission answers can arrive together (allow all pending): one at a time.
  const serial = (fn) => {
    const run = chain.then(fn);
    chain = run.catch(() => {});
    return run;
  };

  const isHypr = (path) => path.startsWith(hyprDir);
  const saveManifest = (t) =>
    writeAtomic(join(t.dir, "manifest.json"), JSON.stringify({ entries: t.entries }, null, 2), 0o600);

  async function errorLines() {
    const result = await exec(["configerrors"]);
    if (!result.ok) return null;
    return new Set(result.stdout.split("\n").map((l) => l.trim()).filter(Boolean));
  }

  async function rotate() {
    const names = (await readdir(stateDir)).filter((n) => /^\d+-\d+$/.test(n)).sort();
    for (const name of names.slice(0, Math.max(0, names.length - KEEP_TURNS))) {
      await rm(join(stateDir, name), { recursive: true, force: true });
    }
  }

  async function openTurn() {
    await mkdir(stateDir, { recursive: true, mode: 0o700 });
    const name = `${String(Date.now()).padStart(15, "0")}-${String(seq++).padStart(4, "0")}`;
    const dir = join(stateDir, name);
    await mkdir(dir, { mode: 0o700 });
    turn = { dir, entries: [], baseline: undefined };
    await rotate();
  }

  // Returns a notice, or null when the file is now backed up.
  async function backupOne(path, toolCallId) {
    const existing = turn?.entries.find((e) => e.path === path);
    if (existing) { // second edit of one file in a turn: keep the first backup
      existing.ids.push(toolCallId);
      return null;
    }
    let info = null;
    try { info = await lstat(path); }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (info) {
      if (info.isSymbolicLink() || isStorePath(await realpath(path))) {
        return `Not backed up: ${show(path)} is managed by home-manager.`;
      }
      if (!info.isFile()) return `Not backed up: ${show(path)} is not a regular file.`;
      if (info.size > MAX_BYTES) return `Not backed up: ${show(path)} is over 1 MiB.`;
    } else if (isStorePath(await realpath(dirname(path)).catch(() => path))) {
      return `Not backed up: ${show(path)} is managed by home-manager.`;
    }
    if (!turn) await openTurn();
    if (isHypr(path) && turn.baseline === undefined) turn.baseline = await errorLines();
    const entry = { path, existed: !!info, before: null, after: undefined, backup: null, mode: null, ids: [toolCallId] };
    if (info) {
      const bytes = await readFile(path);
      entry.before = sha(bytes);
      entry.mode = info.mode & 0o777;
      entry.backup = `${turn.entries.length}-${basename(path)}`;
      await writeAtomic(join(turn.dir, entry.backup), bytes, 0o600);
    }
    turn.entries.push(entry);
    await saveManifest(turn);
    return null;
  }

  // Put one entry's file back as it was. The caller has checked it is safe.
  async function restore(entry, dir) {
    if (!entry.existed) { await rm(entry.path, { force: true }); return; }
    await writeAtomic(entry.path, await readFile(join(dir, entry.backup)), entry.mode);
  }

  async function reloadHypr() {
    return (await exec(["reload"])).ok;
  }

  return {
    backup: (toolCall) => serial(async () => {
      const notices = [];
      let named = 0;
      for (const location of toolCall?.locations || []) {
        if (typeof location?.path !== "string" || !location.path) continue;
        named++;
        const path = resolve(cwd, location.path);
        try {
          const notice = await backupOne(path, toolCall.toolCallId);
          if (notice) notices.push(notice);
        } catch (error) {
          notices.push(`Not backed up: ${show(path)} (${show(error.code || error.message)}).`);
        }
      }
      if (!named) notices.push("Not backed up: the agent named no file.");
      return notices;
    }),

    completed: (toolCallId) => serial(async () => {
      if (turn) {
        const hit = turn.entries.filter((e) => e.ids.includes(toolCallId));
        if (!hit.length) return;
        for (const entry of hit) entry.after = await hashOf(entry.path);
        await saveManifest(turn);
        return;
      }
      // Arrived after the turn closed (a late update): the newest manifest on disk.
      const [name] = (await readdir(stateDir).catch(() => [])).filter((n) => /^\d+-\d+$/.test(n)).sort().reverse();
      if (!name) return;
      const dir = join(stateDir, name);
      const manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8"));
      const hit = manifest.entries.filter((e) => e.ids?.includes(toolCallId));
      if (!hit.length) return;
      for (const entry of hit) entry.after = await hashOf(entry.path);
      await writeAtomic(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), 0o600);
    }),

    endTurn: () => serial(async () => {
      const done = turn;
      turn = null;
      const hypr = done?.entries.filter((e) => isHypr(e.path)) || [];
      if (!hypr.length) return [];
      try {
        const reloaded = await reloadHypr();
        const now = reloaded ? await errorLines() : null;
        if (!now || !done.baseline) {
          return ["The Hyprland change could not be checked (hyprctl failed); nothing was restored."];
        }
        const known = new Set([...done.baseline].map(sameKind));
        const fresh = [...now].filter((line) => !known.has(sameKind(line)));
        if (!fresh.length) return [];
        const restored = [];
        const unverified = [];
        const failed = [];
        try {
          for (const entry of hypr) {
            try {
              const current = await hashOf(entry.path);
              if (entry.after !== undefined) {
                // Someone changed it since the agent wrote it: leave it.
                if (current !== entry.after) continue;
              } else {
                // No completion seen: nothing to restore if it is untouched.
                if (current === entry.before) continue;
                unverified.push(show(entry.path));
              }
              await restore(entry, done.dir);
              entry.restored = true;
              restored.push(show(entry.path));
            } catch (error) {
              failed.push(`${show(entry.path)} (${show(error.code || error.message)})`);
            }
          }
        } finally {
          await saveManifest(done);
        }
        await reloadHypr();
        return [`Hyprland reported an error: ${show(fresh.join("; "))}. ` +
          `Nixi restored ${restored.join(", ") || "nothing"}` +
          (unverified.length ? ` (the edit to ${unverified.join(", ")} could not be verified)` : "") +
          (failed.length ? `; could not restore ${failed.join(", ")}` : "") + "."];
      } catch (error) {
        return [`The Hyprland change could not be checked (${show(error.code || error.message)}).`];
      }
    }),

    undo: () => serial(async () => {
      try {
        await mkdir(stateDir, { recursive: true, mode: 0o700 });
        const names = (await readdir(stateDir)).filter((n) => /^\d+-\d+$/.test(n)).sort().reverse();
        for (const name of names) {
          const dir = join(stateDir, name);
          let manifest;
          try { manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")); }
          catch { continue; }
          const todo = manifest.entries.filter((e) => !e.restored);
          if (!todo.length) continue;
          // All or nothing: refuse if anything changed since the agent's edit.
          for (const entry of todo) {
            const expected = entry.after !== undefined ? entry.after : entry.before;
            if ((await hashOf(entry.path)) !== expected) {
              return { ok: false, message: `Not undone: ${show(entry.path)} changed since Nixi's edit. Nothing was restored.` };
            }
          }
          // Not atomic once writing starts: record each file as it is restored, so a
          // failure part-way never leaves this turn blocking the older ones.
          const done = [];
          let failure = null;
          try {
            for (const entry of todo) {
              try { await restore(entry, dir); }
              catch (error) { failure = `${show(entry.path)} (${show(error.code || error.message)})`; break; }
              entry.restored = true;
              done.push(entry);
            }
          } finally {
            await writeAtomic(join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), 0o600);
          }
          const reloadFailed = done.some((e) => isHypr(e.path)) && !(await reloadHypr());
          const names = done.map((e) => show(e.path)).join(", ") || "nothing";
          return {
            ok: !failure,
            message: (failure ? `Undo stopped: restored ${names}; could not restore ${failure}.` : `Undone: restored ${names}.`) +
              (reloadFailed ? " Hyprland could not be reloaded." : ""),
          };
        }
        return { ok: false, message: "Nothing to undo." };
      } catch (error) {
        return { ok: false, message: `Undo failed (${show(error.code || error.message)}).` };
      }
    }),
  };
}
