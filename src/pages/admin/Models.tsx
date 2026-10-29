import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus, Upload } from "lucide-react";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { listModels, type Row, type Model } from "@/lib/data/db";
import { DataTable } from "@/components/DataTable";
import { Badge, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Checkbox } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loading, ErrorState, Empty } from "@/components/states";

type M = Row<Model>;
const blank: Model = { materialCode: "", model: "", manufacturer: "", equipmentType: "", active: true };

function EditDialog({ item, onClose, onSaved }: { item: M | "new" | null; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [f, setF] = React.useState<Model>(blank);
  const isNew = item === "new";
  React.useEffect(() => { setF(item && item !== "new" ? { ...blank, ...item } : blank); }, [item]);
  const set = (k: keyof Model) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (await run(() => call("saveModel", { ...f, isNew }), t("common.saved"))) { onSaved(); onClose(); }
  };
  return (
    <Dialog open={!!item} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t(isNew ? "models.new" : "models.edit")}>
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("models.materialCode")} htmlFor="m-code"><Input id="m-code" className="font-mono" value={f.materialCode} onChange={set("materialCode")} disabled={!isNew} required data-testid="model-code-input" /></Field>
          <Field label={t("models.model")} htmlFor="m-model"><Input id="m-model" value={f.model} onChange={set("model")} required data-testid="model-name-input" /></Field>
          <Field label={t("models.manufacturer")} htmlFor="m-man"><Input id="m-man" value={f.manufacturer} onChange={set("manufacturer")} data-testid="model-manufacturer-input" /></Field>
          <Field label={t("models.equipmentType")} htmlFor="m-type"><Input id="m-type" value={f.equipmentType} onChange={set("equipmentType")} data-testid="model-type-input" /></Field>
          <Checkbox id="m-active" label={t("common.active")} checked={f.active} onChange={(v) => setF({ ...f, active: v })} testId="model-active-checkbox" />
          <div className="flex justify-end"><Button type="submit" disabled={busy} data-testid="model-save-button">{t("common.save")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Models() {
  const { t } = useTranslation();
  const [list, setList] = React.useState<M[] | null>(null);
  const [error, setError] = React.useState(false);
  const [edit, setEdit] = React.useState<M | "new" | null>(null);
  const load = React.useCallback(() => { setError(false); listModels().then(setList).catch(() => setError(true)); }, []);
  React.useEffect(load, [load]);
  if (error) return <ErrorState message={t("errors.load_failed")} onRetry={load} />;
  if (!list) return <Loading />;
  return (
    <div>
      <PageHeader title={t("nav.models")} subtitle={t("models.subtitle")} actions={<>
        <Button variant="secondary" asChild><Link to="/admin/models/import" data-testid="models-import-button"><Upload className="h-4 w-4" /> {t("import.title")}</Link></Button>
        <Button onClick={() => setEdit("new")} data-testid="models-new-button"><Plus className="h-4 w-4" /> {t("models.new")}</Button>
      </>} />
      <DataTable testId="models-table" rows={list}
        empty={<Empty title={t("models.empty")} hint={t("models.emptyHint")} action={<Button onClick={() => setEdit("new")}>{t("models.new")}</Button>} />}
        columns={[
          { key: "materialCode", header: t("models.materialCode"), className: "font-mono" },
          { key: "model", header: t("models.model") },
          { key: "manufacturer", header: t("models.manufacturer") },
          { key: "equipmentType", header: t("models.equipmentType") },
          { key: "active", header: t("common.status"), value: (m) => (m.active ? 1 : 0), render: (m) => <Badge tone={m.active ? "success" : "neutral"}>{t(m.active ? "common.active" : "common.inactive")}</Badge> },
          { key: "actions", header: "", render: (m) => <Button size="sm" variant="secondary" onClick={() => setEdit(m)} data-testid={`model-edit-${m.id}`}>{t("common.edit")}</Button> },
        ]} />
      <EditDialog item={edit} onClose={() => setEdit(null)} onSaved={load} />
    </div>
  );
}
