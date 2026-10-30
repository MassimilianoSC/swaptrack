import { describe, it, expect } from "vitest";
import { EMULATORS, portsOf, portHolderPids } from "../scripts/emulatorPorts.mjs";

type Port = { host: string; port: number };

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

describe("portHolderPids", () => {
  const ports = [{ host: "127.0.0.1", port: 8190 }, { host: "127.0.0.1", port: 4410 }];
  it("reads an Italian netstat (IN ASCOLTO / STABILITA), only server-side sockets, never PID 0 or UDP", () => {
    const out = [
      "Connessioni attive",
      "",
      "  Proto  Indirizzo locale       Indirizzo esterno      Stato           PID",
      "  TCP    127.0.0.1:8190         0.0.0.0:0              IN ASCOLTO      213544",
      "  TCP    127.0.0.1:8190         127.0.0.1:53211        STABILITA       213544",
      "  TCP    127.0.0.1:53211        127.0.0.1:8190         STABILITA       4242",
      "  TCP    127.0.0.1:8190         127.0.0.1:53000        TIME_WAIT       0",
      "  TCP    [::1]:4410             [::]:0                 IN ASCOLTO      777",
      "  TCP    127.0.0.1:9099         0.0.0.0:0              IN ASCOLTO      555",
      "  UDP    0.0.0.0:8190           *:*                                    999",
    ].join("\r\n");
    expect((portHolderPids(out, ports) as string[]).sort()).toEqual(["213544", "777"]);
  });
  it("reads an English netstat too", () => {
    expect(portHolderPids("  TCP    127.0.0.1:4410         0.0.0.0:0              LISTENING       31337\n", ports)).toEqual(["31337"]);
  });
});
