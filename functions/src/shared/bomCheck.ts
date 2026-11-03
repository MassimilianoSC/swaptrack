// §11.3 BOM check: on site_done, and by the daily job for sites with scans and no site_done in the last 24h.
import { db } from "../core/admin";
import { alertId } from "./alertIds";
import { upsertAlert, zeroAlertIfOpen } from "../core/alerts";
import { compareDocument, documentAlert, type Line, type EventFact } from "./documents";
import { getSettings } from "../core/settings";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export async function bomCheckForSite(locationId: string, aspId: string): Promise<void> {
  // Find the latest open BOM document for this site + ASP (if any).
  const q = await db.collection("documents")
    .where("kind", "==", "bom")
    .where("locationId", "==", locationId)
    .where("status", "in", ["open", "checked"])
    .get();
  const docs = q.docs.filter((x) => !aspId || x.get("aspId") === aspId);
  if (!docs.length) return;
  // Pick the newest BOM (highest version wins).
  docs.sort((a, b) => (b.get("version") ?? 0) - (a.get("version") ?? 0));
  const bomSnap = docs[0];
  const bom = bomSnap.data();
  const bomStart = (bom.createdAt?.toMillis?.() ?? 0) as number;
  const lines = (bom.lines as Line[]) ?? [];
  const evSnap = await db.collection("events").where("locationId", "==", locationId).get();
  // §8.2: voided scans are out of the replay, so they are out of the comparison too.
  const relevantEvs = evSnap.docs.filter((e) => ["remove_at_site", "install_at_site"].includes(e.get("type") as string) && !e.get("voided")
    && (e.get("scannedAt")?.toMillis?.() ?? 0) >= bomStart);
  const facts: EventFact[] = await Promise.all(relevantEvs.map(async (x) => {
    const e = x.data() as Doc;
    const item = e.itemId ? (await db.collection("items").doc(e.itemId).get()).data() : null;
    return { type: e.type, codeId: e.codeId ?? null, codeRaw: e.codeRaw ?? null, materialCode: item?.materialCode ?? null, modelId: item?.modelId ?? null, itemModelKnown: !!item && !item.needsModel };
  }));
  const r = compareDocument("bom", bomSnap.id, lines, facts);
  const silentUnexpected = (await getSettings("fieldPolicy")).pieceAtSiteNotInBom === "accept_silently";
  const { count, detail } = documentAlert(r, { silentUnexpected });
  if (count > 0) {
    await upsertAlert(alertId.bom(bomSnap.id), { kind: "bom_difference", aspId: bom.aspId ?? null, locationId, documentId: bomSnap.id, shipmentId: null,
      detail, count });
  } else {
    await zeroAlertIfOpen(alertId.bom(bomSnap.id), detail);
  }
}
