// Batched reads for the monthly report and the export (§13.3, §13.4): names and labels instead of internal ids.
import { db } from "./admin";
import type { Lang } from "../shared/reportStrings";
import type { PlaceInfo } from "../shared/reportData";

type Doc = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

// id -> data for the given ids of a collection (missing documents are left out).
export async function docsByIds(col: string, ids: Iterable<string>): Promise<Record<string, Doc>> {
  const unique = [...new Set([...ids].filter(Boolean))];
  const out: Record<string, Doc> = {};
  for (let i = 0; i < unique.length; i += 300) {
    const snaps = await db.getAll(...unique.slice(i, i + 300).map((id) => db.collection(col).doc(id)));
    for (const s of snaps) if (s.exists) out[s.id] = s.data()!;
  }
  return out;
}

export async function placesByIds(ids: Iterable<string>): Promise<Record<string, PlaceInfo>> {
  const docs = await docsByIds("locations", ids);
  return Object.fromEntries(Object.entries(docs).map(([id, l]) => [id, { code: l.code ?? id, name: l.name ?? "", type: l.type ?? "" }]));
}

export async function orgNames(): Promise<Record<string, string>> {
  const snap = await db.collection("organizations").get();
  return Object.fromEntries(snap.docs.map((d) => [d.id, (d.get("name") as string) ?? d.id]));
}

// Sorting category labels in the given language (§10: labels {it, en}).
export async function categoryLabels(lang: Lang): Promise<Record<string, string>> {
  const snap = await db.collection("sortingCategories").get();
  return Object.fromEntries(snap.docs.map((d) => {
    const labels = (d.get("labels") ?? {}) as Record<string, string>;
    return [d.id, labels[lang] ?? labels.it ?? labels.en ?? d.id];
  }));
}
