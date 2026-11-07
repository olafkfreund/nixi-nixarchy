import { test } from "node:test";
import assert from "node:assert/strict";
import { isHerdrWrite, herdrWriteDetail, isGogSend, isClickOnly, gogSendDetail } from "./send-policy.js";

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
  assert.deepEqual(herdrWriteDetail(call(["herdr", "agent", "prompt", "p1", "hi there"])),
    { pane: "p1", text: "hi there" });
  assert.equal(herdrWriteDetail(call("ls")), null);
});

test("gog sends need a click, as strings and argv", () => {
  const sends = [
    "gog send", "gog gmail send-later x", "gog --gmail-no-send gmail list", "gog gmail send", "gog mail send", "gog gmail reply",
    "gog gmail reply-all", "gog gmail replyall", "gog gmail forward",
    "gog gmail fwd", "gog gmail autoreply", "gog gmail drafts send",
    "gog gmail drafts post", "gog chat messages send", "gog chat messages create",
    "gog chat messages post", "gog api gmail users messages send",
    'g""og gmail send', "g\\og gmail send",
    "gog gmail drafts create x; gog gmail send y", "g\\\nog gmail send",
  ];
  const reads = [
    "gog gmail list", "gog gmail search x", "gog chat spaces list",
    "gog gmail drafts create", "gog gmail drafts reply",
    "gog gmail drafts forward", "gog gmail drafts update",
    "blog send", "echo gogs",
  ];
  for (const command of sends) for (const value of [command, command.split(" ")]) {
    assert.ok(isGogSend(call(value)), JSON.stringify(value));
    assert.ok(isClickOnly(call(value)), JSON.stringify(value));
  }
  for (const command of reads) for (const value of [command, command.split(" ")]) {
    assert.ok(!isGogSend(call(value)), JSON.stringify(value));
    assert.ok(!isClickOnly(call(value)), JSON.stringify(value));
  }
  assert.ok(isClickOnly(call("herdr agent prompt 1-2 hi")));
  assert.ok(!isGogSend(call("herdr agent prompt 1-2 hi")));
  assert.ok(!isClickOnly(undefined));
});

test("gog audit detail reads only fixed command and recipient places", () => {
  assert.deepEqual(gogSendDetail(call("gog gmail send --to a@b")),
    { kind: "gog", command: "gmail send", to: "a@b" });
  assert.deepEqual(gogSendDetail(call(["gog", "gmail", "send", "--to=a@b"])),
    { kind: "gog", command: "gmail send", to: "a@b" });
  assert.deepEqual(gogSendDetail(call("gog gmail reply 123")),
    { kind: "gog", command: "gmail reply", to: "123" });
  for (const command of [["gog", "gmail", "send", "--to", "a@b", "--body", "--bcc=private body"],
    ["gog", "gmail", "send", "--to", "a@b", "--body", "--to=confidential"],
    ["gog", "gmail", "send", "--to", "a@b", "--subject", "--cc", "secret"],
    ["gog", "gmail", "send", "--to=private words here"]]) {
    const detail = gogSendDetail(call(command));
    assert.ok(!/private|confidential|secret/.test(JSON.stringify(detail)), command.join(" "));
  }
  assert.deepEqual(gogSendDetail(call("gog gmail reply --body x 123")),
    { kind: "gog", command: "gmail reply", to: "" });
  assert.deepEqual(gogSendDetail(call("gog calendar create x")),
    { kind: "gog", command: "unknown", to: "" });
  assert.deepEqual(gogSendDetail(call("gog gmail send --body x")),
    { kind: "gog", command: "gmail send", to: "" });
  assert.deepEqual(gogSendDetail(call('gog gmail reply "secret-body send"')),
    { kind: "gog", command: "gmail reply", to: "" });
  assert.deepEqual(gogSendDetail(call("echo gog gmail send --to a@b")),
    { kind: "gog", command: "gmail send", to: "a@b" });
  for (const flag of ["--body", "--body=secret-body", "--body-html", "--body-file", "--raw-file", "--subject"]) {
    const command = `gog gmail send --to a@b ${flag} "secret-body send"`;
    const detail = gogSendDetail(call(command));
    assert.deepEqual(detail, { kind: "gog", command: "gmail send", to: "a@b" }, flag);
    assert.ok(!JSON.stringify(detail).includes("secret-body"), flag);
  }
});
