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

export function watchItem(id: string, cb: (v: Row<Item> | null) => void) {
  return onSnapshot(doc(db, "items", id), (s) => cb(s.exists() ? ({ id: s.id, ...(s.data() as Item) }) : null));
}

// Watches items scoped to the current ASP (own) or all (client).
export function watchItems(scope: { role: string; orgId: string }, cb: (v: Row<Item>[]) => void, max = 500) {
  const base = collection(db, "items");
  const client = scope.role === "client_admin" || scope.role === "client_office" || scope.role === "client_warehouse";
  const q = client ? query(base, limit(max)) : query(base, where("currentAspId", "==", scope.orgId), limit(max));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Item) }))));
}

// §6.4 / §12.2: "to complete" list — pieces with needsModel: true, warehouse and client roles.
export function watchToComplete(scope: { role: string; orgId: string }, cb: (v: Row<Item>[]) => void) {
  const base = collection(db, "items");
  const client = scope.role === "client_admin" || scope.role === "client_office" || scope.role === "client_warehouse";
  const q = client ? query(base, where("needsModel", "==", true), limit(500)) : query(base, where("currentAspId", "==", scope.orgId), where("needsModel", "==", true), limit(500));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Item) }))));
}

// Lookup an item by any of its codes (serial or replacement label).
export async function searchItemByCode(raw: string): Promise<Row<Item> | null> {
  if (!raw.trim()) return null;
  const codeId = await computeCodeId(raw.trim());
  const s = await getDoc(doc(db, "codes", codeId));
  if (!s.exists()) return null;
  const itemId = s.get("itemId") as string | undefined;
  return itemId ? loadItem(itemId) : null;
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
