import * as React from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchOrganizations, type Row, type Organization } from "@/lib/data/db";
import { DataTable } from "@/components/DataTable";
import { Badge, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loading, ErrorState, Empty } from "@/components/states";
import { InviteResultDialog, ConfirmDialog, type InviteResult } from "@/components/dialogs";

function CreateAspDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (r: InviteResult) => void }) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [f, setF] = React.useState({ name: "", language: "it", email: "", firstName: "", lastName: "", adminLanguage: "it" });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run(() => call<{ admin: InviteResult }>("createAsp", {
      name: f.name, language: f.language, admin: { email: f.email, firstName: f.firstName, lastName: f.lastName, language: f.adminLanguage },
    }), t("orgs.created"));
    if (r) { onDone(r.admin); onClose(); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t("orgs.createAsp")} description={t("orgs.createAspHint")}>
        <form onSubmit={submit} className="space-y-3">
          <Field label={t("orgs.name")} htmlFor="asp-name"><Input id="asp-name" value={f.name} onChange={set("name")} required data-testid="create-asp-name" /></Field>
          <Field label={t("orgs.reportLanguage")} htmlFor="asp-lang"><Select id="asp-lang" value={f.language} onChange={set("language")} data-testid="create-asp-language"><option value="it">Italiano</option><option value="en">English</option></Select></Field>
          <h3 className="font-semibold pt-2">{t("orgs.firstAdmin")}</h3>
          <Field label={t("users.firstName")} htmlFor="adm-first"><Input id="adm-first" value={f.firstName} onChange={set("firstName")} required data-testid="create-asp-admin-first" /></Field>
          <Field label={t("users.lastName")} htmlFor="adm-last"><Input id="adm-last" value={f.lastName} onChange={set("lastName")} required data-testid="create-asp-admin-last" /></Field>
          <Field label={t("auth.email")} htmlFor="adm-email"><Input id="adm-email" type="email" value={f.email} onChange={set("email")} required data-testid="create-asp-admin-email" /></Field>
          <Field label={t("common.language")} htmlFor="adm-lang"><Select id="adm-lang" value={f.adminLanguage} onChange={set("adminLanguage")} data-testid="create-asp-admin-language"><option value="it">Italiano</option><option value="en">English</option></Select></Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy} data-testid="create-asp-submit">{t("orgs.createAsp")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Organizations() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [orgs, setOrgs] = React.useState<Row<Organization>[] | null>(null);
  const [error, setError] = React.useState(false);
  const [creating, setCreating] = React.useState(false);
  const [invite, setInvite] = React.useState<InviteResult | null>(null);
  const [toggle, setToggle] = React.useState<Row<Organization> | null>(null);
  React.useEffect(() => watchOrganizations(setOrgs, () => setError(true)), []);

  if (error) return <ErrorState message={t("errors.load_failed")} onRetry={() => location.reload()} />;
  if (!orgs) return <Loading />;
  return (
    <div>
      <PageHeader title={t("nav.organizations")} subtitle={t("orgs.subtitle")}
        actions={<Button onClick={() => setCreating(true)} data-testid="orgs-create-asp-button"><Plus className="h-4 w-4" /> {t("orgs.createAsp")}</Button>} />
      <DataTable testId="orgs-table" rows={orgs}
        empty={<Empty title={t("orgs.empty")} hint={t("orgs.emptyHint")} action={<Button onClick={() => setCreating(true)}>{t("orgs.createAsp")}</Button>} />}
        columns={[
          { key: "name", header: t("orgs.name") },
          { key: "type", header: t("orgs.type"), value: (o) => t(`orgs.types.${o.type}`) },
          { key: "language", header: t("orgs.reportLanguage"), render: (o) => (
            <Select aria-label={t("orgs.reportLanguage")} className="w-36" value={o.language} disabled={busy} data-testid={`org-language-${o.id}`}
              onChange={(e) => run(() => call("setLanguage", { target: "organization", orgId: o.id, language: e.target.value }), t("common.saved"))}>
              <option value="it">Italiano</option><option value="en">English</option>
            </Select>) },
          { key: "active", header: t("common.status"), value: (o) => (o.active ? 1 : 0), render: (o) => <Badge tone={o.active ? "success" : "danger"}>{t(o.active ? "common.active" : "common.inactive")}</Badge> },
          { key: "actions", header: "", render: (o) => o.type === "asp" && (
            <Button size="sm" variant={o.active ? "danger" : "secondary"} onClick={() => setToggle(o)} data-testid={`org-toggle-${o.id}`}>{t(o.active ? "orgs.disable" : "orgs.enable")}</Button>) },
        ]} />
      <CreateAspDialog open={creating} onClose={() => setCreating(false)} onDone={setInvite} />
      <InviteResultDialog result={invite} onClose={() => setInvite(null)} />
      <ConfirmDialog open={!!toggle} busy={busy} danger={toggle?.active}
        title={t(toggle?.active ? "orgs.disable" : "orgs.enable")} body={t(toggle?.active ? "orgs.disableBody" : "orgs.enableBody", { name: toggle?.name })}
        confirmLabel={t("common.confirm")} onClose={() => setToggle(null)}
        onConfirm={async () => { await run(() => call("setAspActive", { orgId: toggle!.id, active: !toggle!.active }), t("common.saved")); setToggle(null); }} />
    </div>
  );
}
