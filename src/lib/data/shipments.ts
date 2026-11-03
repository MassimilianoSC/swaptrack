// Shipment reads used by desk and field pages (R2). Writes go through call.ts.
import {
  collection, doc, getDoc, getDocs, onSnapshot, query, where, orderBy, limit, Timestamp,
} from "firebase/firestore";
import { db } from "./firebase";
import type { Row } from "./db";

export interface Shipment {
  kind: "return" | "transfer"; fromLocationId: string; fromAspId: string; toLocationId: string; toAspId: string | null;
  ddtNumber: string | null; documentId: string | null; status: "draft" | "sent" | "received" | "confirmed" | "cancelled";
  itemCount: number; createdBy: string; createdAt: Timestamp; sentAt: Timestamp | null; confirmedAt: Timestamp | null;
  receivedAt: Timestamp | null; confirmedComplete: boolean | null;
}
export interface ShipmentLine {
  codeRaw: string; model: string | null; addedAt: Timestamp; arrivedAt?: Timestamp | null;
  confirmedAt?: Timestamp | null; missing?: boolean; fromAspId?: string; toAspId?: string | null; kind?: string;
}

export const loadShipment = async (id: string): Promise<Row<Shipment> | null> => {
  const s = await getDoc(doc(db, "shipments", id));
  return s.exists() ? ({ id: s.id, ...(s.data() as Shipment) }) : null;
};

export function watchShipment(id: string, cb: (v: Row<Shipment> | null) => void) {
  return onSnapshot(doc(db, "shipments", id), (s) => cb(s.exists() ? ({ id: s.id, ...(s.data() as Shipment) }) : null));
}

export function watchLines(id: string, cb: (v: Row<ShipmentLine>[]) => void) {
  const q = query(collection(db, "shipments", id, "lines"), orderBy("addedAt", "asc"));
  return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as ShipmentLine) }))));
}

const ASP_SHIPMENTS_MAX = 200;

// Shipments by sender or receiver ASP (own; client roles see all).
export function watchShipments(scope: { role: string; orgId: string }, cb: (v: Row<Shipment>[]) => void) {
  const client = scope.role === "client_admin" || scope.role === "client_office";
  const col = collection(db, "shipments");
  if (client) {
    const q = query(col, orderBy("createdAt", "desc"), limit(500));
    return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Shipment) }))));
  }
  // §3.3: the client warehouse reads return shipments only (the rules refuse a wider query).
  if (scope.role === "client_warehouse") {
    const q = query(col, where("kind", "==", "return"), orderBy("createdAt", "desc"), limit(500));
    return onSnapshot(q, (s) => cb(s.docs.map((d) => ({ id: d.id, ...(d.data() as Shipment) }))));
  }
  // ASP: merge "from" and "to" subscriptions (Firestore has no OR query here), the latest ASP_SHIPMENTS_MAX of each
  // (P-77). Each side keeps only what its last snapshot holds, so a shipment that leaves a query leaves the list.
  const side = (field: "fromAspId" | "toAspId") => query(col, where(field, "==", scope.orgId), orderBy("createdAt", "desc"), limit(ASP_SHIPMENTS_MAX));
  let from: Row<Shipment>[] = [], to: Row<Shipment>[] = [];
  const push = () => {
    const map = new Map<string, Row<Shipment>>([...from, ...to].map((s) => [s.id, s]));
    cb([...map.values()].sort((a, b) => (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0)));
  };
  const ua = onSnapshot(side("fromAspId"), (s) => { from = s.docs.map((d) => ({ id: d.id, ...(d.data() as Shipment) })); push(); });
  const ub = onSnapshot(side("toAspId"), (s) => { to = s.docs.map((d) => ({ id: d.id, ...(d.data() as Shipment) })); push(); });
  return () => { ua(); ub(); };
}

export const listLinesOnce = async (id: string): Promise<Row<ShipmentLine>[]> => {
  const s = await getDocs(query(collection(db, "shipments", id, "lines")));
  return s.docs.map((d) => ({ id: d.id, ...(d.data() as ShipmentLine) }));
};
