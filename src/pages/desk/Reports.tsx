import * as React from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { listReports, type SwReport } from "@/lib/data/documents";
import { downloadFile } from "@/lib/data/storage";
import { reportFileName } from "@/lib/fileNames";
import { toast } from "sonner";
import { isClientRole } from "@shared/roles";
import { listOrganizations, getOrganization, type Row, type Organization } from "@/lib/data/db";
import { Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/form";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";

// §13.4 Monthly reports; client roles can generate on demand. P-190: a tab of the exports page (Exports.tsx).
export function ReportsPanel() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const [year, setYear] = React.useState(new Date().getUTCFullYear());
  const [month, setMonth] = React.useState(new Date().getUTCMonth() + 1);
  const [list, setList] = React.useState<Row<SwReport>[] | null>(null);
  const client = isClientRole(claims?.role ?? "");
  // §13.4 / P-99: the client roles see and generate the report of all the ASPs or of one ASP; an ASP its own.
  const [clientScope, setClientScope] = React.useState("client");
  const scope = client ? clientScope : claims?.orgId ?? "";
  const refresh = React.useCallback(async () => setList(await listReports(scope)), [scope]);
  React.useEffect(() => { void refresh(); }, [refresh, busy]);
  // The ASPs by name: the scope choice, the scope column and the saved file name (P-106). An ASP reads only its own.
  const [asps, setAsps] = React.useState<Row<Organization>[]>([]);
  React.useEffect(() => {
    const orgs = client ? listOrganizations() : claims?.orgId ? getOrganization(claims.orgId).then((o) => (o ? [o] : [])) : Promise.resolve([]);
    void orgs.then((l) => setAsps(l.filter((o) => o.type === "asp"))).catch(() => undefined);
  }, [client, claims?.orgId]);
  const aspNames: Record<string, string> = Object.fromEntries(asps.map((o) => [o.id, o.name]));
  const generate = async () => { await run(() => call("generateReport", { scope, year, month }), t("reports.generated")); await refresh(); };
  const download = async (r: Row<SwReport>, ext: "pdf" | "xlsx") => {
    const name = reportFileName(r.month, r.scope === "client" ? t("reports.fileScopeClient") : aspNames[r.scope] ?? r.scope, ext);
    if (!(await downloadFile(ext === "pdf" ? r.pdfPath : r.xlsxPath, name))) toast.error(t("errors.load_failed"));
  };
  if (!list) return <Loading />;
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">{t("reports.subtitle")}</p>
      {client && (
        <Card>
          <div className="grid gap-3 md:grid-cols-4">
            <Field label={t("dashboard.scope")} htmlFor="r-s"><Select id="r-s" value={clientScope} onChange={(e) => setClientScope(e.target.value)} data-testid="reports-scope">
              <option value="client">{t("dashboard.allAsps")}</option>
              {asps.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Select></Field>
            <Field label={t("reports.year")} htmlFor="r-y"><Select id="r-y" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} data-testid="reports-year">
              {/* P-209: from 2024 (the first data) to the current year, not a list written once (it stopped at 2027). */}
              {Array.from({ length: new Date().getUTCFullYear() - 2024 + 1 }, (_, i) => 2024 + i).map((y) => <option key={y} value={y}>{y}</option>)}
            </Select></Field>
            <Field label={t("reports.month")} htmlFor="r-m"><Select id="r-m" value={String(month)} onChange={(e) => setMonth(Number(e.target.value))} data-testid="reports-month">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{m}</option>)}
            </Select></Field>
            <div className="self-end"><Button onClick={generate} disabled={busy} data-testid="reports-generate"><FileText className="h-4 w-4" />{t("reports.generate")}</Button></div>
          </div>
        </Card>
      )}
      {list.length === 0 ? <Empty title={t("reports.empty")} /> : (
        <DataTable testId="reports-table" rows={list} columns={[
          { key: "s", header: t("dashboard.scope"), render: (r) => <Badge>{r.scope === "client" ? t("dashboard.allAsps") : aspNames[r.scope] ?? r.scope}</Badge> },
          { key: "m", header: t("reports.monthLabel"), value: (r) => r.month, className: "font-mono" },
          { key: "at", header: t("exports.created_at"), value: (r) => formatInstant(r.createdAt?.toDate?.() ?? null, i18n.language) },
          { key: "p", header: "", render: (r) => <Button size="sm" variant="ghost" onClick={() => download(r, "pdf")} data-testid={`reports-pdf-${r.id}`}><Download className="h-4 w-4" />PDF</Button> },
          { key: "x", header: "", render: (r) => <Button size="sm" variant="ghost" onClick={() => download(r, "xlsx")} data-testid={`reports-xlsx-${r.id}`}><Download className="h-4 w-4" />XLSX</Button> },
        ]} />
      )}
    </div>
  );
}
