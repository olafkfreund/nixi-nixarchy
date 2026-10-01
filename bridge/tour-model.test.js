import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

// TourModel.js is shared with QML, so it is CommonJS-compatible like Omarchy's
// own KeyboardLayoutModel.js, not an ES module.
const require = createRequire(import.meta.url);
const Tour = require("../TourModel.js");
const tour = JSON.parse(readFileSync(new URL("../share/tour.json", import.meta.url)));
const learn = JSON.parse(readFileSync(new URL("../share/learn.json", import.meta.url)));

const openTerminal = ["openwindow", "80a1,1,foot,~"];

test("an event only counts when its name and qualifiers match", () => {
  const terminal = { event: "openwindow", classAny: ["foot", "kitty"] };
  assert.equal(Tour.stepMatches(terminal, "openwindow", "80a1,1,foot,~"), true);
  assert.equal(Tour.stepMatches(terminal, "openwindow", "80a1,1,Kitty,~"), true, "class match is case-insensitive");
  assert.equal(Tour.stepMatches(terminal, "openwindow", "80a1,1,footclient-ish,~"), false, "a class is a whole field, not a substring");
  assert.equal(Tour.stepMatches(terminal, "closewindow", "80a1"), false);
  const browser = { event: "openwindow", dataContainsAny: ["chrome"] };
  assert.equal(Tour.stepMatches(browser, "openwindow", "80a1,2,google-chrome,New Tab"), true, "substring anywhere");
  assert.equal(Tour.stepMatches({ event: "workspace" }, "workspace", "2"), true);
  assert.equal(Tour.stepMatches({ self: "opened" }, "openwindow", "x"), false, "self steps never match events");
  assert.equal(Tour.stepMatches({ check: "defaultAgent" }, "openwindow", "x"), false);
});

test("a step with a count needs that many matching events", () => {
  let state = Tour.start();
  state = Tour.onCheck(state, tour, { defaultAgent: true });           // step 0 is the agent check
  const focusStep = tour.steps.findIndex((s) => s.count === 4);
  state = { ...state, step: focusStep, hits: 0 };
  for (let i = 1; i <= 3; i++) {
    state = Tour.onEvent(state, tour, "activewindow", "x");
    assert.equal(state.step, focusStep, `advanced after only ${i}`);
  }
  state = Tour.onEvent(state, tour, "activewindow", "x");
  assert.equal(state.step, focusStep + 1);
  assert.equal(state.hits, 0, "hits reset for the next step");
});

test("the agent check advances only when an agent is configured", () => {
  let state = Tour.start();
  assert.equal(Tour.onCheck(state, tour, { defaultAgent: false }).step, 0);
  state = Tour.onCheck(state, tour, { defaultAgent: true });
  assert.equal(state.step, 1);
  assert.equal(Tour.onEvent(state, tour, ...openTerminal).step, 2);
});

test("the last step completes on summon, and only on summon", () => {
  const last = tour.steps.length - 1;
  let state = { ...Tour.start(), step: last };
  state = Tour.onEvent(state, tour, "openwindow", "80a1,1,org.example,127.0.0.1");
  assert.equal(state.finished, false, "a window event must not finish the tour");
  state = Tour.onOpened(state, tour);
  assert.equal(state.finished, true);
  // Summoning the card must never complete an ordinary step.
  const terminalStep = tour.steps.findIndex((s) => s.match.classAny);
  const mid = { ...Tour.start(), step: terminalStep };
  assert.deepEqual(Tour.onOpened(mid, tour), mid, "reopening the card skipped a step");
  assert.equal(state.active, false);
});

test("nothing moves when the tour is not running", () => {
  const idle = Tour.idle();
  assert.deepEqual(Tour.onEvent(idle, tour, ...openTerminal), idle);
  assert.deepEqual(Tour.onOpened(idle, tour), idle);
  assert.deepEqual(Tour.onCheck(idle, tour, { defaultAgent: true }), idle);
  assert.equal(Tour.currentText(idle, tour), "");
});

test("the whole real tour can be completed", () => {
  let state = Tour.start();
  for (const step of tour.steps) {
    const before = state.step;
    for (let i = 0; i < step.count; i++) {
      const m = step.match;
      if (m.check) state = Tour.onCheck(state, tour, { defaultAgent: true });
      else if (m.self) state = Tour.onOpened(state, tour);
      else {
        const cls = (m.classAny || [])[0] || "x";
        const data = m.dataContainsAny ? `a,1,${m.dataContainsAny[0]},t` : `a,1,${cls},t`;
        state = Tour.onEvent(state, tour, m.event, data);
      }
    }
    assert.ok(state.finished || state.step === before + 1, `stuck on step ${before}: ${step.text.slice(0, 40)}`);
  }
  assert.equal(state.finished, true);
});

test("the learning path offers topics in order and skips what is done", () => {
  assert.equal(Tour.nextTopic(learn, {}).id, learn.topics[0].id);
  const taught = Tour.markTaught({}, learn.topics[0].id, 1000);
  assert.equal(Tour.nextTopic(learn, taught).id, learn.topics[1].id);
  const observed = { taught: {}, observed: { [learn.topics.find((t) => t.observe).observe]: 1 } };
  assert.notEqual(Tour.nextTopic(learn, observed).observe, Object.keys(observed.observed)[0]);
  const allDone = { taught: Object.fromEntries(learn.topics.map((t) => [t.id, 1])) };
  assert.equal(Tour.nextTopic(learn, allDone), null);
  assert.deepEqual(Tour.progress(learn, taught), { done: 1, total: learn.topics.length });
});

test("markTaught keeps every other key in learning.json", () => {
  const before = { toured: true, integrations: { skill: true }, taught: { menu: 5 } };
  const after = Tour.markTaught(before, "keys", 9);
  assert.deepEqual(after, { toured: true, integrations: { skill: true }, taught: { menu: 5, keys: 9 } });
  assert.deepEqual(before.taught, { menu: 5 }, "markTaught mutated its input");
});
