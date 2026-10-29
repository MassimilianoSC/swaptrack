import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { loadSorting, type Category } from "@/lib/data/events";
import { listModels, type Row, type Model } from "@/lib/data/db";
import { locationIdFor } from "@shared/policy";
import type { SortingRule } from "@shared/sorting";
import { DataTable } from "@/components/DataTable";
import { PageHeader, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Checkbox } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loading } from "@/components/states";

// §10: sorting categories and rules, configured by client_admin.
export default function Sorting() {
  const { t, i18n } = useTranslation();
  const { busy, run } = useAction();
  const [data, setData] = React.useState<{ categories: Category[]; rules: SortingRule[] } | null>(null);
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  const [cat, setCat] = React.useState<Partial<Category> | null>(null);
  const [rule, setRule] = React.useState<(Partial<SortingRule> & { siteCode?: string }) | null>(null);
  const load = React.useCallback(() => { void loadSorting().then((d) => setData(d as never)); void listModels().then(setModels); }, []);
  React.useEffect(load, [load]);
  if (!data) return <Loading />;
  const label = (id?: string | null) => data.categories.find((c) => c.id === id)?.labels[i18n.language as "it" | "en"] ?? "—";

  const saveCat = async () => {
    if (await run(() => call("saveSortingCategory", { id: cat!.id, labels: cat!.labels, active: cat!.active ?? true, order: Number(cat!.order ?? 0) }), t("common.saved"))) { setCat(null); load(); }
  };
  const saveRule = async () => {
    const r = rule!;
    const payload = { id: r.id, siteId: r.siteCode ? locationIdFor(r.siteCode) : null, modelId: r.modelId || null, equipmentType: r.equipmentType || null, categoryId: r.categoryId, active: r.active ?? true };
    if (await run(() => call("saveSortingRule", payload), t("common.saved"))) { setRule(null); load(); }
  };

  return (
    <div className="space-y-8">
      <PageHeader title={t("nav.sorting")} subtitle={t("sorting.subtitle")} />
      <section className="space-y-3">
        <div className="flex justify-between"><h2 className="text-lg font-semibold">{t("sorting.categories")}</h2>
          <Button onClick={() => setCat({ labels: { it: "", en: "" }, active: true, order: data.categories.length })} data-testid="sorting-new-category"><Plus className="h-4 w-4" /> {t("sorting.newCategory")}</Button></div>
        <DataTable testId="sorting-categories-table" rows={data.categories} columns={[
          { key: "order", header: t("sorting.order") },
          { key: "it", header: "IT", value: (c) => c.labels.it }, { key: "en", header: "EN", value: (c) => c.labels.en },
          { key: "active", header: t("common.status"), render: (c) => <Badge tone={c.active ? "success" : "neutral"}>{t(c.active ? "common.active" : "common.inactive")}</Badge> },
          { key: "a", header: "", render: (c) => <Button size="sm" variant="secondary" onClick={() => setCat(c)} data-testid={`sorting-edit-category-${c.id}`}>{t("common.edit")}</Button> },
        ]} />
      </section>
      <section className="space-y-3">
        <div className="flex justify-between"><h2 className="text-lg font-semibold">{t("sorting.rules")}</h2>
          <Button disabled={!data.categories.length} onClick={() => setRule({ active: true })} data-testid="sorting-new-rule"><Plus className="h-4 w-4" /> {t("sorting.newRule")}</Button></div>
        <p className="text-sm text-muted">{t("sorting.precedence")}</p>
        <DataTable testId="sorting-rules-table" rows={data.rules} columns={[
          { key: "site", header: t("sorting.site"), value: (r) => (r.siteId ? decodeURIComponent(r.siteId.replace(/^loc_/, "")) : "—"), className: "font-mono" },
          { key: "model", header: t("models.model"), value: (r) => models.find((m) => m.id === r.modelId)?.model ?? "—" },
          { key: "type", header: t("models.equipmentType"), value: (r) => r.equipmentType ?? "—" },
          { key: "cat", header: t("sorting.category"), value: (r) => label(r.categoryId) },
          { key: "active", header: t("common.status"), render: (r) => <Badge tone={r.active ? "success" : "neutral"}>{t(r.active ? "common.active" : "common.inactive")}</Badge> },
          { key: "a", header: "", render: (r) => <Button size="sm" variant="secondary" onClick={() => setRule({ ...r, siteCode: r.siteId ? decodeURIComponent(r.siteId.replace(/^loc_/, "")) : "" })} data-testid={`sorting-edit-rule-${r.id}`}>{t("common.edit")}</Button> },
        ]} />
      </section>
      <Dialog open={!!cat} onOpenChange={(o) => { if (!o) setCat(null); }}>
        <DialogContent title={t("sorting.newCategory")}>
          {cat && <div className="space-y-3">
            <Field label={t("sorting.labelIt")} htmlFor="c-it"><Input id="c-it" value={cat.labels?.it ?? ""} onChange={(e) => setCat({ ...cat, labels: { ...cat.labels!, it: e.target.value } })} data-testid="sorting-category-it" /></Field>
            <Field label={t("sorting.labelEn")} htmlFor="c-en"><Input id="c-en" value={cat.labels?.en ?? ""} onChange={(e) => setCat({ ...cat, labels: { ...cat.labels!, en: e.target.value } })} data-testid="sorting-category-en" /></Field>
            <Field label={t("sorting.order")} htmlFor="c-ord"><Input id="c-ord" type="number" value={cat.order ?? 0} onChange={(e) => setCat({ ...cat, order: Number(e.target.value) })} data-testid="sorting-category-order" /></Field>
            <Checkbox id="c-act" label={t("common.active")} checked={cat.active ?? true} onChange={(v) => setCat({ ...cat, active: v })} testId="sorting-category-active" />
            <div className="flex justify-end"><Button disabled={busy} onClick={saveCat} data-testid="sorting-category-save">{t("common.save")}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
      <Dialog open={!!rule} onOpenChange={(o) => { if (!o) setRule(null); }}>
        <DialogContent title={t("sorting.newRule")} description={t("sorting.precedence")}>
          {rule && <div className="space-y-3">
            <Field label={t("sorting.siteCode")} htmlFor="r-site"><Input id="r-site" className="font-mono" value={rule.siteCode ?? ""} onChange={(e) => setRule({ ...rule, siteCode: e.target.value })} data-testid="sorting-rule-site" /></Field>
            <Field label={t("models.model")} htmlFor="r-model"><Select id="r-model" value={rule.modelId ?? ""} onChange={(e) => setRule({ ...rule, modelId: e.target.value })} data-testid="sorting-rule-model">
              <option value="">—</option>{models.map((m) => <option key={m.id} value={m.id}>{m.model} · {m.materialCode}</option>)}</Select></Field>
            <Field label={t("models.equipmentType")} htmlFor="r-type"><Input id="r-type" value={rule.equipmentType ?? ""} onChange={(e) => setRule({ ...rule, equipmentType: e.target.value })} data-testid="sorting-rule-type" /></Field>
            <Field label={t("sorting.category")} htmlFor="r-cat"><Select id="r-cat" value={rule.categoryId ?? ""} onChange={(e) => setRule({ ...rule, categoryId: e.target.value })} data-testid="sorting-rule-category">
              <option value="">{t("common.choose")}</option>{data.categories.map((c) => <option key={c.id} value={c.id}>{label(c.id)}</option>)}</Select></Field>
            <Checkbox id="r-act" label={t("common.active")} checked={rule.active ?? true} onChange={(v) => setRule({ ...rule, active: v })} testId="sorting-rule-active" />
            <div className="flex justify-end"><Button disabled={busy || !rule.categoryId} onClick={saveRule} data-testid="sorting-rule-save">{t("common.save")}</Button></div>
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
