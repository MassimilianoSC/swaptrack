import * as React from "react";
import { useTranslation } from "react-i18next";
import { call } from "@/lib/data/call";
import { loadDocumentMapping, type SwDocument } from "@/lib/data/documents";
import type { Sheet } from "@/lib/import/readTable";
import { linesFromSheet, distinctValues, ALL_REMOVE, ALL_INSTALL, type DocLine, type LineMapping } from "@/lib/documents/lines";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/form";

// §11.2 / P-105: the column-mapping step of an Excel/CSV document. The mapping saved for the ASP is the starting
// point, else the client's default (documentMappings/{kind}_client); applying it saves it again for the one who reads
// (an ASP for itself, client_admin the default) and hands the lines to the page, still to be confirmed.
export function ExcelMapping({ sheet, kind, scope, onApply, onCancel }: {
  sheet: Sheet; kind: SwDocument["kind"]; scope: string;
  onApply: (r: { lines: DocLine[]; skipped: number }) => void; onCancel: () => void;
}) {
  const { t } = useTranslation();
  const bom = kind === "bom";
  const [map, setMap] = React.useState<LineMapping>({});
  // P-128: the saved mapping may arrive after the user has chosen some columns (slow network): it fills only the
  // fields the user has not touched, and the page says it is still coming.
  const touched = React.useRef(new Set<string>());
  const [loadingSaved, setLoadingSaved] = React.useState(true);
  React.useEffect(() => {
    let gone = false;
    setLoadingSaved(true);
    void (async () => {
      const saved = (scope !== "client" ? await loadDocumentMapping(kind, scope) : null) ?? await loadDocumentMapping(kind, "client");
      // A saved column that this file does not have is left empty.
      const fit = Object.fromEntries(Object.entries(saved ?? {}).filter(([k, v]) => !["serial", "materialCode", "quantity", "direction"].includes(k) || sheet.headers.includes(v) || v === ALL_REMOVE || v === ALL_INSTALL));
      if (gone) return;
      setMap((m) => {
        const out: LineMapping = { ...m };
        for (const [k, v] of Object.entries(fit)) if (!touched.current.has(k)) (out as Record<string, string>)[k] = v;
        return out;
      });
      setLoadingSaved(false);
    })().catch(() => { if (!gone) setLoadingSaved(false); });
    return () => { gone = true; };
  }, [kind, scope, sheet]);

  const set = (k: keyof LineMapping, v: string) => { touched.current.add(k); setMap((m) => ({ ...m, [k]: v || undefined })); };
  const columns = (k: keyof LineMapping, label: string) => (
    <Field label={label} htmlFor={`xm-${k}`}>
      <Select id={`xm-${k}`} value={map[k] ?? ""} onChange={(e) => set(k, e.target.value)} data-testid={`excel-map-${k}`}>
        <option value="">{t("documents.excelNone")}</option>
        {k === "direction" && <><option value={ALL_REMOVE}>{t("documents.excelAllRemove")}</option><option value={ALL_INSTALL}>{t("documents.excelAllInstall")}</option></>}
        {sheet.headers.filter(Boolean).map((h) => <option key={h} value={h}>{h}</option>)}
      </Select>
    </Field>
  );
  const values = distinctValues(sheet, map.direction && !map.direction.startsWith("*") ? map.direction : undefined);
  const result = linesFromSheet(sheet, map, bom);
  const ready = (!!map.serial || (!!map.materialCode && !!map.quantity)) && (!bom || !!map.direction);
  const apply = async () => {
    const mapping = Object.fromEntries(Object.entries(map).filter(([, v]) => !!v)) as Record<string, string>;
    // The mapping is kept for the next file even if saving it fails: the lines are what matters now.
    await call("saveDocumentMapping", { kind, scope, mapping }).catch(() => undefined);
    onApply(result);
  };

  return (
    <div className="space-y-3 rounded border border-border p-3" data-testid="excel-mapping">
      <h2 className="font-semibold">{t("documents.excelTitle")}</h2>
      <p className="text-sm text-muted">{t("documents.excelHint")}</p>
      {loadingSaved && <p className="text-xs text-muted" data-testid="excel-map-loading">{t("documents.excelLoadingSaved")}</p>}
      <div className="grid gap-3 md:grid-cols-3">
        {columns("serial", t("documents.excelSerial"))}
        {columns("materialCode", t("documents.excelMaterialCode"))}
        {columns("quantity", t("documents.excelQuantity"))}
        {bom && columns("direction", t("documents.excelDirection"))}
        {bom && values.length > 0 && (
          <>
            <Field label={t("documents.excelRemoveValue")} htmlFor="xm-rv"><Select id="xm-rv" value={map.removeValue ?? ""} onChange={(e) => set("removeValue", e.target.value)} data-testid="excel-map-removeValue">
              <option value="">{t("documents.excelNone")}</option>{values.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select></Field>
            <Field label={t("documents.excelInstallValue")} htmlFor="xm-iv"><Select id="xm-iv" value={map.installValue ?? ""} onChange={(e) => set("installValue", e.target.value)} data-testid="excel-map-installValue">
              <option value="">{t("documents.excelNone")}</option>{values.map((v) => <option key={v} value={v}>{v}</option>)}
            </Select></Field>
          </>
        )}
      </div>
      <p className="text-sm tabular" data-testid="excel-map-count">{t("documents.excelCount", { count: result.lines.length, skipped: result.skipped })}</p>
      <div className="flex gap-2">
        <Button type="button" onClick={() => void apply()} disabled={!ready || result.lines.length === 0} data-testid="excel-map-apply">{t("documents.excelApply")}</Button>
        <Button type="button" variant="ghost" onClick={onCancel} data-testid="excel-map-cancel">{t("common.cancel")}</Button>
      </div>
    </div>
  );
}
