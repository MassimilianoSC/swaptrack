import { describe, it, expect, beforeAll } from "vitest";

// P-144: the callable routers that can work for long declare their own time limit (the default is 60 s, in the cloud
// as on the emulators). desk: an export of every ASP with many pieces took 45 s on fresh emulators and went over 60 s
// in the full round of 05/11/2026. documents: the automatic reading waits for the model (D-45).
// The limit is read from the endpoint description that firebase-functions gives to the deploy.
process.env.GCLOUD_PROJECT ??= "demo-router-limits";
const endpoint = (fn: unknown) => (fn as { __endpoint: { timeoutSeconds?: number } }).__endpoint;
let desk: unknown, documents: unknown;

// Loading the routers pulls Excel, PDF and the Admin SDK: seconds when the whole suite runs in parallel.
beforeAll(async () => {
  desk = (await import("../functions/src/routers/desk")).deskRouter;
  documents = (await import("../functions/src/routers/documents")).documentsRouter;
}, 60_000);

describe("time limit of the long routers", () => {
  it("desk (exports, reports): 120 s", () => {
    expect(endpoint(desk).timeoutSeconds).toBe(120);
  });
  it("documents (automatic reading): 120 s", () => {
    expect(endpoint(documents).timeoutSeconds).toBe(120);
  });
});
