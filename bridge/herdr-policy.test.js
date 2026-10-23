import { test } from "node:test";
import assert from "node:assert/strict";
import { isHerdrWrite } from "./herdr-policy.js";

const call = (command) => ({ rawInput: { command } });

test("herdr writes are detected (#95)", () => {
  for (const command of [
    'herdr agent prompt 1-2 "hi"',
    "herdr --session main agent send-keys 1-2 Enter",
    '/nix/store/abc-herdr/bin/herdr pane send-text 1-2 "x"',
    "herdr pane send-keys 1-2 Enter",
    'cd x && herdr agent prompt 1-2 "hi"',
    'ls\nherdr agent prompt 1-2 "hi"',
  ]) assert.ok(isHerdrWrite(call(command)), command);
});

test("reads, lookalikes and other tools are not herdr writes (#95)", () => {
  for (const command of [
    "herdr agent read 1-2 --source recent",
    "herdr agent list",
    'echo herdr agent prompt 1-2 "hi"',
  ]) assert.ok(!isHerdrWrite(call(command)), command);
  assert.ok(!isHerdrWrite({ rawInput: { file_path: "/x" } }));
  assert.ok(!isHerdrWrite(undefined));
});
