import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus, Upload } from "lucide-react";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { listLocations, listOrganizations, type Row, type Location, type Organization } from "@/lib/data/db";
import { DataTable } from "@/components/DataTable";
import { Badge, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select, Checkbox } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loading, ErrorState, Empty } from "@/components/states";

type L = Row<Location>;
const blank: Location = { code: "", name: "", type: "site", aspId: null, address: "", region: "", active: true };

function EditDialog({ loc, asps, onClose, onSaved }: { loc: L | "new" | null; asps: Row<Organization>[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [f, setF] = React.useState<Location>(blank);
  const isNew = loc === "new";
  React.useEffect(() => { setF(loc && loc !== "new" ? { ...blank, ...loc } : blank); }, [loc]);
  const set = (k: keyof Location) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run(() => call("saveLocation", { ...f, aspId: f.type === "client_warehouse" ? null : f.aspId, isNew }), t("common.saved"));
    if (r) { onSaved(); onClose(); }
  };
  return (
    <Dialog open={!!loc} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t(isNew ? "locations.new" : "locations.edit")}>
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("locations.code")} htmlFor="loc-code"><Input id="loc-code" className="font-mono" value={f.code} onChange={set("code")} disabled={!isNew} required data-testid="location-code-input" /></Field>
          <Field label={t("locations.name")} htmlFor="loc-name"><Input id="loc-name" value={f.name} onChange={set("name")} required data-testid="location-name-input" /></Field>
          <Field label={t("locations.type")} htmlFor="loc-type">
            <Select id="loc-type" value={f.type} onChange={set("type")} disabled={!isNew} data-testid="location-type-select">
              {(["site", "asp_warehouse", "client_warehouse"] as const).map((x) => <option key={x} value={x}>{t(`locations.types.${x}`)}</option>)}
            </Select>
          </Field>
          {f.type !== "client_warehouse" && (
            <Field label={t("locations.asp")} htmlFor="loc-asp" hint={!isNew && f.type === "site" ? t("locations.useReassign") : undefined}>
              <Select id="loc-asp" value={f.aspId ?? ""} onChange={(e) => setF({ ...f, aspId: e.target.value || null })} disabled={!isNew && f.type === "site"} required data-testid="location-asp-select">
                <option value="">{t("common.choose")}</option>
                {asps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t("locations.address")} htmlFor="loc-addr"><Input id="loc-addr" value={f.address} onChange={set("address")} data-testid="location-address-input" /></Field>
          <Field label={t("locations.region")} htmlFor="loc-region"><Input id="loc-region" value={f.region} onChange={set("region")} data-testid="location-region-input" /></Field>
          <Checkbox id="loc-active" label={t("common.active")} checked={f.active} onChange={(v) => setF({ ...f, active: v })} testId="location-active-checkbox" />
          <div className="flex justify-end"><Button type="submit" disabled={busy} data-testid="location-save-button">{t("common.save")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({ site, asps, onClose, onSaved }: { site: L | null; asps: Row<Organization>[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [aspId, setAspId] = React.useState("");
  const [reason, setReason] = React.useState("");
  React.useEffect(() => { setAspId(""); setReason(""); }, [site]);
  const save = async () => {
    const r = await run(() => call<{ moved: number }>("reassignSite", { siteId: site!.id, aspId, reason }));
    if (r) { onSaved(); onClose(); }
  };
  return (
    <Dialog open={!!site} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t("locations.reassign")} description={t("locations.reassignHint", { code: site?.code })}>
        <div className="space-y-3">
          <Select aria-label={t("locations.asp")} value={aspId} onChange={(e) => setAspId(e.target.value)} data-testid="reassign-asp-select">
            <option value="">{t("common.choose")}</option>
            {asps.filter((a) => a.active && a.id !== site?.aspId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
          <Field label={t("locations.reason")} htmlFor="reassign-reason"><Input id="reassign-reason" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="reassign-reason-input" /></Field>
          <div className="flex justify-end"><Button disabled={busy || !aspId} onClick={save} data-testid="reassign-submit">{t("locations.reassign")}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function Locations() {
  const { t } = useTranslation();
  const [list, setList] = React.useState<L[] | null>(null);
  const [asps, setAsps] = React.useState<Row<Organization>[]>([]);
  const [error, setError] = React.useState(false);
  const [type, setType] = React.useState("");
  const [edit, setEdit] = React.useState<L | "new" | null>(null);
  const [reassign, setReassign] = React.useState<L | null>(null);
  const load = React.useCallback(() => {
    setError(false);
    Promise.all([listLocations(), listOrganizations()]).then(([l, o]) => { setList(l); setAsps(o.filter((x) => x.type === "asp")); }).catch(() => setError(true));
  }, []);
  React.useEffect(load, [load]);
  const aspName = (id: string | null) => (id ? asps.find((a) => a.id === id)?.name ?? "—" : "—");

  if (error) return <ErrorState message={t("errors.load_failed")} onRetry={load} />;
  if (!list) return <Loading />;
  return (
    <div>
      <PageHeader title={t("nav.locations")} subtitle={t("locations.subtitle")} actions={<>
        <Button variant="secondary" asChild><Link to="/admin/locations/import" data-testid="locations-import-button"><Upload className="h-4 w-4" /> {t("import.title")}</Link></Button>
        <Button onClick={() => setEdit("new")} data-testid="locations-new-button"><Plus className="h-4 w-4" /> {t("locations.new")}</Button>
      </>} />
      <DataTable testId="locations-table" rows={type ? list.filter((l) => l.type === type) : list}
        toolbar={<Select aria-label={t("locations.type")} className="w-48" value={type} onChange={(e) => setType(e.target.value)} data-testid="locations-type-filter">
          <option value="">{t("locations.allTypes")}</option>
          {(["site", "asp_warehouse", "client_warehouse"] as const).map((x) => <option key={x} value={x}>{t(`locations.types.${x}`)}</option>)}
        </Select>}
        empty={<Empty title={t("locations.empty")} hint={t("locations.emptyHint")} action={<Button asChild><Link to="/admin/locations/import">{t("import.title")}</Link></Button>} />}
        columns={[
          { key: "code", header: t("locations.code"), className: "font-mono" },
          { key: "name", header: t("locations.name") },
          { key: "type", header: t("locations.type"), value: (l) => t(`locations.types.${l.type}`) },
          { key: "asp", header: t("locations.asp"), value: (l) => aspName(l.aspId) },
          { key: "region", header: t("locations.region") },
          { key: "active", header: t("common.status"), value: (l) => (l.active ? 1 : 0), render: (l) => <Badge tone={l.active ? "success" : "neutral"}>{t(l.active ? "common.active" : "common.inactive")}</Badge> },
          { key: "actions", header: "", render: (l) => (
            <div className="flex gap-1 justify-end">
              <Button size="sm" variant="secondary" onClick={() => setEdit(l)} data-testid={`location-edit-${l.id}`}>{t("common.edit")}</Button>
              {l.type === "site" && <Button size="sm" variant="secondary" onClick={() => setReassign(l)} data-testid={`location-reassign-${l.id}`}>{t("locations.reassign")}</Button>}
            </div>) },
        ]} />
      <EditDialog loc={edit} asps={asps} onClose={() => setEdit(null)} onSaved={load} />
      <ReassignDialog site={reassign} asps={asps} onClose={() => setReassign(null)} onSaved={load} />
    </div>
  );
}
