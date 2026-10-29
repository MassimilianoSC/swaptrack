// Firestore reads used by pages (R2). Every write that is not an event goes through call.ts (R3).
import {
  collection, doc, getDocs, getDocsFromCache, onSnapshot, query, where, orderBy, limit, waitForPendingWrites,
  type DocumentData, type QueryConstraint,
} from "firebase/firestore";
import { db } from "./firebase";
import { isClientRole } from "@shared/roles";

export type Row<T = DocumentData> = T & { id: string };
const rows = <T>(snap: { docs: { id: string; data(): DocumentData }[] }) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as T) }));

export function watchDoc<T>(path: string, cb: (v: Row<T> | null) => void, onError?: (e: Error) => void) {
  return onSnapshot(doc(db, path), (s) => cb(s.exists() ? ({ id: s.id, ...(s.data() as T) }) : null), (e) => onError?.(e));
}

export function watchQuery<T>(col: string, constraints: QueryConstraint[], cb: (v: Row<T>[]) => void, onError?: (e: Error) => void) {
  return onSnapshot(query(collection(db, col), ...constraints), (s) => cb(rows<T>(s)), (e) => onError?.(e));
}

export async function listQuery<T>(col: string, constraints: QueryConstraint[] = []): Promise<Row<T>[]> {
  return rows<T>(await getDocs(query(collection(db, col), ...constraints)));
}

// ---- Domain shapes ----
export interface Organization { name: string; type: "client" | "asp"; language: "it" | "en"; active: boolean }
export interface UserProfile {
  email: string | null; firstName: string | null; lastName: string | null; role: string; orgId: string; active: boolean;
  language: "it" | "en"; privacyNoticeVersion: number | null; deleted?: boolean; disabledAt?: unknown;
}
export interface Location {
  code: string; name: string; type: "client_warehouse" | "asp_warehouse" | "site"; aspId: string | null;
  address: string; region: string; active: boolean;
}
export interface Model { materialCode: string; model: string; manufacturer: string; equipmentType: string; active: boolean }
export interface AdminLogEntry { actor: string; action: string; target: string | null; at?: { toDate(): Date }; details?: Record<string, unknown> }

export const listOrganizations = () => listQuery<Organization>("organizations");
export const watchOrganizations = (cb: (v: Row<Organization>[]) => void, err?: (e: Error) => void) => watchQuery<Organization>("organizations", [], cb, err);
export const watchUsers = (orgId: string | null, cb: (v: Row<UserProfile>[]) => void, err?: (e: Error) => void) =>
  watchQuery<UserProfile>("users", orgId ? [where("orgId", "==", orgId)] : [], cb, err);
export const watchProfile = (uid: string, cb: (v: Row<UserProfile> | null) => void) => watchDoc<UserProfile>(`users/${uid}`, cb);
export const listLocations = () => listQuery<Location>("locations");
// §3.3: client roles read every location; ASP roles only their own and the client warehouses. A query without
// those filters is refused by the rules for ASP roles, so desk pages used by ASP roles go through here.
export async function listLocationsFor(scope: { role: string; orgId: string }): Promise<Row<Location>[]> {
  if (isClientRole(scope.role)) return listLocations();
  const [own, client] = await Promise.all([
    listQuery<Location>("locations", [where("aspId", "==", scope.orgId)]),
    listQuery<Location>("locations", [where("type", "==", "client_warehouse")]),
  ]);
  const seen = new Set<string>();
  return [...own, ...client].filter((l) => !seen.has(l.id) && seen.add(l.id));
}
export const listModels = () => listQuery<Model>("models");
export const listAdminLog = () => listQuery<AdminLogEntry>("adminLog", [orderBy("at", "desc"), limit(300)]);

// §5: the field loads the locations of its ASP with ONE query at sign-in and at resume; offline it uses the cache.
export async function loadFieldLocations(orgId: string): Promise<{ list: Row<Location>[]; fromCache: boolean }> {
  const q = query(collection(db, "locations"), where("aspId", "==", orgId));
  try {
    return { list: rows<Location>(await getDocs(q)), fromCache: false };
  } catch {
    return { list: rows<Location>(await getDocsFromCache(q)), fromCache: true };
  }
}

// Pending own events (written offline, not yet acknowledged by the server).
export function watchPendingEvents(uid: string, cb: (n: number) => void) {
  const q = query(collection(db, "events"), where("userId", "==", uid), orderBy("scannedAt", "desc"), limit(500));
  return onSnapshot(q, { includeMetadataChanges: true }, (s) => cb(s.docs.filter((d) => d.metadata.hasPendingWrites).length), () => cb(0));
}

export const flushPendingWrites = () => waitForPendingWrites(db);
