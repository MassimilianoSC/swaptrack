import { describe, it, expect } from "vitest";
import { hasNoDifferenceNow, isAlertToWatch, ALERT_READER_ROLES } from "../src/lib/alertState";

// P-60 / D-29: an open alert whose differences are gone (count 0) reads "no difference now" and is not counted.
describe("alertState", () => {
  it("open with differences: to watch", () => {
    expect(isAlertToWatch({ closedAt: null, count: 2 })).toBe(true);
    expect(hasNoDifferenceNow({ closedAt: null, count: 2 })).toBe(false);
  });
  it("open with count 0: no difference now, not to watch", () => {
    expect(isAlertToWatch({ closedAt: null, count: 0 })).toBe(false);
    expect(hasNoDifferenceNow({ closedAt: null, count: 0 })).toBe(true);
  });
  it("closed: neither", () => {
    const closed = { closedAt: { seconds: 1 }, count: 0 };
    expect(isAlertToWatch(closed)).toBe(false);
    expect(hasNoDifferenceNow(closed)).toBe(false);
  });
  it("the technician does not read alerts (firestore.rules /alerts)", () => {
    expect(ALERT_READER_ROLES).not.toContain("asp_technician");
    expect(ALERT_READER_ROLES).toEqual(expect.arrayContaining(["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"]));
  });
});
