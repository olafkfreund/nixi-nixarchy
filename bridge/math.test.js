import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

// math.js reads one JSON line per query on stdin and answers one line each,
// the way MenuSearch.qml drives it.
function answers(queries) {
  const input = queries.map((query, id) => JSON.stringify({ id, query })).join("\n") + "\n";
  const run = spawnSync(process.execPath, [new URL("math.js", import.meta.url).pathname], { input });
  return run.stdout.toString().trim().split("\n").map((line) => JSON.parse(line).result?.answer ?? null);
}

test("math answers what it did before, and product now works", () => {
  const cases = {
    "product 2 3 4": "24",
    "prod(2, 3)": "6",
    "sum 1 2 3": "6",
    "average 2 4": "3",
    "2+3*4": "14",
    "10% of 50": "0.1",
    "50 * 10%": "5",
    "7 % 3": "1",
    "5 km to m": "5000 m",
    "100 F to C": "37.777777777778 degC",
    "sqrt(16)": "4",
    'import("fs")': null,
    "2^100000": null,
    "hello": null,
  };
  assert.deepEqual(answers(Object.keys(cases)), Object.values(cases));
});
