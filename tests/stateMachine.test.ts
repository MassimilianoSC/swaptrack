import { describe, it, expect } from "vitest";
import { applyEvent, replay, type MachineEvent, type ItemState, type ReplayEvent } from "../functions/src/shared/stateMachine";
import { suggestCategory, conflictingRule, type SortingRule } from "../functions/src/shared/sorting";

let n = 0;
const ev = (type: string, o: Partial<MachineEvent> = {}): ReplayEvent => ({
  id: `e${++n}`, type, source: "camera", at: n * 1000, createdAt: n * 1000, locationId: "W1", locationType: "asp_warehouse",
  locationAspId: "A", aspId: "A", payload: {}, ...o,
});
const site = (id = "S1", aspId = "A") => ({ locationId: id, locationType: "site", locationAspId: aspId, aspId });
const run = (...es: ReplayEvent[]) => es.reduce<{ s: ItemState | null; a?: string }>((acc, e) => { const r = applyEvent(acc.s, e); return { s: r.state, a: r.anomaly }; }, { s: null });
const sh = (o = {}) => ({ id: "SH", kind: "transfer" as const, fromAspId: "A", toAspId: "A", toLocationId: "W2", ...o });

describe("unknown code: natural state", () => {
  it.each([
    ["remove_at_site", "removed_at_site", undefined, site()],
    ["install_at_site", "installed", "unknown_code_where_known_expected", site()],
    ["arrive_at_warehouse", "received_at_asp", undefined, {}],
    ["transfer_out", "in_transfer", "unknown_code_where_known_expected", {}],
    ["return_ship", "in_return", "unknown_code_where_known_expected", {}],
    ["return_confirm", "returned", "unknown_code_where_known_expected", { source: "server" }],
  ])("%s -> %s", (type, status, anomaly, o) => {
    const r = run(ev(type, o as Partial<MachineEvent>));
    expect(r.s!.status).toBe(status);
    expect(r.a).toBe(anomaly);
  });
  it("classify creates sorted / defective", () => {
    expect(run(ev("classify", { payload: { categoryId: "C" } })).s!.status).toBe("sorted");
    expect(run(ev("classify", { payload: { newClass: "defective" } })).s!.status).toBe("defective");
  });
  it("arrival with category sorts in one pass", () => {
    expect(run(ev("arrive_at_warehouse", { payload: { categoryId: "C" } })).s!.status).toBe("sorted");
  });
  it("classify at site on unknown code is forbidden, no piece created", () => {
    const r = run(ev("classify", { ...site(), payload: { categoryId: "C" } }));
    expect(r.s).toBeNull();
    expect(r.a).toBe("forbidden_transition");
  });
  it("arrive at a site on unknown code is forbidden, no piece created", () => {
    const r = run(ev("arrive_at_warehouse", { ...site() }));
    expect(r.s).toBeNull();
    expect(r.a).toBe("forbidden_transition");
  });
  it("install at a site of another ASP on unknown code is forbidden", () => {
    const r = run(ev("install_at_site", { ...site("S9", "B"), aspId: "A" }));
    expect(r.s).toBeNull();
    expect(r.a).toBe("forbidden_transition");
  });
});

