import { describe, it, expect, beforeAll } from "vitest";
import { setupTrigger, ev, computeCodeId, RUN, type TriggerEnv } from "./env";

// A piece that is a serial line of a saved document takes the model of that line, even when the reading does not
// name the document (an arrival with no DDT chosen): findModel in trigger.ts looks up expectedCodes by the code the
// server computes. Order: the model picked on the phone (payload.modelId) first, then the document; a DDT before a BOM.
let t: TriggerEnv;
const A = `mdl_TT_mfd_a_${RUN}`, B = `mdl_TT_mfd_b_${RUN}`, C = `mdl_TT_mfd_c_${RUN}`;
const MC = (x: string) => `MCMFD${x}${RUN.toUpperCase()}`;
const item = async (eventId: string) => {
  const id = (await t.db.collection("events").doc(eventId).get()).get("itemId") as string;
  return (await t.db.collection("items").doc(id).get()).data()!;
};
// The line of a saved document, as saveDocument writes it (routers/documents.ts writeExpectedCodes).
const expect_ = (code: string, documentId: string, kind: "ddt_in" | "bom", line: { materialCode?: string; modelId?: string }) =>
  t.db.collection("expectedCodes").doc(`${computeCodeId(code)}_${documentId}`).set({
    codeId: computeCodeId(code), documentId, kind, aspId: "org_asp_nord", locationId: "loc_TT-MAG-NORD",
    materialCode: line.materialCode ?? null, modelId: line.modelId ?? null, direction: kind === "bom" ? "remove" : null,
  });

beforeAll(async () => {
  t = await setupTrigger();
  for (const [id, x, name] of [[A, "A", "Model A"], [B, "B", "Model B"], [C, "C", "Model C"]]) {
    await t.db.collection("models").doc(id).set({ materialCode: MC(x), model: name, manufacturer: "Acme", equipmentType: "Radio unit", active: true });
  }
});

describe("the model of a piece that is a line of a saved document", () => {
  it("an arrival with no DDT chosen takes the model of the DDT line (by its material code)", async () => {
    const code = `SN-${RUN}-MFD-1`;
    await expect_(code, `ddt_mfd1_${RUN}`, "ddt_in", { materialCode: MC("A") });
    const arrival = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
    expect((await t.db.collection("events").doc(arrival).get()).get("payload.ddtId")).toBeUndefined();
    expect(await item(arrival)).toMatchObject({ modelId: A, model: "Model A", needsModel: false });
  });

  it("the model picked on the phone wins over the document", async () => {
    const code = `SN-${RUN}-MFD-2`;
    await expect_(code, `ddt_mfd2_${RUN}`, "ddt_in", { modelId: A });
    const arrival = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new", modelId: B } }));
    expect(await item(arrival)).toMatchObject({ modelId: B, needsModel: false });
  });

  it("a serial in both a BOM and a DDT takes the model of the DDT", async () => {
    const code = `SN-${RUN}-MFD-3`;
    await expect_(code, `bom_mfd3_${RUN}`, "bom", { modelId: C });
    await expect_(code, `ddt_mfd3_${RUN}`, "ddt_in", { modelId: A });
    const arrival = await t.fire(ev("arrive_at_warehouse", code, { payload: { flow: "new" } }));
    expect(await item(arrival)).toMatchObject({ modelId: A, needsModel: false });
  });
});
