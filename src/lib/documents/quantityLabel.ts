// P-192: a quantity line of a document comparison in words. The «Compare» result showed its technical key
// ("modelId|materialCode|direction", functions/src/shared/documents.ts), for example "|MC400170|: 0/3". Here: the
// material code, with the model's name when the catalog knows it, and in a BOM whether the pieces are removed or
// installed. Pure, so a unit test can check it.
import { normalizeBarcode } from "../codeId.js";

export interface QuantityRow { materialCode?: string | null; modelId?: string | null; direction?: "remove" | "install"; expected: number; counted: number }
export interface CatalogModel { id: string; materialCode?: string | null; model?: string | null }
export type Translate = (key: string, options?: Record<string, unknown>) => string;

// The catalog by model id and by normalized material code.
export function catalogIndex(models: CatalogModel[]) {
  return {
    byId: new Map(models.map((m) => [m.id, m])),
    byCode: new Map(models.filter((m) => m.materialCode).map((m) => [normalizeBarcode(m.materialCode) as string, m])),
  };
}

export function quantityLabel(q: QuantityRow, t: Translate, catalog: ReturnType<typeof catalogIndex>): string {
  const m = (q.modelId ? catalog.byId.get(q.modelId) : undefined) ?? (q.materialCode ? catalog.byCode.get(normalizeBarcode(q.materialCode) as string) : undefined);
  const code = (q.materialCode ?? "").trim() || (m?.materialCode ?? "").trim();
  const name = (m?.model ?? "").trim();
  const what = code && name ? `${code} (${name})` : code || name || t("documents.quantityNoCode");
  const counts = { what, counted: q.counted, expected: q.expected };
  return q.direction ? t("documents.quantityLineDir", { ...counts, direction: t(`documents.quantityDirection.${q.direction}`) }) : t("documents.quantityLine", counts);
}