describe("transitions", () => {
  it("installed -> removed_at_site with previousFlow new", () => {
    const r = run(ev("install_at_site", site()), ev("remove_at_site", site("S2")));
    expect(r.s).toMatchObject({ status: "removed_at_site", flow: "removed", previousFlow: "new", siteOfOrigin: "S2" });
  });
  it("removed_at_site -> received -> sorted -> in_return -> returned", () => {
    const r = run(ev("remove_at_site", site()), ev("arrive_at_warehouse"), ev("classify", { payload: { categoryId: "C" } }),
      ev("return_ship", { shipment: sh({ kind: "return", toAspId: null }) }), ev("return_confirm", { source: "server", locationId: "CW", locationType: "client_warehouse" }));
    expect(r.s!.status).toBe("returned");
    expect(r.a).toBeUndefined();
  });
  it("arrival at another warehouse of the same ASP: moved_without_transfer", () => {
    expect(run(ev("arrive_at_warehouse"), ev("arrive_at_warehouse", { locationId: "W2" })).a).toBe("moved_without_transfer");
  });
  it("new defective / leftover re-classification", () => {
    const r = run(ev("arrive_at_warehouse", { payload: { flow: "new" } }), ev("classify", { payload: { newClass: "defective" } }), ev("classify", { payload: { newClass: "leftover" } }));
    expect(r.s!.status).toBe("leftover");
  });
  it("received new -> installed at a site of the same ASP", () => {
    expect(run(ev("arrive_at_warehouse"), ev("install_at_site", site())).s).toMatchObject({ status: "installed", siteOfInstallation: "S1" });
  });
  it("transfer to another ASP: pending, then arrival at destination restores held state", () => {
    const t = sh({ toAspId: "B", toLocationId: "WB" });
    const a = run(ev("remove_at_site", site()), ev("arrive_at_warehouse"), ev("classify", { payload: { categoryId: "C" } }), ev("transfer_out", { shipment: t }));
    expect(a.s).toMatchObject({ status: "in_transfer", pendingAspId: "B", previousStatus: "sorted" });
    const b = applyEvent(a.s, ev("arrive_at_warehouse", { locationId: "WB", aspId: "B", locationAspId: "B", shipment: t }));
    expect(b.state).toMatchObject({ status: "sorted", currentAspId: "B", pendingAspId: null });
    expect(b.anomaly).toBeUndefined();
  });
  it("transfer back at the sender: previousStatus with anomaly", () => {
    const t = sh({ toAspId: "B", toLocationId: "WB" });
    const r = run(ev("arrive_at_warehouse"), ev("transfer_out", { shipment: t }), ev("arrive_at_warehouse", { locationId: "W2", shipment: t }));
    expect(r.s!.status).toBe("received_at_asp");
    expect(r.a).toBe("moved_without_transfer");
  });
  it("in_return piece reappearing at an ASP warehouse", () => {
    const r = run(ev("classify", { payload: { categoryId: "C" } }), ev("return_ship", { shipment: sh({ kind: "return" }) }), ev("arrive_at_warehouse", { locationId: "W2" }));
    expect(r.s!.status).toBe("sorted");
    expect(r.a).toBe("returned_piece_reappeared");
  });
  it("force_state applies status and ASP", () => {
    expect(run(ev("arrive_at_warehouse"), ev("force_state", { source: "server", payload: { status: "defective", aspId: "B" } })).s).toMatchObject({ status: "defective", currentAspId: "B" });
  });
  it("force_state with aspId only clears pendingAspId (code_of_another_asp resolution)", () => {
    // A piece at ASP A, resolved by client_admin to be at ASP B: server force_state(aspId=B) before next event.
    const first = run(ev("arrive_at_warehouse"));
    expect(first.s).toMatchObject({ currentAspId: "A" });
    const r = applyEvent(first.s, ev("force_state", { source: "server", payload: { aspId: "B" } }));
    expect(r.state).toMatchObject({ currentAspId: "B", pendingAspId: null, status: "received_at_asp" });
    // Next arrival at a different warehouse of B: no code_of_another_asp (ASP is now B).
    const next = applyEvent(r.state, ev("arrive_at_warehouse", { locationId: "WB", aspId: "B", locationAspId: "B" }));
    expect(next.anomaly).not.toBe("code_of_another_asp");
    expect(next.state).toMatchObject({ currentAspId: "B", status: "received_at_asp", currentLocationId: "WB" });
  });
  it("relabel leaves state unchanged", () => {
    expect(run(ev("arrive_at_warehouse"), ev("relabel")).s!.status).toBe("received_at_asp");
  });
  it("install new material at a site of the same ASP, then remove at another site: previousFlow new", () => {
    const r = run(ev("arrive_at_warehouse"), ev("install_at_site", site("S1")), ev("remove_at_site", site("S2")));
    expect(r.s).toMatchObject({ status: "removed_at_site", flow: "removed", previousFlow: "new", siteOfOrigin: "S2" });
  });
});

