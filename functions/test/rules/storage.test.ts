import { describe, it, beforeAll, afterAll } from "vitest";
import { setup, allow, deny, NORD, CENTRO, CLIENT, type Env, type Uid } from "./env";

// SPEC §7.3, §11.2, §13.3, §13.4, §3.3 and R7 for Storage: decided by path and claims only.
// Photos: created by the own ASP (also in grace, §4.8), images under 5 MB; read by client roles and the own ASP.
// Documents: read by kind and scope as Firestore reads the document; exports and reports by scope. No client writes
// except photos. Decisions of 30/10/2026: no ASP reads documents/client/... (§3.3 "own ASP"), only ASP roles upload photos.
let t: Env;
const JPG = { contentType: "image/jpeg" };
const bytes = (n = 16) => new Uint8Array(n).fill(7);

const SEEDED = [
  "branding/logo.png", "branding/notes.txt",
  `photos/${NORD}/ev_seed/1.jpg`,
  `documents/${NORD}/bom/d_bom/1.pdf`, `documents/${NORD}/ddt_in/d_ddt/1.pdf`, `documents/${NORD}/ddt_return/d_ret/1.pdf`,
  `documents/${CENTRO}/bom/d_bom_c/1.pdf`, `documents/${CENTRO}/ddt_return/d_ret_c/1.pdf`, "documents/client/ddt_in/d_cli/1.pdf",
  "exports/client/1.xlsx", `exports/${NORD}/1.xlsx`, `exports/${CENTRO}/1.xlsx`,
  "reports/client/2026-09.pdf", `reports/${NORD}/2026-09.pdf`, `reports/${CENTRO}/2026-09.pdf`,
  "elsewhere/1.txt",
];

beforeAll(async () => {
  t = await setup("storage", { storage: true });
  await t.env.withSecurityRulesDisabled(async (c) => {
    for (const p of SEEDED) await c.storage().ref(p).put(bytes(), { contentType: p.endsWith(".jpg") ? "image/jpeg" : p.endsWith(".png") ? "image/png" : "application/octet-stream" });
  });
});
afterAll(() => t.env.cleanup());

const read = (uid: Uid | null, path: string) => (uid ? t.ctx(uid) : t.anonCtx).storage().ref(path).getMetadata();
const put = (uid: Uid | null, path: string, data = bytes(), meta: { contentType: string } = JPG) =>
  (uid ? t.ctx(uid) : t.anonCtx).storage().ref(path).put(data, meta).then((s) => s);
const remove = (uid: Uid, path: string) => t.ctx(uid).storage().ref(path).delete();

describe("branding (public logo)", () => {
  it("anyone, also signed out, reads the logo; nothing else in branding/", async () => {
    await allow(read(null, "branding/logo.png"));
    await allow(read("nt", "branding/logo.png"));
    await deny(read(null, "branding/notes.txt"));
    await deny(read("ca", "branding/notes.txt"));
  });
  it("nobody writes branding/ from the client (settings callable only)", async () => {
    await deny(put("ca", "branding/logo.png", bytes(), { contentType: "image/png" }));
  });
});

describe("photos/{aspId}/{eventId}/{n}: create (§7.3, §4.8)", () => {
  it("technician, warehouse and asp_admin of the ASP upload a small image", async () => {
    await allow(put("nt", `photos/${NORD}/ev_a/1.jpg`));
    await allow(put("nw", `photos/${NORD}/ev_b/1.jpg`));
    await allow(put("na", `photos/${NORD}/ev_c/1.jpg`));
  });
  it("a user in grace still uploads (scans made before deactivation); an inactive user does not", async () => {
    await allow(put("ntGrace", `photos/${NORD}/ev_g/1.jpg`));
    await deny(put("inactive", `photos/${NORD}/ev_i/1.jpg`));
  });
  it("never into another ASP's folder, never signed out", async () => {
    await deny(put("mt", `photos/${NORD}/ev_m/1.jpg`));
    await deny(put("nt", `photos/${CENTRO}/ev_n/1.jpg`));
    await deny(put(null, `photos/${NORD}/ev_x/1.jpg`));
  });
  it("only images, and under 5 MB", async () => {
    await deny(put("nt", `photos/${NORD}/ev_p/1.jpg`, bytes(), { contentType: "application/pdf" }));
    await deny(put("nt", `photos/${NORD}/ev_big/1.jpg`, bytes(5 * 1024 * 1024)));
    await allow(put("nt", `photos/${NORD}/ev_ok/1.jpg`, bytes(5 * 1024 * 1024 - 1)));
  });
  it("client roles upload no photos (they create no events)", async () => {
    await deny(put("ca", `photos/${CLIENT}/ev_c/1.jpg`));
    await deny(put("cw", `photos/${CLIENT}/ev_c/2.jpg`));
    await deny(put("ca", `photos/${NORD}/ev_c/1.jpg`));
  });
  it("the own ASP may upload the same photo again (queue retry after a failed attachPhotos), another ASP may not", async () => {
    // src/lib/offline/photoQueue.ts re-uploads to the same path when attachPhotos failed: refusing it would turn
    // the photo into "lost" after five tries (criterion 2). Only the same ASP can write that folder.
    await allow(put("nt", `photos/${NORD}/ev_seed/1.jpg`));
    await deny(put("mt", `photos/${NORD}/ev_seed/1.jpg`));
  });
  it("an uploaded photo is never deleted from the client", async () => {
    await deny(remove("nt", `photos/${NORD}/ev_seed/1.jpg`));
    await deny(remove("ca", `photos/${NORD}/ev_seed/1.jpg`));
  });
});

