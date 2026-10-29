import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { watchAnomalies, type Anomaly } from "@/lib/data/documents";
import type { Row } from "@/lib/data/db";
import { PageHeader, Badge } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";

// §8.3 Anomalies inbox.
export default function Anomalies() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const [all, setAll] = React.useState<Row<Anomaly>[] | null>(null);
  const [showResolved, setShowResolved] = React.useState(false);
  React.useEffect(() => claims?.orgId ? watchAnomalies({ role: claims.role!, orgId: claims.orgId }, setAll) : undefined, [claims]);
  if (!all) return <Loading />;
  const list = showResolved ? all : all.filter((a) => !a.resolution);
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.anomalies")} subtitle={t("anomalies.subtitle")}
        actions={<button type="button" onClick={() => setShowResolved(!showResolved)} className="text-sm text-primary hover:underline" data-testid="anomalies-toggle">{showResolved ? t("anomalies.hideResolved") : t("anomalies.showResolved")}</button>} />
      {list.length === 0 ? <Empty title={t("anomalies.empty")} /> : (
        <DataTable testId="anomalies-table" rows={list} columns={[
          { key: "t", header: t("alerts.kind"), render: (a) => <Badge tone={a.resolution ? "neutral" : "warning"}>{t(`anomalies.types.${a.type}`, { defaultValue: a.type })}</Badge> },
          { key: "loc", header: t("items.location"), value: (a) => a.locationId ?? "—", className: "font-mono text-xs" },
          { key: "it", header: t("nav.items"), render: (a) => a.itemId ? <Link to={`/items/${a.itemId}`} className="text-primary hover:underline font-mono text-xs" data-testid={`anomalies-row-item-${a.id}`}>{a.itemId.slice(0, 8)}</Link> : "—" },
          { key: "at", header: t("anomalies.opened"), value: (a) => formatInstant(a.openedAt?.toDate?.() ?? null, i18n.language) },
          { key: "r", header: "", render: (a) => a.resolution ? <Badge tone="neutral">{t(`anomalies.resolutions.${a.resolution}`, { defaultValue: a.resolution })}</Badge> : null },
        ]} />
      )}
    </div>
  );
}
