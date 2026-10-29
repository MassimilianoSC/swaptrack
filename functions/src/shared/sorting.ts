// Sorting precedence (SPEC §10). Pure (R19).
export interface SortingRule { id: string; siteId?: string | null; modelId?: string | null; equipmentType?: string | null; categoryId: string; active: boolean }
export interface PieceKeys { siteId?: string | null; modelId?: string | null; equipmentType?: string | null }

// site + model > site + equipment type > model > equipment type > site > none.
export function specificity(r: Pick<SortingRule, "siteId" | "modelId" | "equipmentType">): number {
  const s = !!r.siteId, m = !!r.modelId, t = !!r.equipmentType;
  if (s && m) return 6;
  if (s && t) return 5;
  if (m) return 4;
  if (t) return 3;
  if (s) return 2;
  return 0;
}

function matches(r: SortingRule, k: PieceKeys): boolean {
  if (r.siteId && r.siteId !== k.siteId) return false;
  if (r.modelId && r.modelId !== k.modelId) return false;
  if (r.equipmentType && r.equipmentType !== k.equipmentType) return false;
  return true;
}

export function suggestCategory(rules: SortingRule[], k: PieceKeys): string | null {
  let best: SortingRule | null = null;
  for (const r of rules) {
    if (!r.active || !matches(r, k) || specificity(r) === 0) continue;
    if (!best || specificity(r) > specificity(best)) best = r;
  }
  return best?.categoryId ?? null;
}

// Same specificity and same keys as an existing active rule -> refused.
export function conflictingRule(rules: SortingRule[], candidate: Omit<SortingRule, "id"> & { id?: string }): SortingRule | null {
  const key = (r: PieceKeys) => `${r.siteId ?? ""}|${r.modelId ?? ""}|${r.equipmentType ?? ""}`;
  return rules.find((r) => r.active && r.id !== candidate.id && key(r) === key(candidate)) ?? null;
}