describe("photos: read", () => {
  it("client roles and the own ASP read; another ASP, users in grace, inactive and signed out do not", async () => {
    for (const uid of ["ca", "co", "cw", "na", "nw", "nt"] as Uid[]) await allow(read(uid, `photos/${NORD}/ev_seed/1.jpg`));
    for (const uid of ["ma", "mw", "mt", "ntGrace", "inactive"] as Uid[]) await deny(read(uid, `photos/${NORD}/ev_seed/1.jpg`));
    await deny(read(null, `photos/${NORD}/ev_seed/1.jpg`));
  });
});

describe("documents/{scope}/{kind}/{documentId}/{n}: read (§3.3, §11.2)", () => {
  it("client_admin and client_office read every document", async () => {
    for (const uid of ["ca", "co"] as Uid[]) {
      for (const p of SEEDED.filter((s) => s.startsWith("documents/"))) await allow(read(uid, p));
    }
  });
  it("asp_admin and asp_warehouse read the documents of their ASP only, not documents/client/", async () => {
    for (const uid of ["na", "nw"] as Uid[]) {
      await allow(read(uid, `documents/${NORD}/bom/d_bom/1.pdf`));
      await allow(read(uid, `documents/${NORD}/ddt_in/d_ddt/1.pdf`));
      await allow(read(uid, `documents/${NORD}/ddt_return/d_ret/1.pdf`));
      await deny(read(uid, `documents/${CENTRO}/bom/d_bom_c/1.pdf`));
      await deny(read(uid, "documents/client/ddt_in/d_cli/1.pdf"));
    }
  });
  it("technicians read the BOMs of their ASP only", async () => {
    await allow(read("nt", `documents/${NORD}/bom/d_bom/1.pdf`));
    await deny(read("nt", `documents/${NORD}/ddt_in/d_ddt/1.pdf`));
    await deny(read("nt", `documents/${NORD}/ddt_return/d_ret/1.pdf`));
    await deny(read("nt", `documents/${CENTRO}/bom/d_bom_c/1.pdf`));
  });
  it("client_warehouse reads return DDTs of every ASP and nothing else", async () => {
    await allow(read("cw", `documents/${NORD}/ddt_return/d_ret/1.pdf`));
    await allow(read("cw", `documents/${CENTRO}/ddt_return/d_ret_c/1.pdf`));
    await deny(read("cw", `documents/${NORD}/bom/d_bom/1.pdf`));
    await deny(read("cw", `documents/${NORD}/ddt_in/d_ddt/1.pdf`));
  });
  it("inactive users, users in grace and signed out read nothing", async () => {
    await deny(read("inactive", `documents/${NORD}/bom/d_bom/1.pdf`));
    await deny(read("ntGrace", `documents/${NORD}/bom/d_bom/1.pdf`));
    await deny(read(null, `documents/${NORD}/bom/d_bom/1.pdf`));
  });
  it("nobody writes documents from the client (saveDocument callable only)", async () => {
    await deny(put("na", `documents/${NORD}/bom/d_new/1.pdf`, bytes(), { contentType: "application/pdf" }));
    await deny(put("ca", "documents/client/ddt_in/d_new/1.pdf", bytes(), { contentType: "application/pdf" }));
    await deny(remove("ca", `documents/${NORD}/bom/d_bom/1.pdf`));
  });
});

describe("exports and reports (§13.3, §13.4)", () => {
  for (const root of ["exports", "reports"]) {
    const f = (scope: string) => (root === "exports" ? `exports/${scope}/1.xlsx` : `reports/${scope}/2026-09.pdf`);
    it(`${root}: client_admin and client_office read every scope`, async () => {
      for (const uid of ["ca", "co"] as Uid[]) for (const s of ["client", NORD, CENTRO]) await allow(read(uid, f(s)));
    });
    it(`${root}: asp_admin reads its own scope only; other roles nothing`, async () => {
      await allow(read("na", f(NORD)));
      await deny(read("na", f(CENTRO)));
      await deny(read("na", f("client")));
      for (const uid of ["nw", "nt", "cw", "inactive"] as Uid[]) await deny(read(uid, f(NORD)));
      await deny(read(null, f(NORD)));
    });
    it(`${root}: no client writes`, async () => {
      await deny(put("ca", f("client"), bytes(), { contentType: "application/pdf" }));
      await deny(put("na", f(NORD), bytes(), { contentType: "application/pdf" }));
    });
  }
});

describe("everything else is closed", () => {
  it("no read or write outside the known paths", async () => {
    await deny(read("ca", "elsewhere/1.txt"));
    await deny(put("ca", "elsewhere/2.jpg"));
  });
});
