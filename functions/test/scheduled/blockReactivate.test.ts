import { describe, it, expect, beforeAll } from "vitest";
import { setupScheduled, type ScheduledEnv } from "./env";

// PRIMA_DELLA_PRESENTAZIONE/LEGGIMI.md promises: after «Blocca subito», «Riattiva» gives the access back (the person
// signs in again with the password). Signing in needs three things, each checked here after the block and after the
// reactivation: the Auth account enabled (Firebase refuses a disabled one), the profile active (beforeSignIn,
// blocking.ts) and the claims active (the rules and the app, session.tsx).
const PROJECT = "demo-block-tests";
process.env.APP_URL ??= "http://localhost:3010"; // the invitation link of the person used here
let env: ScheduledEnv;
type Users = typeof import("../../src/routers/users")["usersOps"];
let users: Users;
const ca = { uid: "tt_ca_block", role: "client_admin", orgId: "org_client", ip: "test", token: {} } as Parameters<Users["blockUserNow"]["handler"]>[0];

beforeAll(async () => {
  env = await setupScheduled(PROJECT);
  ({ usersOps: users } = await import("../../src/routers/users"));
  await env.clear();
  await env.admin.db.collection("organizations").doc("org_client").set({ name: "Telco Demo", type: "client", active: true });
  await env.admin.db.collection("settings").doc("app").set({ minVersion: "", emailConfigured: false });
});

describe("«Blocca subito» then «Riattiva»", () => {
  it("gives the access back: Auth account enabled, profile and claims active again", async () => {
    const email = `blocco.${Date.now().toString(36)}@swaptrack-demo.test`;
    const { uid } = (await users.inviteUser.handler(ca, { email, firstName: "Prova", lastName: "Blocco", language: "it", role: "client_office", orgId: "org_client" })) as { uid: string };
    const profile = async () => (await env.admin.db.collection("users").doc(uid).get()).data();

    await users.blockUserNow.handler(ca, { uid });
    const blocked = await env.admin.auth.getUser(uid);
    expect(blocked.disabled).toBe(true);
    expect(blocked.customClaims).toMatchObject({ active: false });
    expect(await profile()).toMatchObject({ active: false, authDisabled: true });

    await users.deactivateUser.handler(ca, { uid, reactivate: true });
    const back = await env.admin.auth.getUser(uid);
    expect(back.disabled).toBe(false);
    expect(back.customClaims).toMatchObject({ role: "client_office", orgId: "org_client", active: true, disabledAt: null });
    expect(await profile()).toMatchObject({ active: true, disabledAt: null, authDisabled: false });
  });
});
