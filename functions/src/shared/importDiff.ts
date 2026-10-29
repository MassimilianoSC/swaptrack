// Pure classification of import rows against existing documents (SPEC §5, §6.1). R19.
export type RowStatus = "new" | "changed" | "unchanged" | "error";

export interface DiffResult<T> {
  index: number;
  key: string;
  status: RowStatus;
  errors: string[];
  changes: string[];
  value: T | null;
}

export function diffRow<T extends Record<string, unknown>>(
  index: number,
  key: string,
  value: T | null,
  errors: string[],
  existing: Record<string, unknown> | undefined,
): DiffResult<T> {
  if (errors.length || !value) return { index, key, status: "error", errors, changes: [], value: null };
  if (!existing) return { index, key, status: "new", errors: [], changes: [], value };
  const changes = Object.keys(value).filter((k) => (existing[k] ?? null) !== (value[k] ?? null));
  return { index, key, status: changes.length ? "changed" : "unchanged", errors: [], changes, value };
}
