import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { setupScheduled, type ScheduledEnv } from "./env";

// P-210 (SPEC §3.3, §8.3): the admin of the client closes every anomaly, the admin of an ASP those of its ASP; the
// note is optional, as for alerts. Red before: a «Close» without a note was refused (invalid_data).
const PROJECT = "demo-resolve-anomaly-tests";
let env: ScheduledEnv;
type Alerts = typeof import("../../src/routers/alerts")["alerts"];
let alerts: Alerts;
type Ctx = Parameters<Alerts["resolveAnomaly"]["handler"]>[0];
const ctx = (role: string, orgId: string) => ({ uid: `tt_${role}_${orgId}`, role, orgId, ip: "test", token: {} }) as Ctx;
const CA = ctx("client_admin", "org_client"), NORD = ctx("asp_admin", "org_asp_nord");
let n = 0;
const anomaly = async (aspId: string, type = "late_event") => {
  const id = `an_tt_${Date.now().toString(36)}_${n++}`;
  await env.admin.db.collection("anomalies").doc(id).set({ type, aspId, itemId: null, eventId: null, codeId: null, locationId: null, detail: type, openedAt: new Date(), resolution: null, resolvedAt: null, resolvedBy: null });
  return id;
};
// Through the schema of the operation, as the router does (core/router.ts): the note rule lives there.
const resolve = (c: Ctx, data: Record<string, unknown>) => alerts.resolveAnomaly.handler(c, alerts.resolveAnomaly.schema.parse(data));
const resolutionOf = async (id: string) => (await env.admin.db.collection("anomalies").doc(id).get()).data()!;

beforeAll(async () => {
  env = await setupScheduled(PROJECT);
  ({ alerts } = await import("../../src/routers/alerts"));
});
beforeEach(async () => { await env.clear(); });

describe("closing an anomaly (P-210)", () => {
  it("without a note: closed by hand, no reason stored", async () => {
    const id = await anomaly("org_asp_nord");
    await resolve(NORD, { anomalyId: id, action: "dismiss", reason: "" });
    expect(await resolutionOf(id)).toMatchObject({ resolution: "manual", resolvedBy: NORD.uid, resolvedReason: null });
  });
  it("with a note: the note is kept", async () => {
    const id = await anomaly("org_asp_sud");
    await resolve(CA, { anomalyId: id, action: "dismiss", reason: "  verificato al telefono  " });
    expect(await resolutionOf(id)).toMatchObject({ resolution: "manual", resolvedBy: CA.uid, resolvedReason: "verificato al telefono" });
  });
  it("an ASP admin closes only the anomalies of its ASP; the client admin any", async () => {
    const other = await anomaly("org_asp_centro");
    await expect(resolve(NORD, { anomalyId: other, action: "dismiss", reason: "" }))
      .rejects.toMatchObject({ code: "not-found", message: "anomaly_not_found" });
    expect((await resolutionOf(other)).resolution).toBeNull();
    await resolve(CA, { anomalyId: other, action: "dismiss", reason: "" });
    expect((await resolutionOf(other)).resolution).toBe("manual");
  });
  it("closed once: a second close is refused (already_resolved); «accept move» stays the client's", async () => {
    const id = await anomaly("org_asp_nord");
    await resolve(NORD, { anomalyId: id, action: "dismiss", reason: "" });
    await expect(resolve(NORD, { anomalyId: id, action: "dismiss", reason: "" }))
      .rejects.toMatchObject({ code: "failed-precondition", message: "already_resolved" });
    const move = await anomaly("org_asp_nord", "code_of_another_asp");
    await expect(resolve(NORD, { anomalyId: move, action: "accept_move", reason: "" }))
      .rejects.toMatchObject({ code: "permission-denied", message: "forbidden" });
  });
});
