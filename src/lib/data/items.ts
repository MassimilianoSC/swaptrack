// Item and shipment reads used by desk pages (R2). Writes go through call.ts.
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import { computeCodeId } from "@/lib/codeId.js";
import type { Row } from "./db";

export interface Item {
  flow: "new" | "removed"; previousFlow?: "new" | "removed" | null; modelId: string | null; materialCode: string | null;
  model: string | null; manufacturer: string | null; equipmentType: string | null; condition?: string | null; extra?: Record<string, unknown>;
  status: string; statusSince?: Timestamp; previousStatus?: string | null;
  currentLocationId: string | null; currentLocationType: string | null; currentAspId: string | null; pendingAspId: string | null;
  shipmentId: string | null; sortingCategoryId: string | null; siteOfOrigin: string | null; siteOfInstallation: string | null;
  lastEventId: string | null; lastScannedAt?: Timestamp; needsModel: boolean; photoPaths?: string[]; mergedInto?: string | null;
}

export interface Code { raw: string; norm: string; itemId: string; aspId: string | null; active: boolean; replacedBy: string | null }

export const loadItem = async (id: string): Promise<Row<Item> | null> => {
  const s = await getDoc(doc(db, "items", id));
  return s.exists() ? ({ id: s.id, ...(s.data() as Item) }) : null;
};

// onError: a read the rules refuse (a piece of another ASP) reports an error instead of staying silent.
export function watchItem(id: string, cb: (v: Row<Item> | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(doc(db, "items", id), (s) => cb(s.exists() ? ({ id: s.id, ...(s.data() as Item) }) : null), (e) => onError?.(e));
}

// §13.1 / §13.2 (P-101): filters of the items list; every one is an equality, the list is ordered by last reading.
export interface ItemFilters { status?: string; aspId?: string; locationId?: string; modelId?: string }
export const ITEMS_PAGE = 200;

// Watches the items of the current ASP (always its own: the rules refuse anything else) or, for client roles, all
// items or those of one ASP. Each filter has its own index (field, lastScannedAt desc) in firestore.indexes.json:
// Firestore merges them for any combination of filters.
export function watchItems(scope: { role: string; orgId: string }, filters: ItemFilters, max: number, cb: (v: Row<Item>[]) => void, onError?: (e: Error) => void) {
  const client = scope.role === "client_admin" || scope.role === "client_office" || scope.role === "client_warehouse";
  const asp = client ? filters.aspId : scope.orgId;
  const q = query(collection(db, "items"),
    ...(asp ? [where("currentAspId", "==", asp)] : []),
    ...(filters.status ? [where("status", "==", filters.status)] : []),
    ...(filters.locationId ? [where("currentLocationId", "==", filters.locationId)] : []),
    ...(filters.modelId ? [where("modelId", "==", filters.modelId)] : []),
    orderBy("lastScannedAt", "desc"), limit(max));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Item) }))), (e) => onError?.(e));
}

// §6.4 / §12.2: "to complete" list — pieces with needsModel: true, warehouse and client roles.
export function watchToComplete(scope: { role: string; orgId: string }, cb: (v: Row<Item>[]) => void) {
  const base = collection(db, "items");
  const client = scope.role === "client_admin" || scope.role === "client_office" || scope.role === "client_warehouse";
  const q = client ? query(base, where("needsModel", "==", true), limit(500)) : query(base, where("currentAspId", "==", scope.orgId), where("needsModel", "==", true), limit(500));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Item) }))));
}

// Lookup an item by any of its codes (serial or replacement label).
// D-58 B2: a code that could not be checked with the server (no network) is "not available", never "not found".
export class LookupUnavailable extends Error {}
const checked = <T,>(p: Promise<T>): Promise<T> => p.catch((e: { code?: string }) => { throw e?.code === "unavailable" ? new LookupUnavailable() : e; });

export async function searchItemByCode(raw: string): Promise<Row<Item> | null> {
  if (!raw.trim()) return null;
  const codeId = await computeCodeId(raw.trim());
  const s = await checked(getDoc(doc(db, "codes", codeId)));
  if (!s.exists()) { if (s.metadata.fromCache) throw new LookupUnavailable(); return null; }
  const itemId = s.get("itemId") as string | undefined;
  if (!itemId) return null;
  const it = await checked(getDoc(doc(db, "items", itemId)));
  if (!it.exists()) { if (it.metadata.fromCache) throw new LookupUnavailable(); return null; }
  return { id: it.id, ...(it.data() as Item) };
}

// All codes attached to an item (for the detail page).
export const listCodesOf = async (itemId: string): Promise<Row<Code>[]> => {
  const s = await getDocs(query(collection(db, "codes"), where("itemId", "==", itemId)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as Code) }));
};

// Anomalies tied to an item.
export const listAnomaliesOf = async (itemId: string) => {
  const s = await getDocs(query(collection(db, "anomalies"), where("itemId", "==", itemId), orderBy("openedAt", "desc"), limit(50)));
  return s.docs.map((d) => ({ id: d.id, ...d.data() })) as Array<Record<string, unknown> & { id: string }>;
};
