import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// P-155 (D-72): checking a piece reads its code, then the piece, one after the other. Each read had its own 2 s limit,
// so a weak signal cost up to 4 s before the outcome of a reading. Now they share 2 s, and the second always has 0.5 s:
// 2.5 s at most, then the phone's copy. (One-off exception to the file owners, decided by the project log, as P-153.)
const server = new Map<string, () => Promise<unknown>>();
const copy = new Map<string, unknown>();
const snap = (data: Record<string, unknown> | null) => ({ exists: () => !!data, data: () => data, get: (k: string) => data?.[k] });
const never = () => new Promise(() => undefined);
const after = (ms: number, v: unknown) => () => new Promise((ok) => setTimeout(() => ok(v), ms));

vi.mock("../src/lib/data/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, col: string, id: string) => ({ path: `${col}/${id}` }),
  getDoc: (ref: { path: string }) => (server.get(ref.path.split("/")[0]) ?? never)(),
  getDocFromCache: async (ref: { path: string }) => copy.get(ref.path.split("/")[0]) ?? Promise.reject(new Error("not in the copy")),
  getDocFromServer: never,
}));

async function lookup(onCopyUsed?: () => void) {
  const { cachedItemForCode } = await import("../src/lib/data/events");
  let done = false;
  const result = cachedItemForCode("ABC123", undefined, onCopyUsed).then((v) => { done = true; return v; });
  return { result, isDone: () => done };
}

describe("cachedItemForCode: how long a reading waits for the server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    server.clear();
    copy.clear();
    copy.set("codes", snap({ itemId: "it1" }));
    copy.set("items", snap({ status: "installed" }));
  });
  afterEach(() => { vi.useRealTimers(); });

  it("with a server that does not answer: the phone's copy after 2.5 s, not 4", async () => {
    const used = vi.fn();
    const { result, isDone } = await lookup(used);
    await vi.advanceTimersByTimeAsync(2499);
    expect(isDone()).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(isDone()).toBe(true);
    expect(await result).toEqual({ status: "installed" });
    expect(used).toHaveBeenCalledTimes(1);
  });

  it("the two reads share the time: the code at 1.8 s leaves the piece 0.5 s, the minimum", async () => {
    server.set("codes", after(1800, snap({ itemId: "it1" })));
    const { result, isDone } = await lookup();
    await vi.advanceTimersByTimeAsync(2299);
    expect(isDone()).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    expect(isDone()).toBe(true);
    expect(await result).toEqual({ status: "installed" });
  });

  it("a server that answers in time wins over the copy, and the copy is not reported", async () => {
    server.set("codes", after(100, snap({ itemId: "it1" })));
    server.set("items", after(100, snap({ status: "received_at_asp" })));
    const used = vi.fn();
    const { result } = await lookup(used);
    await vi.advanceTimersByTimeAsync(250);
    expect(await result).toEqual({ status: "received_at_asp" });
    expect(used).not.toHaveBeenCalled();
  });
});
