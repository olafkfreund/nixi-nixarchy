import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";

// files.js derives its search root from HOME at module load, so HOME is set
// before the import. The module's side effects are behind an isMain guard, so
// importing it neither scans the home directory nor reads stdin.
const sandbox = mkdtempSync(join(tmpdir(), "nixi-files-"));
const home = join(sandbox, "home");
process.env.HOME = home;
const { locatedUnderBase, filePattern } = await import("./files.js");

const put = (relative, content = "x") => {
  const path = join(home, relative);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, content);
  return path;
};

// ---- locatedUnderBase: the $HOME boundary -------------------------------
// plocate answers from a database that can be stale, can be shared, and is not
// scoped to this user's home. Everything it returns is untrusted until this
// function has checked it.

test("locatedUnderBase keeps a real file inside the home directory", () => {
  const kept = put("Documents/report.txt");
  assert.deepEqual(locatedUnderBase(kept, false), [kept]);
});

test("locatedUnderBase drops a path outside the home directory", () => {
  mkdirSync(home, { recursive: true });
  const outside = join(sandbox, "outside.txt");
  writeFileSync(outside, "x");
  assert.deepEqual(locatedUnderBase(`${outside}\n/etc/passwd`, false), []);
});

test("locatedUnderBase is not fooled by a sibling sharing the home prefix", () => {
  // `${home}-evil` starts with the home path as a string but is not inside it.
  const evil = `${home}-evil`;
  mkdirSync(evil, { recursive: true });
  const path = join(evil, "stolen.txt");
  writeFileSync(path, "x");
  assert.deepEqual(locatedUnderBase(path, false), []);
});

test("locatedUnderBase drops node_modules and cache trees", () => {
  const modulePath = put("Projects/app/node_modules/left-pad/index.js");
  const cachePath = put(".cache/thumbnails/a.png");
  assert.deepEqual(locatedUnderBase(`${modulePath}\n${cachePath}`, false), []);
});

test("locatedUnderBase drops a path the stale database still lists", () => {
  assert.deepEqual(locatedUnderBase(join(home, "Documents/deleted.txt"), false), []);
});

test("locatedUnderBase distinguishes files from directories", () => {
  const filePath = put("Documents/notes.md");
  const dirPath = join(home, "Documents");
  assert.deepEqual(locatedUnderBase(`${filePath}\n${dirPath}`, false), [filePath]);
  assert.deepEqual(locatedUnderBase(`${filePath}\n${dirPath}`, true), [dirPath]);
});

// ---- filePattern: what reaches fd ---------------------------------------

test("filePattern joins the query's terms so fd matches them in order", () => {
  assert.equal(filePattern("files js"), "files.*js");
  assert.equal(filePattern("  a   b  c "), "a.*b.*c");
});

test("filePattern keeps the characters a filename is actually made of", () => {
  assert.equal(filePattern(".png"), ".png");
  assert.equal(filePattern("my_file-2.tar.gz"), "my_file-2.tar.gz");
});

test("filePattern strips regex and shell metacharacters", () => {
  // `.*` survives only where this function puts it: between terms.
  assert.equal(filePattern("a.*b"), "a.b");
  assert.equal(filePattern("$(id) `id` ;rm -rf /"), "id.*id.*rm.*-rf");
  assert.equal(filePattern("^(a|b)+$"), "ab");
});

test("filePattern yields nothing for a query with no usable characters", () => {
  assert.equal(filePattern("$(&)"), "");
  assert.equal(filePattern("   "), "");
});

// ---- end to end ----------------------------------------------------------
// files.js as MenuSearch.qml runs it: `node files.js`, one JSON line in, a
// progressive stream of JSON lines out. plocate and fd are stubs on PATH.

function stubbedSearch(query) {
  const stubHome = mkdtempSync(join(tmpdir(), "nixi-e2e-"));
  const bin = join(stubHome, "bin");
  mkdirSync(bin, { recursive: true });
  mkdirSync(join(stubHome, "Documents"), { recursive: true });
  writeFileSync(join(stubHome, "Documents", "report-hit.txt"), "x");
  writeFileSync(join(stubHome, "zz-global-hit.txt"), "x");

  // A path under Documents/ is only ever returned to the root-restricted
  // query, so it can reach the rows first only if that query is really made.
  // The /etc path is the stale-database case the boundary must reject.
  const stub = (name, body) => {
    const path = join(bin, name);
    writeFileSync(path, `#!/bin/sh\n${body}\n`);
    chmodSync(path, 0o755);
  };
  stub("plocate", `
for a in "$@"; do
  case "$a" in */Documents/) echo "${stubHome}/Documents/report-hit.txt"; exit 0;; esac
done
echo "/etc/shadow"
echo "${stubHome}/zz-global-hit.txt"`);
  stub("fd", "exit 0");

  return new Promise((resolve) => {
    const child = spawn(process.execPath, [new URL("files.js", import.meta.url).pathname], {
      env: { ...process.env, HOME: stubHome, PATH: `${bin}:${process.env.PATH}` },
      stdio: ["pipe", "pipe", "inherit"],
    });
    let last = null;
    let timer = null;
    createInterface({ input: child.stdout }).on("line", (line) => {
      const message = JSON.parse(line);
      if (message.repoOnly) return;
      last = message;
      clearTimeout(timer);
      // Rows arrive in stages 35 ms apart; settle on the last one.
      timer = setTimeout(() => { child.kill("SIGTERM"); resolve(last); }, 400);
    });
    child.stdin.write(`${JSON.stringify({ id: 7, query })}\n`);
  });
}

test("the plocate fallback returns usable rows, priority roots first", async () => {
  const result = await stubbedSearch("hit");
  assert.equal(result.id, 7);
  assert.deepEqual(result.rows.map((row) => row.relativePath),
    ["Documents/report-hit.txt", "zz-global-hit.txt"]);
  for (const row of result.rows) {
    assert.equal(typeof row.name, "string");
    assert.ok(row.name.length > 0);
    assert.ok(row.path.startsWith("/"), `${row.path} is not absolute`);
    assert.ok(row.path.endsWith(row.relativePath));
  }
  assert.equal(result.totalMatched, 2);
  assert.equal(result.capped, false);
  assert.equal(result.complete, true);
});

test("a stale database entry outside the home directory never reaches a row", async () => {
  const result = await stubbedSearch("hit");
  assert.ok(!result.rows.some((row) => row.path === "/etc/shadow"),
    "plocate's out-of-home answer was served to the launcher");
});
