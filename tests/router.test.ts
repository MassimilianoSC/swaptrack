import { describe, it, expect, vi } from "vitest";
import { z } from "zod";

// The answer of every callable (core/router.ts): the handler's result, or { ok: true } when it returns nothing. The app
// closes its dialogs on a truthy answer (P-130 of o3: nine windows count on it). No emulators: the rate limit, the
// settings and the Admin SDK are replaced; the onCall function is run as the Functions runtime does (`run`).
vi.mock("../functions/src/core/admin", () => ({ REGION: "europe-west1", db: {} }));
vi.mock("../functions/src/core/rateLimit", () => ({ rateLimit: async () => undefined }));
vi.mock("../functions/src/core/settings", () => ({ getSettings: async () => ({ mfaAdmins: false }) }));

const { makeRouter, op } = await import("../functions/src/core/router");

type Run = { run: (req: unknown) => Promise<unknown> };
const call = (answer: unknown) => {
  const router = makeRouter("items", { editItem: op({ roles: ["asp_warehouse"], schema: z.object({}), handler: async () => answer }) }) as unknown as Run;
  return router.run({ data: { op: "editItem", data: {} }, auth: { uid: "u1", token: { role: "asp_warehouse", orgId: "org_asp_nord", active: true } }, rawRequest: { ip: "test" } });
};

describe("router answer (core/router.ts)", () => {
  it("a handler that returns nothing answers { ok: true }", async () => {
    expect(await call(undefined)).toEqual({ ok: true });
    expect(await call(null)).toEqual({ ok: true });
  });
  it("a handler that returns something answers exactly that", async () => {
    expect(await call({ documentId: "d1" })).toEqual({ documentId: "d1" });
    expect(await call({ ok: false })).toEqual({ ok: false });
  });
  it("a refused call answers nothing: it fails before the handler", async () => {
    const router = makeRouter("items", { editItem: op({ roles: ["client_admin"], schema: z.object({}), handler: async () => ({ x: 1 }) }) }) as unknown as Run;
    await expect(router.run({ data: { op: "editItem", data: {} }, auth: { uid: "u1", token: { role: "asp_warehouse", orgId: "o", active: true } }, rawRequest: { ip: "t" } }))
      .rejects.toMatchObject({ code: "permission-denied" });
  });
});
