// State machine of a piece (SPEC §9.2). Pure, no Firebase imports (R19).
export type Status = "removed_at_site" | "received_at_asp" | "sorted" | "installed" | "defective" | "leftover" | "in_transfer" | "in_return" | "returned";
export type Flow = "new" | "removed";

export interface ItemState {
  status: Status; statusSince: number; flow: Flow; previousFlow: Flow | null; previousStatus: Status | null;
  currentLocationId: string | null; currentLocationType: string | null; currentAspId: string | null; pendingAspId: string | null;
  shipmentId: string | null; sortingCategoryId: string | null; siteOfOrigin: string | null; siteOfInstallation: string | null;
  lastEventId: string | null; lastScannedAt: number | null;
}

export interface ShipmentInfo { id: string; kind: "transfer" | "return"; fromAspId: string; toAspId: string | null; toLocationId: string }

export interface MachineEvent {
  id: string; type: string; source: string; at: number; locationId: string; locationType: string; locationAspId: string | null;
  aspId: string | null; payload: Record<string, unknown>; shipment?: ShipmentInfo | null;
}

export type Anomaly = "unknown_code_where_known_expected" | "code_of_another_asp" | "forbidden_transition" | "moved_without_transfer"
  | "event_after_end_of_flow" | "returned_piece_reappeared";

export interface Result { state: ItemState | null; anomaly?: Anomaly }

const HELD: Status[] = ["sorted", "defective", "leftover"];
const POSITION = ["remove_at_site", "install_at_site", "arrive_at_warehouse"];

function base(e: MachineEvent, status: Status, flow: Flow): ItemState {
  return {
    status, statusSince: e.at, flow, previousFlow: null, previousStatus: null, currentLocationId: e.locationId, currentLocationType: e.locationType,
    currentAspId: e.aspId, pendingAspId: null, shipmentId: null, sortingCategoryId: null, siteOfOrigin: null, siteOfInstallation: null,
    lastEventId: e.id, lastScannedAt: e.at,
  };
}

// Unknown code: the piece is created in the natural state of the event (§9.2).
// classify / return_confirm at wrong locations are kept but create nothing: forbidden_transition, state stays null.
function create(e: MachineEvent): Result {
  const p = e.payload;
  const unknown: Anomaly = "unknown_code_where_known_expected";
  switch (e.type) {
    case "remove_at_site": return { state: { ...base(e, "removed_at_site", "removed"), siteOfOrigin: e.locationId } };
    case "install_at_site":
      if (e.locationAspId && e.aspId && e.locationAspId !== e.aspId) return { state: null, anomaly: "forbidden_transition" };
      return { state: { ...base(e, "installed", "new"), siteOfInstallation: e.locationId }, anomaly: unknown };
    case "arrive_at_warehouse": {
      if (e.locationType === "site") return { state: null, anomaly: "forbidden_transition" };
      const s = base(e, p.categoryId ? "sorted" : "received_at_asp", (p.flow as Flow) ?? "new");
      return { state: { ...s, sortingCategoryId: (p.categoryId as string) ?? null } };
    }
    case "classify": {
      if (e.locationType === "site") return { state: null, anomaly: "forbidden_transition" };
      if (p.newClass) return { state: base(e, p.newClass as Status, "new"), anomaly: unknown };
      return { state: { ...base(e, "sorted", "removed"), sortingCategoryId: (p.categoryId as string) ?? null }, anomaly: unknown };
    }
    case "transfer_out": return { state: { ...base(e, "in_transfer", "new"), previousStatus: "received_at_asp", shipmentId: e.shipment?.id ?? null, pendingAspId: pending(e) }, anomaly: unknown };
    case "return_ship": return { state: { ...base(e, "in_return", "removed"), previousStatus: "sorted", shipmentId: e.shipment?.id ?? null }, anomaly: unknown };
    case "return_confirm": return { state: base(e, "returned", "removed"), anomaly: unknown };
    case "force_state": return { state: base(e, (p.status as Status) ?? "received_at_asp", "removed") };
    default: return { state: base(e, "received_at_asp", "new"), anomaly: unknown };
  }
}

const pending = (e: MachineEvent) => (e.shipment?.toAspId && e.shipment.toAspId !== e.shipment.fromAspId ? e.shipment.toAspId : null);

