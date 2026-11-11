// Field events (R3): the only documents the client creates. Written without awaiting the server (offline queue).
import { collection, doc, setDoc, serverTimestamp, query, where, orderBy, onSnapshot, getDoc, getDocFromCache, getDocFromServer, getDocsFromCache, getDocs, Timestamp, documentId, startAfter, limit, type Query, type DocumentReference, type DocumentSnapshot, type QuerySnapshot } from "firebase/firestore";
import { db } from "./firebase";
import { computeCodeId, NORM_VERSION, normalizeBarcode } from "../codeId.js";
import { scanInstant } from "../clockOffset.js";

export type Source = "camera" | "wedge" | "manual";
export interface NewEvent {
  type: string; locationId: string; aspId: string; userId: string; orgId: string; source: Source; engine: string | null;
  codeRaw?: string; secondCodeRaw?: string; payload?: Record<string, unknown>;
}

export async function writeEvent(e: NewEvent): Promise<string> {
  const id = crypto.randomUUID();
  const t = scanInstant();
  const data: Record<string, unknown> = {
    type: e.type, locationId: e.locationId, aspId: e.aspId, userId: e.userId, orgId: e.orgId, source: e.source, engine: e.engine,
    normVersion: NORM_VERSION, scannedAt: Timestamp.fromDate(t.scannedAt), clockOffsetMs: t.clockOffsetMs,
    offsetMeasuredAt: t.offsetMeasuredAt ? Timestamp.fromDate(t.offsetMeasuredAt) : null, payload: e.payload ?? {}, createdAt: serverTimestamp(),
  };
  if (e.codeRaw) { data.codeRaw = e.codeRaw; data.codeId = await computeCodeId(e.codeRaw); }
  if (e.secondCodeRaw) data.secondCodeRaw = e.secondCodeRaw;
  // Queued offline. The server's answer comes later (at once online, when the network is back otherwise): a reading the
  // rules refuse disappears from the cache, so it is reported here (P-115, censimento n.23) instead of vanishing.
  void setDoc(doc(db, "events", id), data).catch((err: { code?: string }) => reportRejected({ id, codeRaw: e.codeRaw ?? null, type: e.type, reason: err?.code ?? "unknown" }));
  return id;
}

// Readings refused by the server since the app was opened (this device, this session).
export interface RejectedScan { id: string; codeRaw: string | null; type: string; reason: string }
const rejected: RejectedScan[] = [];
const rejectedListeners = new Set<(all: RejectedScan[]) => void>();
function reportRejected(r: RejectedScan) {
  rejected.push(r);
  rejectedListeners.forEach((cb) => cb([...rejected]));
}
export function watchRejectedScans(cb: (all: RejectedScan[]) => void): () => void {
  rejectedListeners.add(cb);
  cb([...rejected]);
  return () => { rejectedListeners.delete(cb); };
}
export const rejectedScanCount = () => rejected.length;

// R11: only the author's own events of today. `ddtId` (payload) serves the live DDT comparison on the device (§12.2).
export interface MyScan { id: string; type: string; codeRaw?: string; at: Date; pending: boolean; voided?: boolean; locationId?: string; ddtId?: string | null }
export function watchMyScansToday(uid: string, cb: (rows: MyScan[]) => void) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const q = query(collection(db, "events"), where("userId", "==", uid), where("scannedAt", ">=", Timestamp.fromDate(start)), orderBy("scannedAt", "desc"));
  return onSnapshot(q, { includeMetadataChanges: true }, (s) => cb(s.docs.map((d) => ({
    id: d.id, type: d.get("type"), codeRaw: d.get("codeRaw"), at: (d.get("scannedAt") as Timestamp).toDate(), pending: d.metadata.hasPendingWrites, voided: d.get("voided"),
    locationId: d.get("locationId"), ddtId: (d.get("payload") as { ddtId?: string } | undefined)?.ddtId ?? null,
  }))), () => cb([]));
}

// §6.3: the product code is never an identity. Compared on normalized values against the cached catalog (active or not).
export function isProductCode(raw: string, materialCodes: string[]): boolean {
  const n = normalizeBarcode(raw);
  return materialCodes.some((m) => normalizeBarcode(m) === n);
}

