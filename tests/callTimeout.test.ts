import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// P-153: the app waits for a server answer longer than the longest router may work. The SDK default (70 s) gave up on
// a 72 s export that the server still created: the list stayed empty until a reload. The routers' limits are read from
// their sources, so a router given more time later makes this test red until the app waits longer too.
const httpsCallable = vi.fn((..._args: unknown[]) => async () => ({ data: { ok: true } }));
vi.mock("firebase/functions", () => ({ httpsCallable: (...args: unknown[]) => httpsCallable(...args) }));
vi.mock("../src/lib/data/firebase", () => ({ functions: { fake: true } }));

const routersDir = fileURLToPath(new URL("../functions/src/routers/", import.meta.url));
const longestRouterSeconds = Math.max(60, ...readdirSync(routersDir).filter((f) => f.endsWith(".ts")).flatMap((f) =>
  [...readFileSync(routersDir + f, "utf8").matchAll(/timeoutSeconds:\s*(\d+)/g)].map((m) => Number(m[1]))));

describe("call: the app's wait for a server answer", () => {
  it("passes a timeout longer than the longest router's limit", async () => {
    const { call } = await import("../src/lib/data/call");
    await call("createExport", {});
    expect(httpsCallable).toHaveBeenCalledTimes(1);
    expect(httpsCallable.mock.calls[0][1]).toBe("desk");
    const options = httpsCallable.mock.calls[0][2] as { timeout?: number } | undefined;
    expect(longestRouterSeconds).toBeGreaterThanOrEqual(120);
    expect(options?.timeout ?? 70_000).toBeGreaterThan(longestRouterSeconds * 1000);
  });
});
