import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus, Trash2, ClipboardPaste } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { newRow, rowError, rowsFromPaste, rowsToText, linesFromRows, countLines, type LineRow, type Direction } from "@/lib/documents/lines";

// P-223 (tester, 20/11): the lines of a document as an editable table (Quantity, Article code, Serial number), the same
// for typing, for the lines read from an Excel and for those proposed by the automatic reading. A serial makes the
// quantity 1 and locks it; an empty row is ignored; the errors are said under their row once "Save" was pressed; a field
// the automatic reading did not recognise is empty and highlighted. "Paste lines" takes several at once (§11.2).
// data-lines-text: the valid lines as the text the boxes had ("SERIAL CODE", "#3 CODE"), for the tests.
export interface LinesTableProps {
  testId: string;
  title: string;
  rows: LineRow[];
  onChange: (rows: LineRow[]) => void;
  readOnly: boolean;
  showErrors: boolean;
  direction?: Direction;
  materialCodes?: ReadonlySet<string>;
  // The table of the BOM lines without direction: each row is moved to one of the two tables.
  onAssign?: (row: LineRow, direction: Direction) => void;
  warning?: boolean;
}

export function LinesTable(p: LinesTableProps) {
  const { t } = useTranslation();
  const [pasting, setPasting] = React.useState(false);
  const [pasteText, setPasteText] = React.useState("");
  const set = (id: string, patch: Partial<LineRow>, field: "quantity" | "materialCode" | null) => p.onChange(p.rows.map((r) => {
    if (r.id !== id) return r;
    const next = { ...r, ...patch };
    // A serial is one piece: quantity 1, locked; without it the quantity can be changed again.
    if (patch.serial !== undefined && patch.serial.trim()) next.quantity = "1";
    const missing = (r.missing ?? []).filter((m) => m !== field && !(field === null && m === "materialCode" && patch.serial?.trim()));
    return { ...next, missing: missing.length ? missing : undefined };
  }));
  const remove = (id: string) => p.onChange(p.rows.filter((r) => r.id !== id));
  const add = () => p.onChange([...p.rows, newRow(p.direction)]);
  const applyPaste = () => {
    const rows = rowsFromPaste(pasteText, p.direction, p.materialCodes);
    // Pasted rows take the place of the empty rows (the one ready to be filled).
    p.onChange([...p.rows.filter((r) => r.serial.trim() || r.materialCode.trim() || r.missing?.length || (r.quantity.trim() && r.quantity.trim() !== "1")), ...rows]);
    setPasteText(""); setPasting(false);
  };
  const valid = linesFromRows(p.rows.filter((r) => !rowError(r)));
  const cell = (bad: boolean) => cn("w-full rounded border bg-surface px-2 min-h-touch text-sm font-mono disabled:opacity-60", bad ? "border-danger bg-danger/10" : "border-border");

  return (
    <section className={cn("space-y-2", p.warning && "rounded border border-warning p-2")} data-testid={p.testId} data-lines-text={rowsToText(p.rows)}>
      <h3 className="font-semibold text-sm">{p.title}</h3>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted">
              <th className="w-20 py-1 pr-2 font-medium">{t("documents.colQuantity")}</th>
              <th className="py-1 pr-2 font-medium">{t("documents.colCode")}</th>
              <th className="py-1 pr-2 font-medium">{t("documents.colSerial")}</th>
              {!p.readOnly && <th className="w-10" aria-label={t("documents.rowActions")} />}
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => {
              const err = p.showErrors ? rowError(r) : null;
              const missQ = r.missing?.includes("quantity"), missC = r.missing?.includes("materialCode");
              const hasSerial = !!r.serial.trim();
              return (
                <React.Fragment key={r.id}>
                  <tr data-testid={`${p.testId}-row`} data-error={err ?? undefined}>
                    <td className="py-1 pr-2 align-top">
                      <input aria-label={t("documents.colQuantity")} inputMode="numeric" value={hasSerial ? "1" : r.quantity} disabled={p.readOnly || hasSerial}
                        onChange={(e) => set(r.id, { quantity: e.target.value }, "quantity")} className={cell(err === "quantity" || err === "serialQuantity" || !!missQ)} data-testid={`${p.testId}-qty`} data-missing={missQ || undefined} />
                    </td>
                    <td className="py-1 pr-2 align-top">
                      <input aria-label={t("documents.colCode")} value={r.materialCode} readOnly={p.readOnly}
                        onChange={(e) => set(r.id, { materialCode: e.target.value }, "materialCode")} className={cell(err === "codeOrSerial" || !!missC)} data-testid={`${p.testId}-code`} data-missing={missC || undefined} />
                    </td>
                    <td className="py-1 pr-2 align-top">
                      <input aria-label={t("documents.colSerial")} value={r.serial} readOnly={p.readOnly}
                        onChange={(e) => set(r.id, { serial: e.target.value }, null)} className={cell(err === "codeOrSerial")} data-testid={`${p.testId}-serial`} />
                    </td>
                    {!p.readOnly && (
                      <td className="py-1 align-top">
                        <Button type="button" variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label={t("documents.rowRemove")} data-testid={`${p.testId}-delete`}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    )}
                  </tr>
                  {(err || p.onAssign) && (
                    <tr>
                      <td colSpan={4} className="pb-2">
                        {err && <p className="text-xs text-danger" data-testid={`${p.testId}-error`}>{t(`documents.rowError.${err}`)}</p>}
                        {p.onAssign && !p.readOnly && (
                          <div className="flex gap-2">
                            <Button type="button" size="sm" variant="secondary" onClick={() => p.onAssign!(r, "install")} data-testid={`${p.testId}-to-install`}>{t("documents.toInstall")}</Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => p.onAssign!(r, "remove")} data-testid={`${p.testId}-to-remove`}>{t("documents.toRemove")}</Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {p.rows.length === 0 && <p className="text-xs text-muted" data-testid={`${p.testId}-empty`}>{t("documents.noRows")}</p>}
      {/* P-169: how the lines are read, before saving (serials and lines without a serial). */}
      {valid.length > 0 && <p className="text-xs text-muted tabular" data-testid={`${p.testId}-summary`}>{t("documents.linesSummary", countLines(valid))}</p>}
      {!p.readOnly && !p.onAssign && (
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={add} data-testid={`${p.testId}-add`}><Plus className="h-4 w-4" />{t("documents.addRow")}</Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setPasting((x) => !x)} aria-expanded={pasting} data-testid={`${p.testId}-paste`}><ClipboardPaste className="h-4 w-4" />{t("documents.pasteRows")}</Button>
        </div>
      )}
      {pasting && !p.readOnly && (
        <div className="space-y-2 rounded border border-border p-2">
          <p className="text-xs text-muted">{t("documents.pasteHint")}</p>
          <Textarea rows={6} value={pasteText} onChange={(e) => setPasteText(e.target.value)} className="font-mono text-xs" aria-label={t("documents.pasteRows")} data-testid={`${p.testId}-paste-text`} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => { setPasting(false); setPasteText(""); }}>{t("common.cancel")}</Button>
            <Button type="button" size="sm" onClick={applyPaste} disabled={!pasteText.trim()} data-testid={`${p.testId}-paste-apply`}>{t("documents.pasteApply")}</Button>
          </div>
        </div>
      )}
    </section>
  );
}
