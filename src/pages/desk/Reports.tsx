import * as React from "react";
import { useTranslation } from "react-i18next";
import { Download, FileText } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { listReports, type SwReport } from "@/lib/data/documents";
import { getDownloadURL as getUrl } from "@/lib/data/storage";
import { isClientRole } from "@shared/roles";
import type { Row } from "@/lib/data/db";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/form";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";

// §13.4 Monthly reports; client roles can generate on demand.
export default function Reports() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const [year, setYear] = React.useState(new Date().getUTCFullYear());
  const [month, setMonth] = React.useState(new Date().getUTCMonth() + 1);
  const [list, setList] = React.useState<Row<SwReport>[] | null>(null);
  const client = isClientRole(claims?.role ?? "");
  const scope = client ? "client" : claims?.orgId ?? "";
  const refresh = React.useCallback(async () => setList(await listReports(scope)), [scope]);
  React.useEffect(() => { void refresh(); }, [refresh, busy]);
  const generate = async () => { await run(() => call("generateReport", { scope, year, month }), t("reports.generated")); await refresh(); };
  const download = async (path: string) => { const url = await getUrl(path); if (url) window.open(url, "_blank"); };
  if (!list) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.reports")} subtitle={t("reports.subtitle")} />
      {client && (
        <Card>
          <div className="grid gap-3 md:grid-cols-3">
            <Field label={t("reports.year")} htmlFor="r-y"><Select id="r-y" value={String(year)} onChange={(e) => setYear(Number(e.target.value))} data-testid="reports-year">
              {[2024, 2025, 2026, 2027].map((y) => <option key={y} value={y}>{y}</option>)}
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
          { key: "s", header: t("dashboard.scope"), render: (r) => <Badge>{r.scope === "client" ? t("dashboard.allAsps") : r.scope}</Badge> },
          { key: "m", header: t("reports.monthLabel"), value: (r) => r.month, className: "font-mono" },
          { key: "at", header: t("exports.created_at"), value: (r) => formatInstant(r.createdAt?.toDate?.() ?? null, i18n.language) },
          { key: "p", header: "", render: (r) => <Button size="sm" variant="ghost" onClick={() => download(r.pdfPath)} data-testid={`reports-pdf-${r.id}`}><Download className="h-4 w-4" />PDF</Button> },
          { key: "x", header: "", render: (r) => <Button size="sm" variant="ghost" onClick={() => download(r.xlsxPath)} data-testid={`reports-xlsx-${r.id}`}><Download className="h-4 w-4" />XLSX</Button> },
        ]} />
      )}
    </div>
  );
}
