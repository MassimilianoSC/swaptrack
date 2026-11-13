// P-205 (census by role): the locations import asked for the internal values "site, asp_warehouse, client_warehouse".
// A person writes "Sito", "Magazzino ASP", "Magazzino cliente" (or the English names): they are read as those values.
// Case, spaces, dashes and underscores do not matter. Unknown: null (the import says "invalid type"). Pure.
export type LocationType = "site" | "asp_warehouse" | "client_warehouse";

const NAMES: Record<string, LocationType> = {
  "site": "site", "sito": "site",
  "asp warehouse": "asp_warehouse", "magazzino asp": "asp_warehouse",
  "client warehouse": "client_warehouse", "magazzino cliente": "client_warehouse", "magazzino del cliente": "client_warehouse",
};

export function locationTypeOf(raw: string | null | undefined): LocationType | null {
  const key = String(raw ?? "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
  return NAMES[key] ?? null;
}
