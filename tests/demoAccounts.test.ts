import { describe, it, expect } from "vitest";
import { isDemoAccount, passwordProblem } from "../scripts/demoAccounts.mjs";

// P-84: setDemoPassword.mjs touches only the seed's demo accounts, and the new password follows SPEC §4.7.
describe("isDemoAccount", () => {
  it("only e-mails of the demo domain, whatever the case", () => {
    expect(isDemoAccount("asp.admin.nord@swaptrack-demo.test")).toBe(true);
    expect(isDemoAccount("Client.Admin.Telco@SWAPTRACK-DEMO.TEST")).toBe(true);
    expect(isDemoAccount("someone@hqe.it")).toBe(false);
    expect(isDemoAccount("x@swaptrack-demo.test.example.com")).toBe(false);
    expect(isDemoAccount("swaptrack-demo.test@example.com")).toBe(false);
    expect(isDemoAccount(undefined)).toBe(false);
  });
});

describe("passwordProblem (§4.7: at least 10 characters, letters and digits)", () => {
  it("accepts a valid password, names the first missing rule otherwise", () => {
    expect(passwordProblem("Demo2026novembre")).toBeNull();
    expect(passwordProblem("Demo2026")).toBe("at least 10 characters");
    expect(passwordProblem("1234567890")).toBe("at least one letter");
    expect(passwordProblem("solamentelettere")).toBe("at least one digit");
    expect(passwordProblem(undefined)).toBe("at least 10 characters");
  });
});
