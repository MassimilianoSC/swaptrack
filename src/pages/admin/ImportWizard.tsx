import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchDoc, listLocations, listModels } from "@/lib/data/db";
import { readTable, type Sheet } from "@/lib/import/readTable";
import { locationIdFor, modelIdFor } from "@shared/policy";
import { Card, PageHeader, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Select, Checkbox } from "@/components/ui/form";
import { DataTable } from "@/components/DataTable";

type Kind = "locations" | "models";
const FIELDS: Record<Kind, string[]> = {
  locations: ["code", "name", "type", "asp", "address", "region"],
  models: ["materialCode", "model", "manufacturer", "equipmentType"],
};
const REQUIRED: Record<Kind, string[]> = { locations: ["code", "name", "type"], models: ["materialCode", "model"] };
const OP = { locations: "importLocations", models: "importModels" } as const;
const CHUNK = 500;

interface Result { index: number; key: string; status: "new" | "changed" | "unchanged" | "error"; errors: string[]; unknownAsp?: string | null }

// §5 / §6.1 import: mapping (saved and reused), preview, explicit confirm, chunks of 500, never deletes.
export default function ImportWizard({ kind }: { kind: Kind }) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [mapping, setMapping] = React.useState<Record<string, string>>({});
  const [results, setResults] = React.useState<Result[] | null>(null);
  const [done, setDone] = React.useState<number | null>(null);
  const [missing, setMissing] = React.useState<{ id: string; label: string }[]>([]);
  const [toDeactivate, setToDeactivate] = React.useState<Set<string>>(new Set());
  const [importId] = React.useState(() => crypto.randomUUID());
  const [saved, setSaved] = React.useState<Record<string, string>>({});

  React.useEffect(() => watchDoc<Record<string, Record<string, string>>>("settings/importMappings", (v) => setSaved(v?.[kind] ?? {})), [kind]);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const s = await run(() => readTable(file));
    if (!s) return;
    setSheet(s); setResults(null); setDone(null);
    const m: Record<string, string> = {};
    FIELDS[kind].forEach((f) => { const h = saved[f]; if (h && s.headers.includes(h)) m[f] = h; else if (s.headers.includes(f)) m[f] = f; });
    setMapping(m);
  };

  const rows = React.useMemo(() => {
    if (!sheet) return [];
    const idx = Object.fromEntries(FIELDS[kind].map((f) => [f, sheet.headers.indexOf(mapping[f] ?? "")]));
    return sheet.rows.map((r) => Object.fromEntries(FIELDS[kind].map((f) => [f, idx[f] >= 0 ? (r[idx[f]] ?? "").trim() : ""])));
  }, [sheet, mapping, kind]);

  const chunks = async (mode: "preview" | "commit") => {
    const all: Result[] = [];
    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const r = await call<{ results?: Result[]; written?: number }>(OP[kind], { mode, importId, rows: rows.slice(i, i + CHUNK) });
      (r.results ?? []).forEach((x) => all.push({ ...x, index: x.index + i }));
      written += r.written ?? 0;
    }
    return { all, written };
  };

  const preview = () => run(async () => {
    await call("saveSettings", { name: "importMappings", value: { [kind]: mapping } });
    setResults((await chunks("preview")).all);
  });

  const commit = () => run(async () => {
    const { written } = await chunks("commit");
    setDone(written);
    const keys = new Set(rows.map((r) => (kind === "locations" ? (r.code ? locationIdFor(r.code) : "") : (r.materialCode ? modelIdFor(r.materialCode) : ""))));
    const existing = kind === "locations" ? (await listLocations()).map((l) => ({ id: l.id, active: l.active, label: `${l.code} · ${l.name}` }))
      : (await listModels()).map((m) => ({ id: m.id, active: m.active, label: `${m.materialCode} · ${m.model}` }));
    setMissing(existing.filter((e) => e.active && !keys.has(e.id)));
  }, t("import.committed"));

  const deactivate = () => run(async () => {
    const ids = [...toDeactivate];
    for (let i = 0; i < ids.length; i += CHUNK) await call(OP[kind], { mode: "deactivate", importId, ids: ids.slice(i, i + CHUNK) });
    setMissing(missing.filter((m) => !toDeactivate.has(m.id)));
    setToDeactivate(new Set());
  }, t("common.saved"));

  const count = (s: string) => results?.filter((r) => r.status === s).length ?? 0;
  const unknownAsps = [...new Set((results ?? []).map((r) => r.unknownAsp).filter(Boolean))] as string[];
  const ready = REQUIRED[kind].every((f) => mapping[f]);

  return (
    <div className="space-y-6 max-w-5xl">
      <PageHeader title={t(`import.title_${kind}`)} subtitle={t("import.subtitle")} actions={<Button variant="secondary" asChild><Link to={`/admin/${kind}`} data-testid="import-back">{t("common.back")}</Link></Button>} />
      <Card className="space-y-3">
        <h2 className="font-semibold">1. {t("import.chooseFile")}</h2>
        <input type="file" accept=".xlsx,.csv,.txt" aria-label={t("import.chooseFile")} onChange={(e) => onFile(e.target.files?.[0])} data-testid="import-file-input" className="text-sm" />
        {sheet && <p className="text-sm text-muted tabular" data-testid="import-row-count">{t("common.rows", { count: sheet.rows.length })}</p>}
      </Card>
      {sheet && (
        <Card className="space-y-3">
          <h2 className="font-semibold">2. {t("import.mapping")}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {FIELDS[kind].map((f) => (
              <Field key={f} label={`${t(`import.fields.${f}`)}${REQUIRED[kind].includes(f) ? " *" : ""}`} htmlFor={`map-${f}`}>
                <Select id={`map-${f}`} value={mapping[f] ?? ""} onChange={(e) => setMapping({ ...mapping, [f]: e.target.value })} data-testid={`import-map-${f}`}>
                  <option value="">{t("import.notMapped")}</option>
                  {sheet.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </Select>
              </Field>
            ))}
          </div>
          {kind === "locations" && <p className="text-xs text-muted">{t("import.typeValues")}</p>}
          <Button disabled={!ready || busy} onClick={preview} data-testid="import-preview-button">{t("import.preview")}</Button>
        </Card>
      )}
      {results && done === null && (
        <Card className="space-y-4">
          <h2 className="font-semibold">3. {t("import.previewTitle")}</h2>
          <div className="flex flex-wrap gap-2" data-testid="import-summary">
            {(["new", "changed", "unchanged", "error"] as const).map((s) => <Badge key={s} tone={s === "error" ? "danger" : s === "new" ? "success" : "neutral"}>{t(`import.status.${s}`)}: {count(s)}</Badge>)}
          </div>
          {unknownAsps.length > 0 && <p className="text-sm text-danger" data-testid="import-unknown-asps">{t("import.unknownAsps")}: {unknownAsps.join(", ")}</p>}
          <DataTable testId="import-errors-table" rows={results.filter((r) => r.status === "error").map((r) => ({ ...r, id: String(r.index) }))} pageSize={10}
            columns={[
              { key: "index", header: t("import.row"), value: (r) => r.index + 2 },
              { key: "errors", header: t("import.problems"), value: (r) => r.errors.map((e) => t(`errors.${e}`, { defaultValue: e })).join(", ") },
            ]} />
          <Button disabled={busy || count("new") + count("changed") === 0} onClick={commit} data-testid="import-commit-button">{t("import.confirm", { count: count("new") + count("changed") })}</Button>
        </Card>
      )}
      {done !== null && (
        <Card className="space-y-4" data-testid="import-done">
          <h2 className="font-semibold">{t("import.doneTitle", { count: done })}</h2>
          {missing.length === 0 ? <p className="text-sm text-muted">{t("import.noMissing")}</p> : (
            <>
              <p className="text-sm">{t("import.missingHint", { count: missing.length })}</p>
              <div className="max-h-80 overflow-y-auto border border-border rounded p-2" data-testid="import-missing-list">
                {missing.slice(0, 1000).map((m) => (
                  <Checkbox key={m.id} id={`miss-${m.id}`} label={m.label} checked={toDeactivate.has(m.id)}
                    onChange={(v) => { const s = new Set(toDeactivate); if (v) s.add(m.id); else s.delete(m.id); setToDeactivate(s); }} />
                ))}
              </div>
              <Button variant="danger" disabled={busy || toDeactivate.size === 0} onClick={deactivate} data-testid="import-deactivate-button">{t("import.deactivate", { count: toDeactivate.size })}</Button>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
