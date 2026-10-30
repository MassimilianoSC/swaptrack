import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import {
  EMULATORS, portsOf, cliEnv, parseTable, descendantsOf, stillOurs, processTable,
} from "../scripts/emulatorPorts.mjs";

type Port = { host: string; port: number };
const script = (name: string) => readFileSync(new URL(`../scripts/${name}`, import.meta.url), "utf8");

describe("emulator ports (D-21)", () => {
  it("every emulator has its own explicit port, none of them a Firebase default", () => {
    const defaults = [9099, 8080, 5001, 9199, 8085, 9299, 9499, 4400, 4500, 4000, 9150, 5000];
    const ports = Object.values(EMULATORS as Record<string, Partial<Port> & { websocketPort?: number }>)
      .flatMap((e) => [e.port, e.websocketPort]).filter((p): p is number => typeof p === "number");
    for (const name of ["auth", "firestore", "functions", "storage", "pubsub", "eventarc", "tasks", "hub", "logging"]) {
      expect(EMULATORS[name]?.port, name).toBeTypeOf("number");
    }
    expect(new Set(ports).size).toBe(ports.length);
    expect(ports.filter((p) => defaults.includes(p))).toEqual([]);
  });

  it("the functions emulator brings eventarc and tasks; hub and logging are always included", () => {
    const ports = (portsOf(["firestore", "functions"]) as Port[]).map((p) => p.port);
    for (const n of ["firestore", "functions", "eventarc", "tasks", "hub", "logging"]) expect(ports).toContain(EMULATORS[n].port);
    expect(ports).toContain(EMULATORS.firestore.websocketPort);
    expect((portsOf(["storage"]) as Port[]).map((p) => p.port)).not.toContain(EMULATORS.tasks.port);
  });
});

describe("the CLI gets 60 s to load the functions (D-26)", () => {
  it("cliEnv sets FUNCTIONS_DISCOVERY_TIMEOUT and keeps the rest", () => {
    expect(cliEnv({ PATH: "x" })).toEqual({ PATH: "x", FUNCTIONS_DISCOVERY_TIMEOUT: "60" });
  });
  it("both scripts start the CLI with cliEnv() and stop it with killPids", () => {
    for (const name of ["emulators.mjs", "test-rules.mjs"]) {
      const src = script(name);
      expect(src, name).toMatch(/emulators:start[\s\S]*env: cliEnv\(\)/);
      expect(src, name).toContain("killPids(emu.pid, recorded)");
      expect(src, name).not.toContain("netstat");
    }
  });
});

describe("stop by PID (P-51)", () => {
  const table = parseTable([
    "  4 0", "100 4", // the session
    "200 100", // node scripts/emulators.mjs
    "300 200", // firebase CLI
    "310 300", "311 310", // Java Firestore started through a shell
    "320 300", // Java Pub/Sub
    "400 100", // something else of the session
    "",
  ].join("\r\n"));
  it("parses the process table", () => {
    expect(table).toHaveLength(8);
    expect(table[2]).toEqual({ pid: 200, ppid: 100 });
  });
  it("records the whole tree of the CLI, nothing else", () => {
    expect(descendantsOf(table, 300).sort()).toEqual([300, 310, 311, 320]);
  });
  it("after the CLI exits, kills only recorded PIDs still parented by our tree (no reused PID)", () => {
    const later = parseTable("311 310\n320 300\n310 999\n");
    expect(stillOurs(later, 300, [300, 310, 311, 320]).sort()).toEqual([311, 320]);
  });
  it("the real process table of this machine sees a child of this process", async () => {
    const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: "ignore" });
    try {
      const mine = descendantsOf(processTable(), process.pid);
      expect(mine).toContain(child.pid);
    } finally {
      child.kill();
    }
  }, 30_000);
});
