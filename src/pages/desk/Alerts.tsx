import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, Lock } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchAlerts, type Alert } from "@/lib/data/documents";
import { hasNoDifferenceNow, isAlertToWatch } from "@/lib/alertState";
import type { Row } from "@/lib/data/db";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";

// §11.4 Alerts inbox.
export default function Alerts() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const [all, setAll] = React.useState<Row<Alert>[] | null>(null);
  const [showClosed, setShowClosed] = React.useState(false);
  React.useEffect(() => claims?.orgId ? watchAlerts({ role: claims.role!, orgId: claims.orgId }, setAll) : undefined, [claims]);
  if (!all) return <Loading />;
  const list = showClosed ? all : all.filter((a) => !a.closedAt);
  const canClose = ["client_admin", "asp_admin", "client_warehouse"].includes(claims?.role ?? "");
  // P-103: the alert of a shipment (return, transfer) opens the shipment, also when a DDT is attached to it.
  const link = (a: Row<Alert>) => a.shipmentId ? `/shipments/${a.shipmentId}` : a.documentId ? `/documents/${a.documentId}` : a.locationId ? `/items?locationId=${a.locationId}` : "#";
  const seen = (id: string) => run(() => call("markAlertSeen", { alertId: id }));
  const close = async (id: string) => { const note = prompt(t("alerts.closeNote")); if (!canClose) return; await run(() => call("closeAlert", { alertId: id, note: note ?? "" }), t("alerts.closed")); };
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.alerts")} subtitle={t("alerts.subtitle")}
        actions={<Button variant="ghost" onClick={() => setShowClosed(!showClosed)} data-testid="alerts-toggle-closed">{showClosed ? t("alerts.hideClosed") : t("alerts.showClosed")}</Button>} />
      {list.length === 0 ? <Empty title={t("alerts.empty")} /> : (
        <DataTable testId="alerts-table" rows={list} columns={[
          { key: "kind", header: t("alerts.kind"), render: (a) => <Badge tone={isAlertToWatch(a) ? "warning" : "neutral"}>{t(`alerts.kinds.${a.kind}`, { defaultValue: a.kind })}</Badge> },
          { key: "n", header: t("alerts.count"), value: (a) => hasNoDifferenceNow(a) ? t("alerts.noDifferenceNow") : a.count, className: "tabular",
            render: (a) => hasNoDifferenceNow(a) ? <span className="text-muted" data-testid={`alerts-no-difference-${a.id}`}>{t("alerts.noDifferenceNow")}</span> : <>{a.count}</> },
          { key: "obj", header: t("alerts.object"), render: (a) => <Link to={link(a)} className="text-primary hover:underline font-mono text-xs" data-testid={`alerts-row-link-${a.id}`}>{a.shipmentId ?? a.documentId ?? a.locationId ?? "—"}</Link> },
          { key: "at", header: t("alerts.updated"), value: (a) => formatInstant(a.updatedAt?.toDate?.() ?? null, i18n.language) },
          { key: "seen", header: "", render: (a) => <Button size="sm" variant="ghost" onClick={() => seen(a.id)} disabled={busy || !!a.seenAt} data-testid={`alerts-seen-${a.id}`}><Eye className="h-4 w-4" />{a.seenAt ? t("alerts.seen") : t("alerts.markSeen")}</Button> },
          { key: "close", header: "", render: (a) => canClose && !a.closedAt ? <Button size="sm" variant="ghost" onClick={() => close(a.id)} disabled={busy} data-testid={`alerts-close-${a.id}`}><Lock className="h-4 w-4" />{t("common.close")}</Button> : null },
        ]} />
      )}
      <Card>
        <p className="text-xs text-muted">{t("alerts.hint")}</p>
      </Card>
    </div>
  );
}