export function applyEvent(prev: ItemState | null, e: MachineEvent): Result {
  if (!prev) return create(e);
  const s: ItemState = { ...prev, lastEventId: e.id, lastScannedAt: e.at };
  const to = (status: Status, extra: Partial<ItemState> = {}): Result => ({
    state: { ...s, ...extra, status, statusSince: status !== prev.status ? e.at : prev.statusSince },
  });
  const moveTo = (): Partial<ItemState> => ({ currentLocationId: e.locationId, currentLocationType: e.locationType });
  const forbidden = (move: boolean): Result => ({ state: { ...s, ...(move ? moveTo() : {}) }, anomaly: "forbidden_transition" });
  const p = e.payload;

  if (e.type === "force_state") {
    return to((p.status as Status) ?? prev.status, {
      ...(p.aspId ? { currentAspId: p.aspId as string, pendingAspId: null } : {}),
      ...(p.locationId ? { currentLocationId: p.locationId as string, currentLocationType: e.locationType } : {}),
    });
  }
  if (prev.status === "returned") return { state: prev, anomaly: "event_after_end_of_flow" };
  if (e.type === "relabel") return { state: s };
  if (e.source !== "server" && e.aspId && prev.currentAspId && e.aspId !== prev.currentAspId && prev.pendingAspId !== e.aspId) {
    return { state: prev, anomaly: "code_of_another_asp" };
  }
  // Repetition at the current location changes nothing (except sorting during arrival).
  const sameLoc = e.locationId === prev.currentLocationId;
  if (POSITION.includes(e.type) && sameLoc && !(e.type === "arrive_at_warehouse" && p.categoryId && prev.status === "received_at_asp")) {
    return { state: s };
  }

  switch (e.type) {
    case "remove_at_site":
      if (prev.status === "installed") return to("removed_at_site", { ...moveTo(), currentAspId: e.aspId, flow: "removed", previousFlow: "new", siteOfOrigin: e.locationId });
      return forbidden(true);
    case "install_at_site":
      if (prev.status === "received_at_asp" && prev.flow === "new" && e.locationAspId === prev.currentAspId) {
        return to("installed", { ...moveTo(), siteOfInstallation: e.locationId });
      }
      return forbidden(true);
    case "arrive_at_warehouse": {
      const cat = (p.categoryId as string) ?? null;
      const arrived = cat ? { status: "sorted" as Status, extra: { sortingCategoryId: cat } } : { status: "received_at_asp" as Status, extra: {} };
      if (prev.status === "removed_at_site") return to(arrived.status, { ...moveTo(), currentAspId: e.aspId, ...arrived.extra });
      if (prev.status === "received_at_asp") {
        if (sameLoc && cat) return to("sorted", { sortingCategoryId: cat });
        return { ...to("received_at_asp", moveTo()), anomaly: "moved_without_transfer" };
      }
      if (prev.status === "in_transfer") {
        const sh = e.shipment;
        const back = prev.previousStatus ?? "received_at_asp";
        const clear = { pendingAspId: null, shipmentId: null, previousStatus: null };
        const atDest = !!sh && e.locationId === sh.toLocationId;
        const backAtSender = !!sh && !atDest && !!sh.toAspId && sh.toAspId !== sh.fromAspId && e.aspId === sh.fromAspId;
        if (sh && !backAtSender) {
          const r = to(HELD.includes(back) ? back : "received_at_asp", { ...moveTo(), ...clear, currentAspId: e.aspId });
          return atDest ? r : { ...r, anomaly: "moved_without_transfer" };
        }
        return { ...to(back, { ...moveTo(), ...clear }), anomaly: "moved_without_transfer" };
      }
      if (prev.status === "in_return") {
        return { ...to(prev.previousStatus ?? "received_at_asp", { ...moveTo(), shipmentId: null, previousStatus: null }), anomaly: "returned_piece_reappeared" };
      }
      if (HELD.includes(prev.status)) return { ...to(prev.status, moveTo()), anomaly: "moved_without_transfer" };
      return forbidden(true);
    }
    case "classify":
      if (e.locationType === "site") return forbidden(false);
      if (p.categoryId && (prev.status === "sorted" || (prev.status === "received_at_asp" && prev.flow === "removed"))) {
        return to("sorted", { sortingCategoryId: p.categoryId as string });
      }
      if (p.newClass && (prev.status === "defective" || prev.status === "leftover" || (prev.status === "received_at_asp" && prev.flow === "new"))) {
        return to(p.newClass as Status);
      }
      return forbidden(false);
    case "transfer_out":
      if (prev.status === "received_at_asp" || HELD.includes(prev.status)) {
        return to("in_transfer", { previousStatus: prev.status, shipmentId: e.shipment?.id ?? null, pendingAspId: pending(e) });
      }
      return forbidden(false);
    case "return_ship":
      if (HELD.includes(prev.status)) return to("in_return", { previousStatus: prev.status, shipmentId: e.shipment?.id ?? null });
      return forbidden(false);
    case "return_confirm":
      if (prev.status === "in_return" || prev.status === "received_at_asp" || HELD.includes(prev.status)) {
        return to("returned", { ...moveTo(), pendingAspId: null, previousStatus: null });
      }
      return forbidden(false);
    default:
      return { state: s };
  }
}

export interface ReplayEvent extends MachineEvent { createdAt: number; voided?: boolean }

// §8.2: order by scannedAtEffective, then createdAt (ascending), then id; voided events are skipped.
export function orderEvents<T extends ReplayEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => a.at - b.at || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export function replay(events: ReplayEvent[], focusId?: string): { state: ItemState | null; anomaly?: Anomaly | "late_event" } {
  const ordered = orderEvents(events).filter((e) => !e.voided);
  let state: ItemState | null = null;
  let anomaly: Anomaly | "late_event" | undefined;
  ordered.forEach((e, i) => {
    const r = applyEvent(state, e);
    state = r.state;
    if (e.id === focusId && r.anomaly) {
      // §8.2: late_event only when a late event meets a forbidden transition during replay.
      anomaly = r.anomaly === "forbidden_transition" && i < ordered.length - 1 ? "late_event" : r.anomaly;
    }
  });
  return { state, anomaly };
}