describe("general rules", () => {
  it("repetition at the current location changes nothing", () => {
    const r = run(ev("remove_at_site", site()), ev("remove_at_site", site()));
    expect(r.s!.status).toBe("removed_at_site");
    expect(r.a).toBeUndefined();
  });
  it("another ASP's piece: state and ASP unchanged", () => {
    const r = run(ev("arrive_at_warehouse"), ev("arrive_at_warehouse", { aspId: "B", locationId: "WB" }));
    expect(r.s).toMatchObject({ currentAspId: "A", currentLocationId: "W1" });
    expect(r.a).toBe("code_of_another_asp");
  });
  it("after returned: event_after_end_of_flow", () => {
    expect(run(ev("return_confirm", { source: "server" }), ev("relabel")).a).toBe("event_after_end_of_flow");
  });
  it("pending ASP in transit: destination ASP arrival is not code_of_another_asp", () => {
    const t = sh({ toAspId: "B", toLocationId: "WB" });
    const r = run(ev("arrive_at_warehouse"), ev("transfer_out", { shipment: t }), ev("arrive_at_warehouse", { locationId: "WB", aspId: "B", locationAspId: "B", shipment: t }));
    expect(r.s).toMatchObject({ currentAspId: "B", status: "received_at_asp" });
    expect(r.a).toBeUndefined();
  });
});

describe("forbidden", () => {
  it("return_ship of removed material not sorted", () => { expect(run(ev("remove_at_site", site()), ev("arrive_at_warehouse"), ev("return_ship", { shipment: sh({ kind: "return" }) })).a).toBe("forbidden_transition"); });
  it("install of removed material", () => { expect(run(ev("remove_at_site", site()), ev("arrive_at_warehouse"), ev("install_at_site", site("S2"))).a).toBe("forbidden_transition"); });
  it("install at a site of another ASP", () => { expect(run(ev("arrive_at_warehouse"), ev("install_at_site", { ...site("S9", "B"), aspId: "A" })).a).toBe("forbidden_transition"); });
  it("classify at a site", () => { expect(run(ev("arrive_at_warehouse"), ev("classify", { ...site(), payload: { categoryId: "C" } })).a).toBe("forbidden_transition"); });
  it("installed -> arrive without removal: position moves, state stays", () => {
    const r = run(ev("install_at_site", site()), ev("arrive_at_warehouse"));
    expect(r.s).toMatchObject({ status: "installed", currentLocationId: "W1" });
    expect(r.a).toBe("forbidden_transition");
  });
  it("transfer_out from installed is forbidden", () => {
    expect(run(ev("install_at_site", site()), ev("transfer_out", { shipment: sh() })).a).toBe("forbidden_transition");
  });
  it("return_confirm on an installed piece is forbidden", () => {
    expect(run(ev("install_at_site", site()), ev("return_confirm", { source: "server" })).a).toBe("forbidden_transition");
  });
});

