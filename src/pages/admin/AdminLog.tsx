import * as React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router";
import { listAdminLog, watchUsers, watchOrganizations, type Row, type AdminLogEntry, type UserProfile, type Organization } from "@/lib/data/db";
import { logTarget, logDetails, personName, type LogNames } from "@/lib/adminLogText";
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
  const [orgs, setOrgs] = React.useState<Row<Organization>[]>([]);
  React.useEffect(() => watchUsers(null, setUsers), []);
  React.useEffect(() => watchOrganizations(setOrgs), []);
  // P-184: names, never ids (src/lib/adminLogText.ts).
  const names: LogNames = React.useMemo(() => ({
    user: (uid) => { const u = users.find((x) => x.id === uid); return u ? `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email || null : null; },
    org: (id) => orgs.find((o) => o.id === id)?.name ?? null,
  }), [users, orgs]);
  if (error) return <ErrorState message={t("errors.load_failed")} onRetry={load} />;
  if (!rows) return <Loading />;
  return (
    <div>
      <PageHeader title={t("nav.adminLog")} subtitle={t("adminLog.subtitle")} />
      <DataTable testId="admin-log-table" rows={rows} empty={<Empty title={t("adminLog.empty")} />}
        columns={[
          { key: "at", header: t("adminLog.at"), value: (r) => r.at?.toDate().toISOString() ?? "", render: (r) => formatInstant(r.at?.toDate(), i18n.language) },
          { key: "action", header: t("adminLog.action"), value: (r) => t(`adminLog.actions.${r.action}`, { defaultValue: r.action }) },
          { key: "actor", header: t("adminLog.actor"), value: (r) => personName(r.actor, t, names) },
          { key: "target", header: t("adminLog.target"), value: (r) => logTarget(r, t, names),
            render: (r) => (r.action === "items_merged" && r.target
              ? <Link to={`/items/${encodeURIComponent(r.target)}`} className="text-primary underline" data-testid="admin-log-piece">{logTarget(r, t, names)}</Link>
              : logTarget(r, t, names)) },
          { key: "details", header: t("adminLog.details"), value: (r) => logDetails(r, t, names) },
        ]} />
    </div>
  );
}
