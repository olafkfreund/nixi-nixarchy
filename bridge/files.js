#!/usr/bin/env node

import { createInterface } from "node:readline";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const home = process.env.HOME || process.cwd();
// `@` is a general file finder, so its scope is the whole home directory.
// plocate, the fd scan and repository discovery all use exactly the same root
// so results never change scope between them.
const basePath = resolve(home);
const searchRoots = [basePath];
const existingRoots = (names) => names.map((name) => join(basePath, name)).filter((path) => existsSync(path));
const priorityFileRoots = existingRoots(["Downloads", "Documents", "Desktop", "Projects", "Work"]);
const settingsPath = join(process.env.XDG_CONFIG_HOME || join(home, ".config"), "omarchy", "nixi.json");
let configuredRepoDepth = 6;
try {
  const settings = JSON.parse(readFileSync(settingsPath, "utf8"));
  if (settings.repoSearchDepth !== undefined)
    configuredRepoDepth = Number(settings.repoSearchDepth);
} catch {}
// Zero means unlimited. Bound positive values to keep accidental settings
// from generating nonsensical fd arguments.
const repoSearchDepth = Number.isFinite(configuredRepoDepth)
  ? (configuredRepoDepth <= 0 ? 0 : Math.max(1, Math.min(128, Math.round(configuredRepoDepth))))
  : 6;
let repos = [];
let reposReady = false;
let latestRequestId = 0;
let pendingSearchTimer = null;
let activeSearchController = null;
let progressiveTimers = [];
let latestRepoQuery = "";
const execFileAsync = promisify(execFile);
process.stdout.on("error", (error) => {
  if (error.code === "EPIPE") process.exit(0);
  throw error;
});

function setRepos(paths) {
  repos = Array.from(new Set(repos.concat(
    paths.filter(Boolean).map((path) => dirname(resolve(path)))
  )));
  emitCurrentRepos();
}

// fd once per root, run together; a root that fails or times out adds nothing.
async function fdLines(args, roots, timeout, signal) {
  const outputs = await Promise.all(roots.map((root) => execFileAsync("fd", [...args, root],
    { timeout, maxBuffer: 2 * 1024 * 1024, signal }).then((value) => value.stdout).catch(() => "")));
  return outputs.join("\n").split("\n").filter(Boolean);
}

// plocate's database can be stale: keep only paths that still exist, of the
// wanted kind, under the search root and outside caches.
function locatedUnderBase(output, isDirectory) {
  const basePrefix = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return output.split("\n").filter((path) => {
    if (!path.startsWith(basePrefix) || path.includes("/node_modules/")
        || path.includes("/.cache/")) return false;
    try {
      const stat = statSync(path);
      return isDirectory ? stat.isDirectory() : stat.isFile();
    } catch { return false; }
  });
}

function findRepoMarkers(roots, timeout) {
  const depthArgs = repoSearchDepth > 0 ? ["--max-depth", String(repoSearchDepth)] : [];
  return fdLines(["--hidden", "--no-ignore", ...depthArgs,
    "--exclude", ".cache", "--exclude", "node_modules", "^\\.git$"], roots, timeout);
}

async function discoverRepos() {
  try {
    const located = await execFileAsync("plocate", ["--regex", "/\\.git/?$"] , {
      timeout: 1200, maxBuffer: 4 * 1024 * 1024,
    }).then((value) => value.stdout).catch(() => "");
    const warm = locatedUnderBase(located, true);
    if (warm.length > 0) setRepos(warm);

    // Repositories people actively work in usually live in one of these
    // roots. Scan them first so a stale locate database does not make the
    // repo row wait behind caches and application data elsewhere in $HOME.
    const priorityRoots = existingRoots(["Projects", "Work", "Documents", "Desktop"]);
    if (priorityRoots.length > 0) setRepos(await findRepoMarkers(priorityRoots, 3000));

    const scanned = await findRepoMarkers(searchRoots, 15_000);
    if (scanned.length > 0) setRepos(scanned);
  } catch { repos = []; }
  reposReady = true;
  emitCurrentRepos();
}

function fuzzyScore(value, query) {
  const haystack = value.toLowerCase();
  const needle = query.toLowerCase().replace(/\s+/g, "");
  const compact = haystack.replace(/[^a-z0-9]/g, "");
  const exact = haystack.indexOf(query.toLowerCase());
  if (exact >= 0) return exact;
  let at = 0;
  for (let index = 0; index < compact.length && at < needle.length; index++)
    if (compact[index] === needle[at]) at++;
  return at === needle.length ? 100 + compact.length - needle.length : Infinity;
}

function repoResult(query) {
  const matches = repos.map((path) => ({ path, score: fuzzyScore(path, query) }))
    .filter((item) => Number.isFinite(item.score))
    .sort((a, b) => a.score - b.score);
  return {
    rows: matches.slice(0, 100).map((item) => ({
      name: basename(item.path), path: item.path,
    })),
    totalMatched: Math.min(matches.length, 100),
    capped: matches.length > 100,
  };
}

function emitCurrentRepos() {
  if (latestRequestId <= 0 || latestRepoQuery.length < 2) return;
  const result = repoResult(latestRepoQuery);
  emit({
    id: latestRequestId,
    query: latestRepoQuery,
    repoOnly: true,
    repos: result.rows,
    repoTotalMatched: result.totalMatched,
    repoCapped: result.capped,
    repoComplete: reposReady,
  });
}

