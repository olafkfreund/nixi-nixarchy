import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, symlinkSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLearnedFilter, appendLearned } from "./learned.js";
import { runBridge } from "./testing/run-bridge.js";

function streamed(chunks) {
  const filter = createLearnedFilter();
  let visible = "";
  for (const chunk of chunks) visible += filter.push(chunk);
  const end = filter.flush();
  return { visible: visible + end.visible, facts: end.facts };
}

test("LEARNED lines never reach the card, however the stream is split", () => {
  const answer = "Use nixarchy apply.\nLEARNED: apps are queued in apps.nix\n";
  const whole = streamed([answer]);
  assert.equal(whole.visible, "Use nixarchy apply.\n");
  assert.deepEqual(whole.facts, ["apps are queued in apps.nix"]);
  // Every split point, including inside the marker itself.
  for (let i = 1; i < answer.length; i++) {
    const split = streamed([answer.slice(0, i), answer.slice(i)]);
    assert.equal(split.visible, whole.visible, `split at ${i}`);
    assert.deepEqual(split.facts, whole.facts, `split at ${i}`);
  }
});

test("a final LEARNED line without a newline is still caught", () => {
  const out = streamed(["Done.\n  LEARN", "ED:  the bar is omarchy-shell  "]);
  assert.equal(out.visible, "Done.\n");
  assert.deepEqual(out.facts, ["the bar is omarchy-shell"]);
});

test("ordinary text streams through without waiting for a newline", () => {
  const filter = createLearnedFilter();
  assert.equal(filter.push("Press SUPER"), "Press SUPER");
  assert.equal(filter.push("+RETURN"), "+RETURN");
  assert.equal(filter.push("\nL"), "\n", "a line starting with L is held until it cannot be the marker");
  assert.equal(filter.push("ook here"), "Look here");
  assert.deepEqual(filter.flush(), { visible: "", facts: [] });
  const mention = streamed(["The word LEARNED: appears mid-line.\n"]);
  assert.equal(mention.visible, "The word LEARNED: appears mid-line.\n");
  assert.deepEqual(mention.facts, []);
});

test("facts are bounded, private, and appended atomically", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nixi-learned-"));
  try {
    const long = "x".repeat(500);
    const out = streamed([`LEARNED: ${long}\n`]);
    assert.equal(out.facts[0].length, 300);
    await appendLearned(["one", "two", "three", "four", "five", "six"], dir, new Date("2026-09-15T10:00:00Z"));
    const file = join(dir, "LEARNED.md");
    const text = readFileSync(file, "utf8");
    assert.equal(text, "# Learned on this machine\n" + ["one", "two", "three", "four", "five"].map((f) => `- 2026-09-15: ${f}\n`).join(""));
    assert.equal(statSync(file).mode & 0o777, 0o600);
    await appendLearned(["seven"], dir, new Date("2026-09-16T10:00:00Z"));
    assert.ok(readFileSync(file, "utf8").endsWith("- 2026-09-15: five\n- 2026-09-16: seven\n"), "appends, never replaces");
    assert.deepEqual(readdirSync(dir), ["LEARNED.md"], "a temp file was left behind");
    writeFileSync(file, "y".repeat(270000));
    await appendLearned(["newest"], dir);
    const trimmed = readFileSync(file, "utf8");
    assert.equal(trimmed.length, 200000);
    assert.ok(trimmed.endsWith(": newest\n"), "trimming kept the oldest instead of the newest");
    await appendLearned([], dir);
  } finally { rmSync(dir, { recursive: true }); }
});

test("a symlinked LEARNED.md is left alone", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nixi-learned-"));
  try {
    const target = join(dir, "elsewhere");
    writeFileSync(target, "untouched");
    symlinkSync(target, join(dir, "LEARNED.md"));
    await appendLearned(["fact"], dir);
    assert.equal(readFileSync(target, "utf8"), "untouched");
  } finally { rmSync(dir, { recursive: true }); }
});

test("Mechanic: the card never sees the LEARNED line, LEARNED.md gets the fact, and the user is told", async () => {
  const run = await runBridge({
    settings: { trust: "mechanic" },
    messages: [{ type: "prompt", text: "PLEASE_LEARN something" }],
  });
  const shown = run.events.filter((e) => e.type === "text").map((e) => e.text).join("");
  assert.equal(shown, "Use nixarchy apply.\n");
  assert.match(run.learnedAfter, /^# Learned on this machine\n- \d{4}-\d{2}-\d{2}: apps queue in apps\.nix\n$/);
  const events = run.events.map((e) => e.type);
  assert.ok(events.lastIndexOf("text") < events.indexOf("done"), "text arrived after done");
  // The write used to be invisible: stripped from the transcript, appended to
  // disk, and fed back into every later prompt with nothing shown (#51).
  const learned = run.events.find((e) => e.type === "learned");
  assert.ok(learned, `no learned event; got ${JSON.stringify(events)}`);
  assert.deepEqual(learned.facts, ["apps queue in apps.nix"]);
});

test("Guide records nothing: it promises your machine does not change (#51)", async () => {
  // LEARNED.md is a write, and one that steers later sessions -- nixi-context
  // reads it as a notes source and grounding.js prepends the result. #41 settled
  // that reading is not changing and writing is; that is why Guide keeps
  // unprompted reads and must not accumulate durable state behind a promise
  // that nothing changes.
  const run = await runBridge({ messages: [{ type: "prompt", text: "PLEASE_LEARN something" }] });
  assert.equal(run.events.find((e) => e.type === "ready").trust, "guide", "not the default trust");
  const shown = run.events.filter((e) => e.type === "text").map((e) => e.text).join("");
  assert.equal(shown, "Use nixarchy apply.\n", "Guide still strips the marker line");
  assert.equal(run.learnedAfter, null, "Guide wrote to LEARNED.md");
  assert.ok(!run.events.some((e) => e.type === "learned"),
    "Guide announced a fact it did not keep");
});
