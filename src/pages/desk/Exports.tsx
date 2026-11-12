import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ReportsPanel } from "./Reports";
import { Download, FileSpreadsheet } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { listMyExports, type SwExport } from "@/lib/data/documents";
import { downloadFile } from "@/lib/data/storage";
import { exportFileName } from "@/lib/fileNames";
import { toast } from "sonner";
import { listModels, listLocationsFor, listOrganizations, type Row, type Model, type Location, type Organization } from "@/lib/data/db";
import { loadSorting, type Category } from "@/lib/data/events";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Input, Field } from "@/components/ui/form";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { useNames } from "@/lib/names";

// P-190 (tester): exports and monthly reports in one page, two tabs; ?tab=reports opens the second one (/reports leads
// there). Same roles for both (nav.ts).
export default function ExportsAndReports() {
  const { t } = useTranslation();
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") === "reports" ? "reports" : "excel";
  return (
    <div>
      <PageHeader title={t("nav.exportsReports")} />
      <Tabs value={tab} onValueChange={(v) => setParams(v === "reports" ? { tab: "reports" } : {}, { replace: true })}>
        <TabsList>
          <TabsTrigger value="excel" data-testid="exports-tab-excel">{t("nav.exports")}</TabsTrigger>
          <TabsTrigger value="reports" data-testid="exports-tab-reports">{t("nav.reports")}</TabsTrigger>
        </TabsList>
        <TabsContent value="excel"><ExcelExports /></TabsContent>
        <TabsContent value="reports"><ReportsPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

// §13.3 Excel export with the filters of the specification (P-81).
function ExcelExports() {
  const { t, i18n } = useTranslation();
  const { user, claims } = useSession();
  const names = useNames();
  const { busy, run } = useAction();
  // §13.3 (P-81): site or warehouse, model, period, ASP (client roles), status, sorting category.
  const [status, setStatus] = React.useState("");
  const [modelId, setModelId] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [aspId, setAspId] = React.useState("");
  const [categoryId, setCategoryId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  const [locations, setLocations] = React.useState<Row<Location>[]>([]);
  const [asps, setAsps] = React.useState<Row<Organization>[]>([]);
  const [categories, setCategories] = React.useState<Category[]>([]);
  const [list, setList] = React.useState<Row<SwExport>[] | null>(null);
  React.useEffect(() => { if (user) void listMyExports(user.uid).then(setList); }, [user, busy]);
  const client = ["client_admin", "client_office"].includes(claims?.role ?? "");
  const scope = client ? "client" : claims?.orgId ?? "";
  React.useEffect(() => {
    if (!claims?.orgId) return;
    void listModels().then((m) => setModels(m.sort((a, b) => a.model.localeCompare(b.model)))).catch(() => undefined);
    void loadSorting().then((s) => setCategories(s.categories)).catch(() => undefined);
    // Only the places the role can see; an ASP exports its own pieces, so its own sites and warehouses.
    void listLocationsFor({ role: claims.role!, orgId: claims.orgId })
      .then((l) => setLocations(l.filter((x) => client || x.aspId === claims.orgId).sort((a, b) => a.code.localeCompare(b.code))))
      .catch(() => undefined);
    if (client) void listOrganizations().then((o) => setAsps(o.filter((x) => x.type === "asp"))).catch(() => undefined);
  }, [claims, client]);
  // The period is in whole days of the user's clock: from the start of the first day to the end of the last.
  const dayStart = (d: string) => (d ? new Date(`${d}T00:00:00`).getTime() : undefined);
  const dayEnd = (d: string) => (d ? new Date(`${d}T23:59:59.999`).getTime() : undefined);
  const create = async () => {
    const res = await run(() => call<{ rowCount: number; truncated?: boolean }>("createExport", {
      scope, status: status || undefined, modelId: modelId || undefined, locationId: locationId || undefined,
      aspId: client ? aspId || undefined : undefined, sortingCategoryId: categoryId || undefined, from: dayStart(from), to: dayEnd(to),
      language: i18n.language as "it" | "en",
    }), t("exports.created"));
    // P-117 n.36: the server stops at its maximum of rows and says so; the user is told to narrow the filters.
    if (res?.truncated) toast.warning(t("exports.truncated", { count: res.rowCount }));
  };
  const lang = i18n.language as "it" | "en";
  const download = async (r: Row<SwExport>) => {
    const at = r.createdAt?.toDate?.();
    if (!(await downloadFile(r.path, at ? exportFileName(at) : undefined))) toast.error(t("errors.load_failed"));
  };
  if (!list) return <Loading />;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t("exports.subtitle")}</p>
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t("items.status")} htmlFor="x-s"><Select id="x-s" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="exports-status">
            <option value="">{t("exports.any")}</option>
            {["received_at_asp", "installed", "removed_at_site", "sorted", "defective", "leftover", "in_transfer", "in_return", "returned"].map((s) => <option key={s} value={s}>{t(`items.statuses.${s}`)}</option>)}
          </Select></Field>
          <Field label={t("exports.model")} htmlFor="x-m"><Select id="x-m" value={modelId} onChange={(e) => setModelId(e.target.value)} data-testid="exports-model">
            <option value="">{t("exports.any")}</option>
            {models.map((m) => <option key={m.id} value={m.id}>{m.model} ({m.materialCode})</option>)}
          </Select></Field>
          <Field label={t("exports.location")} htmlFor="x-l"><Select id="x-l" value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="exports-location">
            <option value="">{t("exports.any")}</option>
            {locations.map((l) => <option key={l.id} value={l.id}>{l.code} {l.name}</option>)}
          </Select></Field>
          {client && (
            <Field label={t("exports.asp")} htmlFor="x-a"><Select id="x-a" value={aspId} onChange={(e) => setAspId(e.target.value)} data-testid="exports-asp">
              <option value="">{t("exports.any")}</option>
              {asps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select></Field>
          )}
          <Field label={t("exports.category")} htmlFor="x-c"><Select id="x-c" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} data-testid="exports-category">
            <option value="">{t("exports.any")}</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.labels[lang]}</option>)}
          </Select></Field>
          <Field label={t("exports.from")} htmlFor="x-f"><Input id="x-f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} data-testid="exports-from" /></Field>
          <Field label={t("exports.to")} htmlFor="x-t"><Input id="x-t" type="date" value={to} onChange={(e) => setTo(e.target.value)} data-testid="exports-to" /></Field>
          <div className="md:col-span-1 self-end"><Button disabled={busy} onClick={create} data-testid="exports-create"><FileSpreadsheet className="h-4 w-4" />{t("exports.create")}</Button></div>
        </div>
      </Card>
      {list.length === 0 ? <Empty title={t("exports.empty")} /> : (
        <DataTable testId="exports-table" rows={list} columns={[
          { key: "at", header: t("exports.created_at"), value: (r) => formatInstant(r.createdAt?.toDate?.() ?? null, i18n.language) },
          { key: "scope", header: t("dashboard.scope"), value: (r) => r.scope === "client" ? t("dashboard.allAsps") : names.org(r.scope) }, // P-126: the ASP by name
          { key: "n", header: t("exports.rows"), value: (r) => r.rowCount, className: "tabular",
            render: (r) => <span>{r.rowCount}{(r as Row<SwExport> & { truncated?: boolean }).truncated && <Badge tone="warning" className="ml-2" data-testid={`exports-truncated-${r.id}`}>{t("exports.truncatedShort")}</Badge>}</span> },
          { key: "d", header: "", render: (r) => <Button size="sm" variant="ghost" onClick={() => download(r)} data-testid={`exports-download-${r.id}`}><Download className="h-4 w-4" />{t("common.download")}</Button> },
        ]} />
      )}
    </div>
  );
}
