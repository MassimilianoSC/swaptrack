// Field events (R3): the only documents the client creates. Written without awaiting the server (offline queue).
import { collection, doc, setDoc, serverTimestamp, query, where, orderBy, onSnapshot, getDocFromCache, getDocsFromCache, getDocs, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import { computeCodeId, NORM_VERSION, normalizeBarcode } from "@/lib/codeId.js";
import { scanInstant } from "@/lib/clockOffset.js";

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
  void setDoc(doc(db, "events", id), data).catch(() => undefined); // queued offline; rejected writes surface as never-acknowledged
  return id;
}

// R11: only the author's own events of today.
export function watchMyScansToday(uid: string, cb: (rows: { id: string; type: string; codeRaw?: string; at: Date; pending: boolean; voided?: boolean }[]) => void) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const q = query(collection(db, "events"), where("userId", "==", uid), where("scannedAt", ">=", Timestamp.fromDate(start)), orderBy("scannedAt", "desc"));
  return onSnapshot(q, { includeMetadataChanges: true }, (s) => cb(s.docs.map((d) => ({
    id: d.id, type: d.get("type"), codeRaw: d.get("codeRaw"), at: (d.get("scannedAt") as Timestamp).toDate(), pending: d.metadata.hasPendingWrites, voided: d.get("voided"),
  }))), () => cb([]));
}

// §6.3: the product code is never an identity. Compared on normalized values against the cached catalog (active or not).
export function isProductCode(raw: string, materialCodes: string[]): boolean {
  const n = normalizeBarcode(raw);
  return materialCodes.some((m) => normalizeBarcode(m) === n);
}

// Item of a code from the offline cache (codes/items of the ASP loaded at sign-in, DECISIONS b7).
export async function cachedItemForCode(raw: string): Promise<Record<string, unknown> | null> {
  try {
    const code = await getDocFromCache(doc(db, "codes", await computeCodeId(raw)));
    const itemId = code.get("itemId");
    if (!itemId) return null;
    const it = await getDocFromCache(doc(db, "items", itemId));
    return it.exists() ? it.data() : null;
  } catch { return null; }
}

// b7: one query per collection on the ASP's items and codes (current or pending ASP), at sign-in and resume.
// Also pulls the ASP's BOM documents so the technician scan screen can compute the BOM tick list locally (§12.1).
export async function primeFieldCache(orgId: string): Promise<void> {
  const qs = [
    query(collection(db, "items"), where("currentAspId", "==", orgId)), query(collection(db, "items"), where("pendingAspId", "==", orgId)),
    query(collection(db, "codes"), where("aspId", "==", orgId)),
    query(collection(db, "documents"), where("aspId", "==", orgId), where("kind", "==", "bom")),
  ];
  await Promise.all(qs.map((q) => getDocs(q).catch(() => getDocsFromCache(q))));
}

// §12.1: BOM for a site read from the local cache. Open or checked, highest version.
export async function cachedBomForSite(locationId: string): Promise<{ id: string; lines: Array<Record<string, unknown>>; createdAtMs: number } | null> {
  try {
    const q = query(collection(db, "documents"), where("kind", "==", "bom"), where("locationId", "==", locationId));
    const snap = await getDocsFromCache(q);
    const docs = snap.docs.filter((d) => ["open", "checked"].includes(d.get("status") as string));
    if (!docs.length) return null;
    docs.sort((a, b) => (b.get("version") ?? 0) - (a.get("version") ?? 0));
    const d = docs[0];
    return { id: d.id, lines: (d.get("lines") as Array<Record<string, unknown>>) ?? [], createdAtMs: (d.get("createdAt") as Timestamp | null)?.toMillis?.() ?? 0 };
  } catch { return null; }
}

export interface Category { id: string; labels: { it: string; en: string }; active: boolean; order: number }
export async function loadSorting() {
  const read = async (c: string) => {
    const q = query(collection(db, c));
    const s = await getDocs(q).catch(() => getDocsFromCache(q));
    return s.docs.map((d) => ({ id: d.id, ...d.data() }));
  };
  const [cats, rules] = await Promise.all([read("sortingCategories"), read("sortingRules")]);
  return { categories: (cats as Category[]).sort((a, b) => a.order - b.order), rules: rules as never[] };
}