function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}


function emitSearch(message, query, rows, totalMatched = rows.length, capped = false,
    complete = true) {
  if (Number(message.id) !== latestRequestId) return;
  emit({
    id: message.id,
    query,
    rows,
    totalMatched,
    capped,
    complete,
  });
}

function emitProgressively(message, query, result) {
  const rows = result.rows;
  if (rows.length === 0) {
    emitSearch(message, query, [], 0, false, result.complete !== false);
    return;
  }
  const stops = [1, 5, 10, 25, 50, 100].filter((count) => count < rows.length);
  stops.push(rows.length);
  stops.forEach((count, index) => progressiveTimers.push(setTimeout(() => {
    const final = count === rows.length;
    emitSearch(message, query, rows.slice(0, count),
      final ? result.totalMatched : count,
      final ? result.capped : false,
      final ? result.complete !== false : false);
  }, index * 35)));
}

// fd takes one regex, so the query's terms become `.*`-joined literals. Strip
// everything that is neither a path character nor a word character: a metachar
// reaching fd would be an injected pattern, not a search for that character.
function filePattern(query) {
  return query.trim().split(/\s+/).map((part) => part.replace(/[^A-Za-z0-9._-]/g, ""))
    .filter(Boolean).join(".*");
}

async function fallbackFiles(query, signal) {
  try {
    // plocate answers from an index, so it is the fast path. Its database can
    // be stale, so verify every result and fall through to fd when it has no
    // usable matches.
    const locate = (patterns) => execFileAsync("plocate",
      ["--ignore-case", "--limit", "300", ...patterns],
      { timeout: 1200, maxBuffer: 2 * 1024 * 1024, signal })
      .then((value) => value.stdout).catch(() => "");
    // plocate emits database (path-alphabetical) order, so `.agents/` and
    // `.claude/` exhaust the limit long before `Documents/` is reached. A path
    // must match every PATTERN, so an extra root pattern gives the user-facing
    // roots their own budget -- the same preference the fd scan below applies.
    const [priorityOutputs, located] = await Promise.all([
      Promise.all(priorityFileRoots.map((root) => locate([`${root}/`, query]))),
      locate([query]),
    ]);
    const locatedPaths = [...new Set([...priorityOutputs, located]
      .flatMap((output) => locatedUnderBase(output, false)))];
    if (locatedPaths.length > 0) return {
      rows: locatedPaths.slice(0, 100).map((path) => ({
        name: basename(path),
        relativePath: relative(home, path),
        path,
      })),
      totalMatched: Math.min(locatedPaths.length, 100),
      capped: locatedPaths.length > 100,
      complete: located.split("\n").filter(Boolean).length < 300,
    };

    const pattern = filePattern(query);
    if (!pattern) return { rows: [], totalMatched: 0, capped: false, complete: true };
    const scan = (roots, timeout) => fdLines(["--type", "f", "--hidden", "--ignore-case",
      "--max-results", "101", "--exclude", ".cache", "--exclude", "node_modules", pattern],
      roots, timeout, signal);
    // A whole-home traversal is not ordered by relevance and can spend its
    // entire timeout in large hidden trees before reaching Downloads. Search
    // normal user-facing roots first, then fall back to the complete scope.
    let found = await scan(priorityFileRoots, 3000);
    if (found.length === 0) found = await scan(searchRoots, 15_000);
    return { rows: found.slice(0, 100).map((path) => {
      const absolute = resolve(path);
      return {
        name: basename(absolute),
        relativePath: relative(home, absolute),
        path: absolute,
      };
    }), totalMatched: Math.min(found.length, 100), capped: found.length > 100,
    complete: found.length <= 100 };
  } catch { return { rows: [], totalMatched: 0, capped: false, complete: true }; }
}

async function search(message, signal) {
  const query = String(message.query || "").trim();
  if (query.length < 2) {
    emit({ id: message.id, query, rows: [], totalMatched: 0,
      capped: false, complete: true, repos: [] });
    return;
  }
  latestRepoQuery = query;
  emitCurrentRepos();
  emitProgressively(message, query, await fallbackFiles(query, signal));
}

// Only the launcher's `node files.js` scans the home directory and reads
// stdin; importing the module (the tests do) must do neither.
const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) discoverRepos();

const input = isMain ? createInterface({ input: process.stdin, crlfDelay: Infinity }) : null;
input?.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    latestRequestId = Number(message.id) || 0;
    latestRepoQuery = String(message.query || "").trim();
    emitCurrentRepos();
    cancelPending();
    pendingSearchTimer = setTimeout(() => {
      pendingSearchTimer = null;
      const controller = new AbortController();
      activeSearchController = controller;
      search(message, controller.signal).finally(() => {
        if (activeSearchController === controller) activeSearchController = null;
      });
    }, 80);
  } catch {}
});

// Stop the queued search, the one running, and any rows still to be shown.
function cancelPending() {
  if (pendingSearchTimer) clearTimeout(pendingSearchTimer);
  if (activeSearchController) activeSearchController.abort();
  for (const timer of progressiveTimers) clearTimeout(timer);
  progressiveTimers = [];
}

function shutdown() {
  cancelPending();
  process.exit(0);
}
if (isMain) {
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export { locatedUnderBase, filePattern };