// P-78: online first, briefly (a piece created after the cache was loaded is found), else the offline cache
// (no network or weak signal: the answer never waits more than QUICK_MS).
const QUICK_MS = 2000;
// P-155 (D-72): the two reads of a piece (its code, then the piece) share QUICK_MS; the second always has this much.
export const SECOND_READ_MIN_MS = 500;
const late = <T,>(ms = QUICK_MS): Promise<T> => new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), ms));
// D-58 A3: the server for QUICK_MS, else the cache; when the cache was used because the server was late, onLate receives the server's answer
// as soon as it arrives (a DDT or a BOM created after the cache was loaded is not missed until the next load).
function quickDocsLate(q: Query, onLate?: (s: QuerySnapshot) => void): Promise<QuerySnapshot> {
  const server = getDocs(q);
  return Promise.race([server, late<QuerySnapshot>()]).catch(() => {
    if (onLate) server.then((s) => { if (!s.metadata.fromCache) onLate(s); }, () => undefined);
    return getDocsFromCache(q);
  });
}

// Item of a code (codes/items of the ASP, DECISIONS b7): from the server when it answers at once, else from the cache.
// D-71 (P-149b): when the cache was used because the server was late, onLate receives the server's answer as soon as it
// arrives (a piece made after the phone's copy was loaded is known a moment later, with weak signal too).
export async function cachedItemForCode(raw: string, onLate?: (item: Record<string, unknown> | null) => void, onCopyUsed?: () => void): Promise<Record<string, unknown> | null> {
  let cached = false;
  const deadline = Date.now() + QUICK_MS;
  const read = async (ref: DocumentReference, ms: number): Promise<DocumentSnapshot | null> => {
    try { return await Promise.race([getDoc(ref), late<DocumentSnapshot>(ms)]); } catch { cached = true; return getDocFromCache(ref).catch(() => null); }
  };
  const codeRef = doc(db, "codes", await computeCodeId(raw));
  const result = await (async () => {
    const code = await read(codeRef, QUICK_MS);
    const itemId = code?.exists() ? (code.get("itemId") as string | undefined) : undefined;
    if (!itemId) return null;
    const it = await read(doc(db, "items", itemId), Math.max(deadline - Date.now(), SECOND_READ_MIN_MS));
    return it?.exists() ? it.data() : null;
  })().catch(() => null);
  if (cached) onCopyUsed?.();
  if (cached && onLate) {
    void (async () => {
      const code = await getDocFromServer(codeRef);
      const itemId = code.exists() ? (code.get("itemId") as string | undefined) : undefined;
      const it = itemId ? await getDocFromServer(doc(db, "items", itemId)) : null;
      onLate(it?.exists() ? it.data() : null);
    })().catch(() => undefined); // no network: no late answer
  }
  return result;
}

// b7: one query per collection on the ASP's items and codes (current or pending ASP), at sign-in and resume.
// Also pulls the ASP's BOM documents so the technician scan screen can compute the BOM tick list locally (§12.1),
// and its open DDTs so the warehouse scan screen can offer them and compare live (§12.2, P-24).
// DDTs only for the warehouse roles: the rules refuse them to the technician.
// The active model catalog too (SPEC §6.1, §6.4, P-73): picking the model of an unknown piece works offline.
// And the sorting categories and rules (D-58): "Sort" and the arrival of removed material work offline too.
// Returns true only if every query was answered by the server (D-34: the site picker's "updated" time moves only then).
export async function primeFieldCache(orgId: string, role: string): Promise<boolean> {
  const qs = [
    query(collection(db, "items"), where("currentAspId", "==", orgId)), query(collection(db, "items"), where("pendingAspId", "==", orgId)),
    query(collection(db, "codes"), where("aspId", "==", orgId)),
    query(collection(db, "documents"), where("aspId", "==", orgId), where("kind", "==", "bom")),
    query(collection(db, "models"), where("active", "==", true)),
  ];
  if (role === "asp_warehouse" || role === "asp_admin") {
    qs.push(query(collection(db, "documents"), where("aspId", "==", orgId), where("kind", "==", "ddt_in"), where("status", "==", "open")));
    qs.push(query(collection(db, "sortingCategories")), query(collection(db, "sortingRules")));
  }
  // P-78: the big collections (items, codes: thousands of documents) are loaded in pages, one after the other, so the
  // writes of a whole collection into the local cache never hold up the scans in the meantime.
  let ok = true;
  for (const q of qs.slice(0, 3)) ok = (await loadInPages(q)) && ok;
  const rest = await Promise.all(qs.slice(3).map((q) => getDocs(q).then((s) => !s.metadata.fromCache).catch(() => getDocsFromCache(q).then(() => false, () => false))));
  return ok && rest.every(Boolean);
}

