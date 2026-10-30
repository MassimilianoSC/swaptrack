import { describe, it, expect } from "vitest";
import { authDisableDone } from "../functions/src/shared/graceExpiry";

// PIANO P-55, §4.8: a deactivated user must stay disableable. Before, runGraceExpiry ignored the Auth error and
// marked authDisabled anyway, so a failed disable was never tried again.
describe("authDisableDone", () => {
  it("marks when Auth disabled the account", () => {
    expect(authDisableDone(null)).toBe(true);
  });
  it("marks when there is no Auth account to disable", () => {
    expect(authDisableDone({ code: "auth/user-not-found" })).toBe(true);
  });
  it("does not mark on any other error: the next run tries again", () => {
    expect(authDisableDone({ code: "auth/internal-error" })).toBe(false);
    expect(authDisableDone(new Error("network"))).toBe(false);
  });
});
