// D-68 (P-139): what a reading would do to a piece the phone already knows, judged with the server's own state machine
// (functions/src/shared/stateMachine.ts), so that the phone and the server never disagree except on an old cache.
// "here": the reading changes nothing (same place, same state): it is sent, the session does not count it as new.
// "conflict": the server would open an anomaly: the worker is warned in red; the reading is sent all the same.
import { applyEvent, type ItemState, type MachineEvent, type Status } from "@shared/stateMachine";

export type Judgement = "here" | "conflict" | null;

type Millis = { toMillis?: () => number } | number | null | undefined;
const ms = (v: Millis): number => (typeof v === "number" ? v : v?.toMillis?.() ?? 0);

// The piece as the phone sees it (an items document) in the shape of the state machine.
export function itemState(it: Record<string, unknown> | null): ItemState | null {
  if (!it || !it.status) return null;
  const s = (k: string) => (it[k] as string | null | undefined) ?? null;
  return {
    status: it.status as Status, statusSince: ms(it.statusSince as Millis), flow: (s("flow") ?? "new") as ItemState["flow"],
    previousFlow: s("previousFlow") as ItemState["previousFlow"], previousStatus: s("previousStatus") as Status | null,
    currentLocationId: s("currentLocationId"), currentLocationType: s("currentLocationType"), currentAspId: s("currentAspId"),
    pendingAspId: s("pendingAspId"), shipmentId: s("shipmentId"), sortingCategoryId: s("sortingCategoryId"),
    siteOfOrigin: s("siteOfOrigin"), siteOfInstallation: s("siteOfInstallation"), lastEventId: s("lastEventId"),
    lastScannedAt: ms(it.lastScannedAt as Millis) || null,
  };
}

export function judge(prev: ItemState | null, e: MachineEvent): Judgement {
  if (!prev) return null; // a new piece: nothing to say
  const r = applyEvent(prev, e);
  if (r.anomaly) return "conflict";
  const next = r.state;
  if (!next) return null;
  const same = next.status === prev.status && next.currentLocationId === prev.currentLocationId && next.currentAspId === prev.currentAspId
    && next.pendingAspId === prev.pendingAspId && next.shipmentId === prev.shipmentId && next.sortingCategoryId === prev.sortingCategoryId;
  return same ? "here" : null;
}