const PAGE = 300;
async function loadInPages(q: Query): Promise<boolean> {
  let last: DocumentSnapshot | null = null;
  for (;;) {
    const page = last ? query(q, orderBy(documentId()), startAfter(last), limit(PAGE)) : query(q, orderBy(documentId()), limit(PAGE));
    let s: QuerySnapshot;
    try { s = await getDocs(page); } catch { return false; }
    if (s.metadata.fromCache) return false;
    if (s.size < PAGE) return true;
    last = s.docs[s.docs.length - 1];
    await new Promise((r) => setTimeout(r, 0)); // let the scans queued meanwhile run
  }
}

// §12.2 / P-24: the open DDTs of a warehouse (never chosen by themselves: the user picks one); P-78: a DDT created
// after the cache was loaded is offered too. The aspId filter lets the rules accept the query.
export interface CachedDdt { id: string; number: string; lines: Array<Record<string, unknown>>; createdAtMs: number }
const openDdts = (snap: QuerySnapshot): CachedDdt[] => snap.docs.filter((d) => d.get("status") === "open")
  .map((d) => ({ id: d.id, number: String(d.get("number") ?? ""), lines: (d.get("lines") as Array<Record<string, unknown>>) ?? [],
    createdAtMs: (d.get("createdAt") as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0 }))
  .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
export async function cachedOpenDdtsForWarehouse(locationId: string, orgId: string, onLate?: (list: CachedDdt[]) => void): Promise<CachedDdt[]> {
  try {
    const q = query(collection(db, "documents"), where("aspId", "==", orgId), where("kind", "==", "ddt_in"), where("locationId", "==", locationId), where("status", "==", "open"));
    return openDdts(await quickDocsLate(q, onLate && ((s) => onLate(openDdts(s)))));
  } catch { return []; }
}

// §12.1: BOM for a site, open or checked, highest version (server first, briefly, else the cache: P-78).
export interface CachedBom { id: string; lines: Array<Record<string, unknown>>; createdAtMs: number }
const newestBom = (snap: QuerySnapshot): CachedBom | null => {
  const docs = snap.docs.filter((d) => ["open", "checked"].includes(d.get("status") as string));
  if (!docs.length) return null;
  docs.sort((a, b) => (b.get("version") ?? 0) - (a.get("version") ?? 0));
  const d = docs[0];
  return { id: d.id, lines: (d.get("lines") as Array<Record<string, unknown>>) ?? [], createdAtMs: (d.get("createdAt") as Timestamp | null)?.toMillis?.() ?? 0 };
};
export async function cachedBomForSite(locationId: string, orgId: string, onLate?: (bom: CachedBom | null) => void): Promise<CachedBom | null> {
  try {
    const q = query(collection(db, "documents"), where("aspId", "==", orgId), where("kind", "==", "bom"), where("locationId", "==", locationId));
    return newestBom(await quickDocsLate(q, onLate && ((s) => onLate(newestBom(s)))));
  } catch { return null; }
}

export interface Category { id: string; labels: { it: string; en: string }; active: boolean; order: number }
// fromCache: the answer is the phone's copy, not the server's (D-58: an empty copy means "not downloaded yet").
export async function loadSorting() {
  const read = async (c: string) => {
    const q = query(collection(db, c));
    const s = await getDocs(q).catch(() => getDocsFromCache(q));
    return { docs: s.docs.map((d) => ({ id: d.id, ...d.data() })), fromCache: s.metadata.fromCache };
  };
  const [cats, rules] = await Promise.all([read("sortingCategories"), read("sortingRules")]);
  return { categories: (cats.docs as Category[]).sort((a, b) => a.order - b.order), rules: rules.docs as never[], fromCache: cats.fromCache || rules.fromCache };
}
