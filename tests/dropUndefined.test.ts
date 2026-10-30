import { describe, it, expect } from "vitest";
import { dropUndefined } from "../src/lib/data/dropUndefined";

// P-61: the callable client encodes undefined as null and the server schemas refuse null on optional fields.
// The app drops undefined keys before every call (src/lib/data/call.ts); null, dates and other values stay.
describe("dropUndefined", () => {
  it("drops undefined keys at every depth, also inside arrays", () => {
    const out = dropUndefined({
      documentId: undefined, kind: "ddt_in",
      lines: [{ kind: "serial", codeRaw: "A1", direction: undefined }, { kind: "quantity", quantity: 2, materialCode: null }],
      nested: { a: undefined, b: { c: undefined, d: 1 } },
    });
    expect(out).toEqual({
      kind: "ddt_in",
      lines: [{ kind: "serial", codeRaw: "A1" }, { kind: "quantity", quantity: 2, materialCode: null }],
      nested: { b: { d: 1 } },
    });
    expect(JSON.stringify(out)).not.toContain("documentId");
    expect(JSON.stringify(out)).not.toContain("direction");
  });

  it("keeps null, dates, numbers, booleans and strings as they are", () => {
    const when = new Date(Date.UTC(2026, 9, 30));
    const out = dropUndefined({ aspId: null, at: when, n: 0, ok: false, s: "" }) as Record<string, unknown>;
    expect(out).toEqual({ aspId: null, at: when, n: 0, ok: false, s: "" });
    expect(out.at).toBe(when);
    expect(dropUndefined(null)).toBeNull();
    expect(dropUndefined([1, null, "x"])).toEqual([1, null, "x"]);
  });
});
