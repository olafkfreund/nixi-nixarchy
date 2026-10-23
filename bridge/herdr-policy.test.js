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
    // the bypass list from the #95 review: any mention counts
    '"herdr" agent prompt 1-2 hi', 'her""dr agent prompt 1-2 hi', 'h\\erdr agent prompt 1-2 hi',
    "her\\\ndr agent prompt 1-2 hi",
    "herdr --machine agent prompt 1-2 hi", "herdr --session=s agent prompt 1-2 hi",
    "herdr pane run 1-2 ls", "herdr agent start claude", "echo 1-2 | xargs herdr agent prompt",
    "cat <<EOF\nherdr agent prompt 1-2 hi\nEOF",
    `python3 -c "import subprocess; subprocess.run(['herdr','agent','prompt','1-2','x'])"`,
    "echo hi | socat - UNIX-CONNECT:$HERDR_SOCKET_PATH", "nc -U $HERDR_SOCKET_PATH",
  ]) assert.ok(isHerdrWrite(call(command)), command);
  assert.ok(isHerdrWrite({ rawInput: { command: ["herdr", "agent", "prompt", "1-2", "x"] } }));
});

test("commands that never mention herdr, and other tools, are not herdr writes (#95)", () => {
  for (const command of [
    "ls -la", "git status", "node --test", "echo hello",
  ]) assert.ok(!isHerdrWrite(call(command)), command);
  assert.ok(!isHerdrWrite({ rawInput: { file_path: "/x" } }));
  assert.ok(!isHerdrWrite(undefined));
});

test("the audit detail is the pane and the text (#95)", () => {
  assert.deepEqual(herdrWriteDetail(call('herdr --session s agent prompt 1-2 "do it"')),
    { pane: "1-2", text: '"do it"' });
  assert.equal(herdrWriteDetail(call("ls")), null);
});
