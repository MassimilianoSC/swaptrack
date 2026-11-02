// The demo accounts of the seed (invented people, domain swaptrack-demo.test) and the password rule they must meet.
// Pure: used by setDemoPassword.mjs and seed.mjs, tested in tests/demoAccounts.test.ts.
export const DEMO_DOMAIN = "swaptrack-demo.test";

export const isDemoAccount = (email) => typeof email === "string" && email.toLowerCase().endsWith(`@${DEMO_DOMAIN}`);

// Same rule as functions/src/shared/policy.ts passwordIssues (§4.7): at least 10 characters, letters and digits.
export function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 10) return "at least 10 characters";
  if (!/\p{L}/u.test(pw)) return "at least one letter";
  if (!/\d/.test(pw)) return "at least one digit";
  return null;
}
