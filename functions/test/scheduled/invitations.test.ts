import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupScheduled, type ScheduledEnv } from "./env";

// D-69 / P-140: invitations and «Forgot your password?» are e-mailed by Firebase Authentication itself (its
// «password reset» template), not by the Trigger Email extension (closed with Firebase Extensions on 31/03/2027).
// The Auth emulator records every e-mail it "sends": /emulator/v1/projects/<p>/oobCodes.
// Red before: the server only wrote a document in `mail` for the extension, so no e-mail left at all; without the
// extension installed, «Forgot your password?» never sent anything.
const PROJECT = "demo-invite-tests";
process.env.APP_URL ??= "http://localhost:3010";
let env: ScheduledEnv;
type Users = typeof import("../../src/routers/users")["usersOps"];
let users: Users;
const ca = { uid: "tt_ca", role: "client_admin", orgId: "org_client", ip: "test", token: {} } as Parameters<Users["inviteUser"]["handler"]>[0];
const pub = { uid: null, role: "asp_technician", orgId: "", ip: "test", token: {} } as unknown as Parameters<Users["requestPasswordReset"]["handler"]>[0];
let n = 0;
const email = () => `invito.${Date.now().toString(36)}.${n++}@swaptrack-demo.test`;
// The emulator lists the links generated for the admin to copy (generatePasswordResetLink) as well: an e-mail sent by
// Firebase is the one with a continueUrl, which only the sending call carries.
const sentTo = async (to: string) => {
  const r = await fetch(`http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const all = ((await r.json()) as { oobCodes?: Array<{ email: string; requestType: string; oobLink: string }> }).oobCodes ?? [];
  return all.filter((c) => c.email === to && decodeURIComponent(c.oobLink).includes("continueUrl="));
};
const setEmail = (on: boolean) => env.admin.db.collection("settings").doc("app").set({ minVersion: "", emailConfigured: on });
const invite = (to: string) => users.inviteUser.handler(ca, { email: to, firstName: "Prova", lastName: "Invito", language: "it", role: "client_office", orgId: "org_client" }) as Promise<{ uid: string; delivered: string; link?: string }>;

beforeAll(async () => {
  env = await setupScheduled(PROJECT);
  ({ usersOps: users } = await import("../../src/routers/users"));
});
beforeEach(async () => {
  await env.clear();
  await env.admin.db.collection("organizations").doc("org_client").set({ name: "Telco Demo", type: "client", active: true });
});

describe("invitations by Firebase Authentication e-mail (D-69)", () => {
  it("switch on: Firebase e-mails the «set your password» link to that address, and no link is shown", async () => {
    await setEmail(true);
    const to = email();
    const r = await invite(to);
    expect(r).toMatchObject({ delivered: "email" });
    expect(r.link).toBeUndefined();
    const sent = await sentTo(to);
    expect(sent).toHaveLength(1);
    expect(sent[0].requestType).toBe("PASSWORD_RESET");
    expect(decodeURIComponent(sent[0].oobLink)).toContain("purpose=invite");
  });

  it("switch off: the link to copy, as before, and no e-mail", async () => {
    await setEmail(false);
    const to = email();
    const r = await invite(to);
    expect(r).toMatchObject({ delivered: "link" });
    expect(r.link).toContain("/auth/action?mode=resetPassword");
    expect(await sentTo(to)).toHaveLength(0);
  });

  it("«Resend invitation» with the switch on sends a new e-mail", async () => {
    await setEmail(true);
    const to = email();
    const { uid } = await invite(to);
    await users.resendInvitation.handler(ca, { uid });
    expect(await sentTo(to)).toHaveLength(2);
  });
});

describe("«Forgot your password?» (D-69): always e-mailed by Firebase, same answer for every address", () => {
  it("an active user receives the e-mail, with the switch off too; an unknown address receives nothing", async () => {
    await setEmail(false);
    const to = email();
    await invite(to);
    expect(await users.requestPasswordReset.handler(pub, { email: to, language: "en" })).toEqual({ ok: true });
    const sent = await sentTo(to);
    expect(sent).toHaveLength(1);
    expect(decodeURIComponent(sent[0].oobLink)).toContain("purpose=reset");
    const unknown = email();
    expect(await users.requestPasswordReset.handler(pub, { email: unknown, language: "en" })).toEqual({ ok: true });
    expect(await sentTo(unknown)).toHaveLength(0);
  });
});
