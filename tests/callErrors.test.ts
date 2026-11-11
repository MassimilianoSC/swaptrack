import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import { getFunctions, httpsCallableFromURL } from "firebase/functions";
import { opErrorCode } from "../src/lib/data/opErrorCode";

// P-181: every server error read as "Errore imprevisto" online. The server sends its code as the message of an
// HttpsError (functions/src/core/errors.ts), but the Firebase client of the app (@firebase/functions 0.14) turns
// {"error":{"status":"PERMISSION_DENIED","message":"forbidden"}} into an error whose message is "forbidden [403]".
// The errors here are made by the real client, from a local server answering as a callable function does.
let server: Server;
let base = "";
let app: FirebaseApp;
const ANSWERS: Record<string, [number, unknown]> = {
  forbidden: [403, { error: { status: "PERMISSION_DENIED", message: "forbidden" } }],
  email: [409, { error: { status: "ALREADY_EXISTS", message: "email_exists" } }],
  internal: [500, { error: { status: "INTERNAL", message: "INTERNAL" } }],
};

beforeAll(async () => {
  server = createServer((req, res) => {
    const [status, body] = ANSWERS[(req.url ?? "").slice(1)] ?? [404, {}];
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  app = initializeApp({ projectId: "demo-call-errors", apiKey: "demo-key", appId: "demo" }, "call-errors");
});
afterAll(async () => {
  await deleteApp(app);
  await new Promise<void>((ok) => server.close(() => ok()));
});

const errorOf = async (path: string) => {
  try { await httpsCallableFromURL(getFunctions(app), `${base}/${path}`)({}); } catch (e) { return e as { code?: string; message?: string }; }
  throw new Error("no error");
};

describe("the code of a server error, as the app reads it (P-181)", () => {
  it("the real client adds the HTTP status to the message", async () => {
    expect((await errorOf("forbidden")).message).toBe("forbidden [403]");
  });
  it("«forbidden [403]» and «email_exists [409]» are read as their codes", async () => {
    expect(opErrorCode(await errorOf("forbidden"), true)).toBe("forbidden");
    expect(opErrorCode(await errorOf("email"), true)).toBe("email_exists");
  });
  it("an internal error of the server is «unexpected»; offline it is «offline»", async () => {
    expect(opErrorCode(await errorOf("internal"), true)).toBe("unexpected");
    expect(opErrorCode(await errorOf("internal"), false)).toBe("offline");
    expect(opErrorCode({ code: "functions/unavailable", message: "unavailable" }, true)).toBe("offline");
  });
  it("a code without the status (an older client) still works; anything else is «unexpected»", () => {
    expect(opErrorCode({ code: "functions/permission-denied", message: "forbidden" }, true)).toBe("forbidden");
    expect(opErrorCode({ message: "Something went wrong [500]" }, true)).toBe("unexpected");
    expect(opErrorCode(undefined, true)).toBe("unexpected");
  });
});