describe("replay (§8.2)", () => {
  it("late removal synced after the arrival takes its place and fills siteOfOrigin", () => {
    const arrival = ev("arrive_at_warehouse", { at: 16_000, createdAt: 16_000 });
    const removal = ev("remove_at_site", { ...site(), at: 10_000, createdAt: 18_000 });
    const r = replay([arrival, removal], removal.id);
    expect(r.state).toMatchObject({ status: "received_at_asp", siteOfOrigin: "S1", currentLocationId: "W1" });
    expect(r.anomaly).toBeUndefined();
  });
  it("voided events are skipped", () => {
    const a = ev("arrive_at_warehouse");
    const c = { ...ev("classify", { payload: { categoryId: "C" } }), voided: true };
    expect(replay([a, c]).state!.status).toBe("received_at_asp");
  });
  it("ties broken by createdAt (ascending), lower is applied first", () => {
    // Two classifications on the same already-sorted piece, same scannedAt: the one with lower createdAt
    // is applied first, so the one with higher createdAt (Y) wins.
    const arrival = ev("arrive_at_warehouse", { at: 0, createdAt: 0, payload: { categoryId: "X" } });
    const a = ev("classify", { at: 1_000, createdAt: 2_000, payload: { categoryId: "Y" } });
    const b = ev("classify", { at: 1_000, createdAt: 1_000, payload: { categoryId: "X" } });
    // Shuffle on input; replay must deterministically order a last.
    expect(replay([a, arrival, b]).state!.sortingCategoryId).toBe("Y");
  });
  it("ties on createdAt broken by id (ascending)", () => {
    const arrival = ev("arrive_at_warehouse", { at: 0, createdAt: 0, payload: { categoryId: "X" } });
    const z = { ...ev("classify", { at: 1_000, createdAt: 1_000, payload: { categoryId: "Z" } }), id: "zzz" };
    const a = { ...ev("classify", { at: 1_000, createdAt: 1_000, payload: { categoryId: "A" } }), id: "aaa" };
    // Lower id applied first; higher id ("zzz") wins.
    expect(replay([z, arrival, a]).state!.sortingCategoryId).toBe("Z");
  });
  it("a late forbidden event raises late_event", () => {
    const inst = ev("install_at_site", { ...site(), at: 5_000 });
    const late = ev("classify", { ...site(), at: 1_000, payload: { categoryId: "C" } });
    expect(replay([inst, late], late.id).anomaly).toBe("late_event");
  });
  it("a focus event with a non-forbidden anomaly keeps that anomaly (not late_event)", () => {
    const first = ev("arrive_at_warehouse", { at: 1_000 });
    // A later arrival by another ASP: code_of_another_asp. It is the focus and is the last event: anomaly stays itself.
    const other = ev("arrive_at_warehouse", { at: 2_000, aspId: "B", locationId: "WB" });
    expect(replay([first, other], other.id).anomaly).toBe("code_of_another_asp");
  });
  it("void by setting voided removes the event from the replay (§8.2)", () => {
    const a = ev("arrive_at_warehouse");
    const b = { ...ev("arrive_at_warehouse", { locationId: "W2" }), voided: true };
    const r = replay([a, b]);
    expect(r.state).toMatchObject({ currentLocationId: "W1" });
    expect(r.anomaly).toBeUndefined();
  });
});

describe("sorting precedence (§10)", () => {
  const R = (id: string, o: Partial<SortingRule>): SortingRule => ({ id, categoryId: id, active: true, ...o });
  const rules = [R("site", { siteId: "S" }), R("type", { equipmentType: "T" }), R("model", { modelId: "M" }), R("siteType", { siteId: "S", equipmentType: "T" }), R("siteModel", { siteId: "S", modelId: "M" })];
  it.each([
    [{ siteId: "S", modelId: "M", equipmentType: "T" }, "siteModel"],
    [{ siteId: "S", modelId: "X", equipmentType: "T" }, "siteType"],
    [{ siteId: "Z", modelId: "M", equipmentType: "T" }, "model"],
    [{ siteId: "Z", modelId: "X", equipmentType: "T" }, "type"],
    [{ siteId: "S", modelId: "X", equipmentType: "Q" }, "site"],
    [{ siteId: "Z", modelId: "X", equipmentType: "Q" }, null],
  ])("%o -> %s", (k, want) => { expect(suggestCategory(rules, k)).toBe(want); });
  it("inactive rules are ignored", () => { expect(suggestCategory([R("m", { modelId: "M", active: false })], { modelId: "M" })).toBeNull(); });
  it("duplicate rule with the same keys is refused", () => {
    expect(conflictingRule(rules, { siteId: "S", modelId: "M", categoryId: "x", active: true })?.id).toBe("siteModel");
    expect(conflictingRule(rules, { siteId: "S", modelId: "N", categoryId: "x", active: true })).toBeNull();
  });
});
