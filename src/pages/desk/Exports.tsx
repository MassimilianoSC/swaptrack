import * as React from "react";
import { useTranslation } from "react-i18next";
import { Download, FileSpreadsheet } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { listMyExports, type SwExport } from "@/lib/data/documents";
import { getDownloadURL as getUrl } from "@/lib/data/storage";
import type { Row } from "@/lib/data/db";
import { PageHeader, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Input, Field } from "@/components/ui/form";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";

// §13.3 Excel export (CSV placeholder; see NOT_DONE.md).
export default function Exports() {
  const { t, i18n } = useTranslation();
  const { user, claims } = useSession();
  const { busy, run } = useAction();
  const [status, setStatus] = React.useState("");
  const [modelId, setModelId] = React.useState("");
  const [list, setList] = React.useState<Row<SwExport>[] | null>(null);
  React.useEffect(() => { if (user) void listMyExports(user.uid).then(setList); }, [user, busy]);
  const client = ["client_admin", "client_office"].includes(claims?.role ?? "");
  const scope = client ? "client" : claims?.orgId ?? "";
  const create = async () => {
    await run(() => call("createExport", { scope, status: status || undefined, modelId: modelId || undefined, language: i18n.language as "it" | "en" }), t("exports.created"));
  };
  const download = async (path: string) => {
    const url = await getUrl(path);
    if (url) window.open(url, "_blank");
  };
  if (!list) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.exports")} subtitle={t("exports.subtitle")} />
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t("items.status")} htmlFor="x-s"><Select id="x-s" value={status} onChange={(e) => setStatus(e.target.value)} data-testid="exports-status">
            <option value="">{t("common.filter")}</option>
            {["received_at_asp", "installed", "removed_at_site", "sorted", "defective", "leftover", "in_transfer", "in_return", "returned"].map((s) => <option key={s} value={s}>{t(`items.statuses.${s}`)}</option>)}
          </Select></Field>
          <Field label={t("items.model")} htmlFor="x-m"><Input id="x-m" value={modelId} onChange={(e) => setModelId(e.target.value)} className="font-mono text-xs" placeholder="modelId" data-testid="exports-model" /></Field>
          <div className="md:col-span-1 self-end"><Button disabled={busy} onClick={create} data-testid="exports-create"><FileSpreadsheet className="h-4 w-4" />{t("exports.create")}</Button></div>
        </div>
      </Card>
      {list.length === 0 ? <Empty title={t("exports.empty")} /> : (
        <DataTable testId="exports-table" rows={list} columns={[
          { key: "at", header: t("exports.created_at"), value: (r) => formatInstant(r.createdAt?.toDate?.() ?? null, i18n.language) },
          { key: "scope", header: t("dashboard.scope"), value: (r) => r.scope === "client" ? t("dashboard.allAsps") : r.scope },
          { key: "n", header: t("exports.rows"), value: (r) => r.rowCount, className: "tabular" },
          { key: "d", header: "", render: (r) => <Button size="sm" variant="ghost" onClick={() => download(r.path)} data-testid={`exports-download-${r.id}`}><Download className="h-4 w-4" />{t("common.download")}</Button> },
        ]} />
      )}
    </div>
  );
}
