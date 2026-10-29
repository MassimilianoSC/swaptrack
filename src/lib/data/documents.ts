import { collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit, Timestamp } from "firebase/firestore";
import { db } from "./firebase";
import type { Row } from "./db";

export interface SwDocument {
  kind: "ddt_in" | "ddt_return" | "bom"; number: string; aspId: string | null; locationId: string;
  files: string[]; lines: Array<Record<string, unknown>>; linesSource: "excel" | "manual"; version: number;
  status: "open" | "checked" | "closed"; createdAt: Timestamp; updatedAt: Timestamp; checkedAt?: Timestamp | null; closedAt?: Timestamp | null;
  duplicateOf?: string | null; shipmentId?: string | null;
}

export const loadDocument = async (id: string): Promise<Row<SwDocument> | null> => {
  const s = await getDoc(doc(db, "documents", id));
  return s.exists() ? ({ id: s.id, ...(s.data() as SwDocument) }) : null;
};

export function watchDocuments(scope: { role: string; orgId: string }, cb: (v: Row<SwDocument>[]) => void) {
  const client = scope.role === "client_admin" || scope.role === "client_office" || scope.role === "client_warehouse";
  const q = client ? query(collection(db, "documents"), orderBy("createdAt", "desc"), limit(500))
    : query(collection(db, "documents"), where("aspId", "==", scope.orgId), orderBy("createdAt", "desc"), limit(500));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as SwDocument) }))));
}

export interface Alert {
  kind: string; aspId: string | null; locationId: string | null; documentId: string | null; shipmentId: string | null;
  detail: Record<string, unknown>; count: number; flow?: "new" | "removed";
  createdAt: Timestamp; updatedAt: Timestamp; seenAt: Timestamp | null; closedAt: Timestamp | null; closedNote: string | null;
}

export function watchAlerts(scope: { role: string; orgId: string }, cb: (v: Row<Alert>[]) => void) {
  const client = scope.role === "client_admin" || scope.role === "client_office";
  const base = collection(db, "alerts");
  if (client) return onSnapshot(query(base, orderBy("updatedAt", "desc"), limit(500)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Alert) }))));
  // §11.4 / §12.4 client_warehouse inbox: return-DDT differences, newest first.
  if (scope.role === "client_warehouse") return onSnapshot(query(base, where("kind", "==", "ddt_return_difference"), orderBy("updatedAt", "desc"), limit(500)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Alert) }))));
  return onSnapshot(query(base, where("aspId", "==", scope.orgId), orderBy("updatedAt", "desc"), limit(500)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Alert) }))));
}

export function watchOpenAlertCount(scope: { role: string; orgId: string }, cb: (n: number) => void) {
  return watchAlerts(scope, (xs) => cb(xs.filter((a) => !a.closedAt).length));
}

export interface Anomaly { type: string; eventId: string | null; itemId: string | null; locationId: string | null; aspId: string | null; detail: unknown; openedAt: Timestamp; resolution: string | null }

export function watchAnomalies(scope: { role: string; orgId: string }, cb: (v: Row<Anomaly>[]) => void) {
  const client = scope.role === "client_admin" || scope.role === "client_office";
  const base = collection(db, "anomalies");
  if (client) return onSnapshot(query(base, orderBy("openedAt", "desc"), limit(500)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Anomaly) }))));
  // §3.3: the client warehouse and technicians do not read anomalies: no subscription (the rules would refuse it).
  if (scope.role === "client_warehouse" || scope.role === "asp_technician") { cb([]); return () => undefined; }
  return onSnapshot(query(base, where("aspId", "==", scope.orgId), limit(500)), (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Anomaly) }))));
}

export interface SwReport { scope: string; month: string; pdfPath: string; xlsxPath: string; createdAt: Timestamp }
export const listReports = async (scope: string): Promise<Row<SwReport>[]> => {
  const s = await getDocs(query(collection(db, "reports"), where("scope", "==", scope), orderBy("createdAt", "desc"), limit(200)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as SwReport) }));
};

export interface SwExport { scope: string; path: string; rowCount: number; createdAt: Timestamp }
export const listMyExports = async (uid: string): Promise<Row<SwExport>[]> => {
  const s = await getDocs(query(collection(db, "exports"), where("createdBy", "==", uid), orderBy("createdAt", "desc"), limit(50)));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as SwExport) }));
};

export interface AggregateDoc { scope: string; dimension: string; shard: number; counts: Record<string, number> }
// §13.1: reads 10 shards, sums the counts. Caller filters by scope and dimension.
export async function readAggregate(scope: string, dimension: string): Promise<Record<string, number>> {
  const totals: Record<string, number> = {};
  const promises: Array<Promise<void>> = [];
  for (let shard = 0; shard < 10; shard++) {
    promises.push(getDoc(doc(db, "aggregates", `${scope}_${dimension}_${shard}`)).then((s) => {
      if (!s.exists()) return;
      const counts = (s.data() as AggregateDoc).counts ?? {};
      for (const [k, v] of Object.entries(counts)) totals[k] = (totals[k] ?? 0) + Number(v || 0);
    }));
  }
  await Promise.all(promises);
  return totals;
}
