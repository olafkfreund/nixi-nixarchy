import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createChanges, isStorePath } from "./changes.js";

// A temp HOME with a Hyprland dir; `errors` is what the stub hyprctl reports.
async function setup(errors = () => "") {
  const home = await mkdtemp(join(tmpdir(), "nixi-changes-"));
  await mkdir(join(home, ".config", "hypr"), { recursive: true });
  const calls = [];
  let broken = false;
  const exec = async (args) => {
    calls.push(args[0]);
    if (broken) return { ok: false, stdout: "" };
    return { ok: true, stdout: args[0] === "configerrors" ? errors() : "" };
  };
  const stateDir = join(home, "state", "changes");
  const changes = createChanges({ stateDir, cwd: home, home, exec });
  return { home, stateDir, changes, calls, breakExec: () => { broken = true; } };
}

const call = (id, ...paths) => ({ toolCallId: id, kind: "edit", locations: paths.map((path) => ({ path })) });

test("the backup exists, privately, before backup() resolves", async () => {
  const { home, stateDir, changes } = await setup();
  const file = join(home, "a.txt");
  await writeFile(file, "old\n");
  assert.deepEqual(await changes.backup(call("t1", file)), []);
  const [turn] = await readdir(stateDir);
  const files = await readdir(join(stateDir, turn));
  const copy = files.find((name) => name !== "manifest.json");
  assert.equal(await readFile(join(stateDir, turn, copy), "utf8"), "old\n");
  assert.equal((await stat(stateDir)).mode & 0o777, 0o700);
  assert.equal((await stat(join(stateDir, turn))).mode & 0o777, 0o700);
  assert.equal((await stat(join(stateDir, turn, copy))).mode & 0o777, 0o600);
  assert.equal((await stat(join(stateDir, turn, "manifest.json"))).mode & 0o777, 0o600);
});

test("a relative path resolves against cwd", async () => {
  const { home, changes } = await setup();
  await writeFile(join(home, "rel.txt"), "old\n");
  await changes.backup(call("t1", "rel.txt"));
  await writeFile(join(home, "rel.txt"), "new\n");
  await changes.completed("t1");
  assert.equal((await changes.undo()).ok, true);
  assert.equal(await readFile(join(home, "rel.txt"), "utf8"), "old\n");
});

test("a missing file round-trips: undo deletes what the agent created", async () => {
  const { home, changes } = await setup();
  const file = join(home, "new.txt");
  await changes.backup(call("t1", file));
  await writeFile(file, "created\n");
  await changes.completed("t1");
  assert.equal((await changes.undo()).ok, true);
  await assert.rejects(stat(file), { code: "ENOENT" });
});

test("a symlink is skipped with a notice, and a store path is recognised", async () => {
  const { home, stateDir, changes } = await setup();
  await writeFile(join(home, "target"), "x");
  await symlink(join(home, "target"), join(home, "link"));
  const notices = await changes.backup(call("t1", join(home, "link")));
  assert.match(notices[0], /not backed up.*managed by home-manager/i);
  await assert.rejects(readdir(stateDir), { code: "ENOENT" });
  assert.equal(isStorePath("/nix/store/abc-x/file"), true);
  assert.equal(isStorePath("/nix/storefront/x"), false);
  assert.equal(isStorePath("/home/u/file"), false);
});

test("a file over 1 MiB is skipped with a notice", async () => {
  const { home, changes } = await setup();
  const file = join(home, "big");
  await writeFile(file, Buffer.alloc(1024 * 1024 + 1));
  const notices = await changes.backup(call("t1", file));
  assert.match(notices[0], /over 1 MiB/);
});

test("the newest 20 turns are kept", async () => {
  const { home, stateDir, changes } = await setup();
  const file = join(home, "a.txt");
  await writeFile(file, "x");
  for (let i = 0; i < 25; i++) {
    await changes.backup(call(`t${i}`, file));
    await changes.endTurn();
  }
  assert.equal((await readdir(stateDir)).length, 20);
});

test("undo refuses when one of two files changed, and restores neither", async () => {
  const { home, changes } = await setup();
  const a = join(home, "a.txt");
  const b = join(home, "b.txt");
  await writeFile(a, "a0");
  await writeFile(b, "b0");
  await changes.backup(call("t1", a, b));
  await writeFile(a, "a1");
  await writeFile(b, "b1");
  await changes.completed("t1");
  await writeFile(b, "by hand");
  const result = await changes.undo();
  assert.equal(result.ok, false);
  assert.match(result.message, /b\.txt/);
  assert.equal(await readFile(a, "utf8"), "a1");
  assert.equal(await readFile(b, "utf8"), "by hand");
});

test("undo after a completed edit restores the bytes, once", async () => {
  const { home, changes } = await setup();
  const file = join(home, "a.txt");
  await writeFile(file, "old\n");
  await changes.backup(call("t1", file));
  await writeFile(file, "new\n");
  await changes.completed("t1");
  assert.equal((await changes.undo()).ok, true);
  assert.equal(await readFile(file, "utf8"), "old\n");
  assert.equal((await changes.undo()).message, "Nothing to undo.");
});

test("endTurn: errors that are new restore the file and say so", async () => {
  let errors = "";
  const { home, changes, calls } = await setup(() => errors);
  const file = join(home, ".config", "hypr", "bindings.lua");
  await writeFile(file, "old\n");
  await changes.backup(call("t1", file));
  await writeFile(file, "BROKEN\n");
  await changes.completed("t1");
  errors = "error: bad bind";
  const [notice, ...rest] = await changes.endTurn();
  assert.equal(rest.length, 0);
  assert.match(notice, /bindings\.lua/);
  assert.match(notice, /bad bind/);
  assert.equal(await readFile(file, "utf8"), "old\n");
  assert.ok(calls.includes("reload"));
  assert.equal((await changes.undo()).message, "Nothing to undo.");
});

test("endTurn: errors already in the baseline leave the file alone", async () => {
  const { home, changes } = await setup(() => "error: old problem");
  const file = join(home, ".config", "hypr", "bindings.lua");
  await writeFile(file, "old\n");
  await changes.backup(call("t1", file));
  await writeFile(file, "good\n");
  assert.deepEqual(await changes.endTurn(), []);
  assert.equal(await readFile(file, "utf8"), "good\n");
});

test("endTurn: a failing hyprctl says it could not check, and restores nothing", async () => {
  const { home, changes, breakExec } = await setup();
  const file = join(home, ".config", "hypr", "bindings.lua");
  await writeFile(file, "old\n");
  await changes.backup(call("t1", file));
  await writeFile(file, "BROKEN\n");
  breakExec();
  const [notice] = await changes.endTurn();
  assert.match(notice, /could not be checked/);
  assert.equal(await readFile(file, "utf8"), "BROKEN\n");
});

test("endTurn: a turn that touched no Hyprland file never calls hyprctl", async () => {
  const { home, changes, calls } = await setup();
  const file = join(home, "a.txt");
  await writeFile(file, "x");
  await changes.backup(call("t1", file));
  assert.deepEqual(await changes.endTurn(), []);
  assert.deepEqual(calls, []);
});
