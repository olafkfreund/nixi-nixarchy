// Runs the real bridge.js against testing/fake-agent.js and returns what the
// agent received. Shared by the bridge's behavioural tests.
import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const here = new URL(".", import.meta.url).pathname;
const bridge = join(here, "..", "bridge.js");
const fakeAgent = join(here, "fake-agent.js");

function executable(path, body) {
  writeFileSync(path, body, { mode: 0o700 });
}

// options.context: text the stub nixi-context prints (null = no stub on PATH)
// options.configDir: create ~/.config/nixi before starting
// options.messages: stdin messages sent in order, each after the previous turn
export async function runBridge(options = {}) {
  const home = mkdtempSync(join(tmpdir(), "nixi-bridge-"));
  const bin = join(home, "bin");
  mkdirSync(bin);
  // resolveExecutable() insists on a real harness binary; the fake agent never runs it.
  executable(join(bin, "claude"), "#!/bin/sh\nexit 0\n");
  if (options.context !== null && options.context !== undefined) {
    executable(join(bin, "nixi-context"),
      `#!/bin/sh\nprintf '%s\\n' "$*" > "${join(home, "context-args")}"\ncat <<'NIXI_EOF'\n${options.context}\nNIXI_EOF\n`);
  }
  if (options.configDir) mkdirSync(join(home, ".config", "nixi"), { recursive: true });
  if (options.settings) {
    mkdirSync(join(home, ".config", "omarchy"), { recursive: true });
    writeFileSync(join(home, ".config", "omarchy", "nixi.json"), JSON.stringify(options.settings));
  }
  const log = join(home, "agent.log");
  const env = {
    HOME: home,
    PATH: `${bin}:${process.env.PATH}`,
    NIXI_AGENT: "claude",
    NIXI_ACP_COMMAND: JSON.stringify([process.execPath, fakeAgent]),
    FAKE_AGENT_LOG: log,
    ...(options.env || {}),
  };
  const child = spawn(process.execPath, [bridge], { env, stdio: ["pipe", "pipe", "pipe"] });
  const events = [];
  let buffer = "";
  const waiters = [];
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    let index;
    while ((index = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, index);
      buffer = buffer.slice(index + 1);
      if (!line.trim()) continue;
      const event = JSON.parse(line);
      events.push(event);
      for (const waiter of waiters.splice(0)) waiter();
    }
  });
  const until = (predicate, label) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out waiting for ${label}; events: ${JSON.stringify(events)}`)), 15000);
    const check = () => {
      const found = events.find(predicate);
      if (found) { clearTimeout(timer); resolve(found); } else waiters.push(check);
    };
    check();
  });
  try {
    const ready = await until((e) => e.type === "ready" || e.type === "fatal", "ready");
    if (ready.type === "fatal") throw new Error(`bridge fatal: ${ready.message}`);
    let turns = 0;
    for (const message of options.messages || []) {
      child.stdin.write(JSON.stringify(message) + "\n");
      if (message.type === "prompt") {
        const target = ++turns;
        await until(() => events.filter((e) => e.type === "done").length >= target, `turn ${target}`);
      }
    }
    const agent = existsSync(log)
      ? readFileSync(log, "utf8").trim().split("\n").filter(Boolean).map((line) => JSON.parse(line))
      : [];
    const contextArgsPath = join(home, "context-args");
    return {
      home,
      events,
      agent,
      contextArgs: existsSync(contextArgsPath) ? readFileSync(contextArgsPath, "utf8").trim() : null,
    };
  } finally {
    child.kill("SIGTERM");
    rmSync(home, { recursive: true, force: true });
  }
}
