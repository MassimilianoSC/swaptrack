import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupScheduled, type ScheduledEnv } from "./env";

// P-203 (census by role): «New ASP» with the e-mail of an existing account answered email_exists but had already
// written the organization: an ASP without an admin stayed in the list. Red before: the organization was there.
const PROJECT = "demo-create-asp-tests";
process.env.APP_URL ??= "http://localhost:3010";
let env: ScheduledEnv;
type Users = typeof import("../../src/routers/users")["usersOps"];
let users: Users;
const ca = { uid: "tt_ca", role: "client_admin", orgId: "org_client", ip: "test", token: {} } as Parameters<Users["createAsp"]["handler"]>[0];
let n = 0;
const email = () => `asp.${Date.now().toString(36)}.${n++}@swaptrack-demo.test`;
const person = (to: string) => ({ email: to, firstName: "Prova", lastName: "Admin", language: "it" as const });
const aspsNamed = async (name: string) => (await env.admin.db.collection("organizations").where("name", "==", name).get()).docs;

beforeAll(async () => {
  env = await setupScheduled(PROJECT);
  ({ usersOps: users } = await import("../../src/routers/users"));
});
beforeEach(async () => {
  await env.clear();
  await env.admin.db.collection("organizations").doc("org_client").set({ name: "Telco Demo", type: "client", active: true });
  await env.admin.db.collection("settings").doc("app").set({ minVersion: "", emailConfigured: false });
});

describe("«New ASP» with an e-mail already used (P-203)", () => {
  it("is refused with email_exists and leaves no organization behind", async () => {
    const taken = email();
    await users.inviteUser.handler(ca, { ...person(taken), role: "client_office", orgId: "org_client" });
    const name = `ASP Prova ${n}`;
    await expect(users.createAsp.handler(ca, { name, language: "it", admin: person(taken) }))
      .rejects.toMatchObject({ code: "already-exists", message: "email_exists" });
    expect(await aspsNamed(name)).toHaveLength(0);
    // Nothing logged as created either.
    const log = (await env.admin.db.collection("adminLog").where("action", "==", "asp_created").get()).docs;
    expect(log.filter((l) => l.get("details.name") === name)).toHaveLength(0);
  });
  it("with a new e-mail: the ASP and its first admin, as before", async () => {
    const name = `ASP Prova ${n}`;
    const r = await users.createAsp.handler(ca, { name, language: "it", admin: person(email()) }) as { orgId: string; admin: { uid: string } };
    expect((await aspsNamed(name)).map((d) => d.id)).toEqual([r.orgId]);
    expect((await env.admin.db.collection("users").doc(r.admin.uid).get()).data()).toMatchObject({ role: "asp_admin", orgId: r.orgId, active: true });
  });
});
