import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The emulators never ask for composite indexes; the real project refuses the query ("index required").
// Every query that combines filters with an orderBy or a range lives in this list, with the index it needs.
// Add a line whenever a query of that kind is written in src/lib/data/ or functions/src/ (PIANO P-15).
type Field = [path: string, order: "ASCENDING" | "DESCENDING"];
const NEEDED: Array<{ query: string; collection: string; fields: Field[] }> = [
  // App (src/lib/data/)
  { query: "db.ts recent own events: userId ==, orderBy scannedAt desc", collection: "events", fields: [["userId", "ASCENDING"], ["scannedAt", "DESCENDING"]] },
  { query: "events.ts today's own events: userId ==, scannedAt >=, orderBy scannedAt desc", collection: "events", fields: [["userId", "ASCENDING"], ["scannedAt", "DESCENDING"]] },
  { query: "documents.ts ASP documents: aspId ==, orderBy createdAt desc", collection: "documents", fields: [["aspId", "ASCENDING"], ["createdAt", "DESCENDING"]] },
  { query: "documents.ts client_warehouse alerts: kind ==, orderBy updatedAt desc", collection: "alerts", fields: [["kind", "ASCENDING"], ["updatedAt", "DESCENDING"]] },
  { query: "documents.ts ASP alerts: aspId ==, orderBy updatedAt desc", collection: "alerts", fields: [["aspId", "ASCENDING"], ["updatedAt", "DESCENDING"]] },
  { query: "documents.ts reports: scope ==, orderBy createdAt desc", collection: "reports", fields: [["scope", "ASCENDING"], ["createdAt", "DESCENDING"]] },
  { query: "documents.ts own exports: createdBy ==, orderBy createdAt desc", collection: "exports", fields: [["createdBy", "ASCENDING"], ["createdAt", "DESCENDING"]] },
  { query: "items.ts anomalies of a piece: itemId ==, orderBy openedAt desc", collection: "anomalies", fields: [["itemId", "ASCENDING"], ["openedAt", "DESCENDING"]] },
  { query: "shipments.ts client_warehouse returns: kind ==, orderBy createdAt desc", collection: "shipments", fields: [["kind", "ASCENDING"], ["createdAt", "DESCENDING"]] },
  // Functions (functions/src/)
  { query: "desk events by item: itemId ==, scannedAt range", collection: "events", fields: [["itemId", "ASCENDING"], ["scannedAt", "ASCENDING"]] },
  { query: "desk events by location: locationId ==, scannedAt range", collection: "events", fields: [["locationId", "ASCENDING"], ["scannedAt", "ASCENDING"]] },
  { query: "desk events by ASP: aspId ==, scannedAt range", collection: "events", fields: [["aspId", "ASCENDING"], ["scannedAt", "ASCENDING"]] },
  { query: "graceExpiry: active ==, disabledAt <=", collection: "users", fields: [["active", "ASCENDING"], ["disabledAt", "ASCENDING"]] },
  { query: "retention: scannedAt <, userId != null", collection: "events", fields: [["scannedAt", "ASCENDING"], ["userId", "ASCENDING"]] },
  { query: "dailyChecks new material: status ==, flow ==, lastScannedAt <=", collection: "items", fields: [["status", "ASCENDING"], ["flow", "ASCENDING"], ["lastScannedAt", "ASCENDING"]] },
  { query: "dailyChecks stale pieces: status ==, lastScannedAt <=", collection: "items", fields: [["status", "ASCENDING"], ["lastScannedAt", "ASCENDING"]] },
  { query: "dailyChecks transfers: kind ==, status ==, sentAt <=", collection: "shipments", fields: [["kind", "ASCENDING"], ["status", "ASCENDING"], ["sentAt", "ASCENDING"]] },
  { query: "dailyChecks site_done: locationId ==, type ==, scannedAt >", collection: "events", fields: [["locationId", "ASCENDING"], ["type", "ASCENDING"], ["scannedAt", "ASCENDING"]] },
];

interface Index { collectionGroup: string; queryScope: string; fields: Array<{ fieldPath: string; order?: string }> }
const declared = (JSON.parse(readFileSync(fileURLToPath(new URL("../firestore.indexes.json", import.meta.url)), "utf8")) as { indexes: Index[] }).indexes;
const key = (collection: string, fields: Field[]) => `${collection}: ${fields.map(([p, o]) => `${p} ${o}`).join(", ")}`;
const have = new Set(declared.filter((i) => i.queryScope === "COLLECTION").map((i) => key(i.collectionGroup, i.fields.map((f) => [f.fieldPath, f.order as Field[1]]))));

describe("firestore.indexes.json", () => {
  it.each(NEEDED)("$query", ({ collection, fields }) => {
    expect(have.has(key(collection, fields)), key(collection, fields)).toBe(true);
  });
});
