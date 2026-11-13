import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { watchToComplete, type Item } from "@/lib/data/items";
import type { Row } from "@/lib/data/db";
import { PageHeader, Badge } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty, ErrorState } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { useNames } from "@/lib/names";

// §6.4 / §12.2: pieces without a model (or with required extra fields missing — step 4).
export default function ToComplete() {
  const { t, i18n } = useTranslation();
  const names = useNames();
  const { claims } = useSession();
  const [items, setItems] = React.useState<Row<Item>[] | null>(null);
  // P-208: a list that cannot be read says so, with «Retry», instead of «Loading…» for ever (as Alerts, P-207).
  const [failed, setFailed] = React.useState(false);
  const [retry, setRetry] = React.useState(0);
  React.useEffect(() => {
    setFailed(false);
    return claims?.orgId ? watchToComplete({ role: claims.role!, orgId: claims.orgId }, (v) => { setFailed(false); setItems(v); }, () => setFailed(true)) : undefined;
  }, [claims, retry]);
  if (!items && failed) return <ErrorState message={t("errors.load_failed")} onRetry={() => setRetry((n) => n + 1)} />;
  if (!items) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={t("items.toComplete")} subtitle={t("items.toCompleteSubtitle")} />
      {items.length === 0 ? <Empty title={t("items.toCompleteEmpty")} /> : (
        <DataTable testId="to-complete-table" rows={items} rowHref={(r) => `/items/${r.id}`} columns={[
          // P-205: when the piece was last read and where, not the ids of its last event and of its place.
          { key: "code", header: t("items.lastScanned"), value: (r) => r.lastScannedAt?.toDate?.().toISOString() ?? "", render: (r) => formatInstant(r.lastScannedAt?.toDate?.() ?? null, i18n.language) },
          { key: "status", header: t("items.status"), render: (r) => <Badge>{t(`items.statuses.${r.status}`, { defaultValue: r.status })}</Badge> },
          { key: "loc", header: t("items.location"), value: (r) => names.place(r.currentLocationId) },
          { key: "a", header: "", render: (r) => <Link to={`/items/${r.id}`} className="text-primary hover:underline" data-testid={`to-complete-row-${r.id}`}>{t("common.open")}</Link> },
        ]} />
      )}
    </div>
  );
}
