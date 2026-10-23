import { test } from "node:test";
import assert from "node:assert/strict";
import { isHerdrWrite, herdrWriteDetail } from "./herdr-policy.js";

const call = (command) => ({ rawInput: { command } });

test("herdr writes are detected (#95)", () => {
  for (const command of [
    'herdr agent prompt 1-2 "hi"',
    "herdr --session main agent send-keys 1-2 Enter",
    '/nix/store/abc-herdr/bin/herdr pane send-text 1-2 "x"',
    "herdr pane send-keys 1-2 Enter",
    'cd x && herdr agent prompt 1-2 "hi"',
    'ls\nherdr agent prompt 1-2 "hi"',
    'env X=1 herdr agent prompt 1-2 "hi"',
    'sudo herdr agent prompt 1-2 "hi"',
    'timeout 5 herdr agent prompt 1-2 "hi"',
    'nohup herdr agent prompt 1-2 "hi"',
    `bash -c "herdr agent prompt 1-2 'hi'"`,
    'echo $(herdr agent prompt 1-2 "hi")',
    'echo `herdr agent prompt 1-2 "hi"`',
    'echo herdr agent prompt 1-2 "hi"',
  ]) assert.ok(isHerdrWrite(call(command)), command);
});

test("reads and other tools are not herdr writes; an echo of one is an accepted false positive (#95)", () => {
  for (const command of [
    "herdr agent read 1-2 --source recent",
    "herdr agent list",
  ]) assert.ok(!isHerdrWrite(call(command)), command);
  assert.ok(!isHerdrWrite({ rawInput: { file_path: "/x" } }));
  assert.ok(!isHerdrWrite(undefined));
});

test("the audit detail is the pane and the text (#95)", () => {
  assert.deepEqual(herdrWriteDetail(call('herdr --session s agent prompt 1-2 "do it"')),
    { pane: "1-2", text: '"do it"' });
  assert.equal(herdrWriteDetail(call("ls")), null);
});
