// P-14: checks the blocking functions (beforeCreate, beforeSignIn, §4.4) on the REAL demo project, through the
// same public sign-in API the app uses. Run by the project owner only; nothing is written except, if the check
// fails, the account that should have been refused (the script says so).
// Usage, from the repository root:
//   node scripts/checkBlocking.mjs <active e-mail> <deactivated e-mail>
// The password of each account is typed at the prompt (not shown, not stored, never in the repository).
import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { stdin, stdout } from "node:process";

const env = Object.fromEntries(readFileSync(new URL("../.env.demo", import.meta.url), "utf8").split(/\r?\n/)
  .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]));
const KEY = env.VITE_FIREBASE_API_KEY;
const [activeEmail, inactiveEmail] = process.argv.slice(2);
if (!KEY || !activeEmail || !inactiveEmail) {
  console.error("Usage: node scripts/checkBlocking.mjs <active e-mail> <deactivated e-mail>");
  process.exit(2);
}

// Reads a line without echoing it.
function askHidden(question) {
  return new Promise((resolve) => {
    stdout.write(question);
    let value = "";
    stdin.setRawMode?.(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    const onData = (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode?.(false); stdin.pause(); stdin.off("data", onData); stdout.write("\n"); resolve(value);
      } else if (ch === "\u0003") { process.exit(130); }
      else if (ch === "\u007f" || ch === "\b") value = value.slice(0, -1);
      else value += ch;
    };
    stdin.on("data", onData);
  });
}

const call = async (method, body) => {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:${method}?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, returnSecureToken: true }),
  });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, error: j.error?.message ?? null };
};
const refusedByBlocking = (error) => /BLOCKING_FUNCTION_ERROR_RESPONSE|no_active_account/.test(String(error));

const results = [];
const report = (name, pass, detail) => { results.push(pass); console.log(`${pass ? "OK  " : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`); };

const p1 = await askHidden(`Password of ${activeEmail}: `);
const a = await call("signInWithPassword", { email: activeEmail, password: p1 });
report("1. active account signs in", a.ok, a.error ?? "");

const p2 = await askHidden(`Password of ${inactiveEmail}: `);
const b = await call("signInWithPassword", { email: inactiveEmail, password: p2 });
report("2. deactivated account is refused by beforeSignIn", !b.ok && refusedByBlocking(b.error), b.ok ? "it signed in" : b.error);

const stranger = `blocking-check-${randomUUID().slice(0, 8)}@swaptrack-demo.test`;
const c = await call("signUp", { email: stranger, password: randomUUID() });
report("3. self sign-up outside the Admin SDK is refused by beforeCreate", !c.ok && refusedByBlocking(c.error),
  c.ok ? `the account ${stranger} WAS created: delete it in the console` : c.error);

console.log(results.every(Boolean) ? "\nAll three checks passed." : "\nAt least one check failed: send this output (no passwords in it) to the team.");
process.exit(results.every(Boolean) ? 0 : 1);
