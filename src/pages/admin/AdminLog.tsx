import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { listAdminLog, watchUsers, type Row, type AdminLogEntry, type UserProfile } from "@/lib/data/db";
import { formatInstant } from "@/lib/utils";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/ui/card";
import { Loading, ErrorState, Empty } from "@/components/states";

// §4.16: administration actions, readable by client_admin only.
export default function AdminLog() {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = React.useState<Row<AdminLogEntry>[] | null>(null);
  const [users, setUsers] = React.useState<Row<UserProfile>[]>([]);
  const [error, setError] = React.useState(false);
  const load = React.useCallback(() => { setError(false); listAdminLog().then(setRows).catch(() => setError(true)); }, []);
  React.useEffect(load, [load]);
  React.useEffect(() => watchUsers(null, setUsers), []);
  const who = (uid: string | null) => { const u = users.find((x) => x.id === uid); return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || uid : uid ?? "—"; };
  if (error) return <ErrorState message={t("errors.load_failed")} onRetry={load} />;
  if (!rows) return <Loading />;
  return (
    <div>
      <PageHeader title={t("nav.adminLog")} subtitle={t("adminLog.subtitle")} />
      <DataTable testId="admin-log-table" rows={rows} empty={<Empty title={t("adminLog.empty")} />}
        columns={[
          { key: "at", header: t("adminLog.at"), value: (r) => r.at?.toDate().toISOString() ?? "", render: (r) => formatInstant(r.at?.toDate(), i18n.language) },
          { key: "action", header: t("adminLog.action"), value: (r) => t(`adminLog.actions.${r.action}`, { defaultValue: r.action }) },
          { key: "actor", header: t("adminLog.actor"), value: (r) => who(r.actor) },
          { key: "target", header: t("adminLog.target"), value: (r) => (r.target?.startsWith("settings/") || r.target?.startsWith("loc_") || r.target?.startsWith("mdl_") ? r.target : who(r.target)), className: "font-mono text-xs" },
          { key: "details", header: t("adminLog.details"), value: (r) => (r.details && Object.keys(r.details).length ? JSON.stringify(r.details) : ""), className: "font-mono text-xs" },
        ]} />
    </div>
  );
}
