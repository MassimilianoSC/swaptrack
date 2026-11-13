// P-205 (census by role): the piece page showed internal ids: the title "Pezzo 3f2a9c1b" (the start of the item id),
// "Unito in <item id>" and, next to a replaced label, "(→ <codeId>)" (a hash). Here the codes a person reads instead.
// Pure, so a unit test can check that no id reaches the screen.
export interface CodeRow { id: string; raw: string; active: boolean; replacedBy?: string | null }
export type Translate = (key: string, options?: Record<string, unknown>) => string;

// The code that names a piece: its active label (the newest replacement), else the first code it had.
export function pieceCode(codes: CodeRow[]): string | null {
  return codes.find((c) => c.active)?.raw ?? codes[0]?.raw ?? null;
}

// Next to a label no longer in use: the label that replaced it, read from the piece's own codes.
export function replacedByText(code: CodeRow, codes: CodeRow[], t: Translate): string {
  const next = code.replacedBy ? codes.find((c) => c.id === code.replacedBy) : undefined;
  return next ? t("items.replacedBy", { code: next.raw }) : t("items.replaced");
}
