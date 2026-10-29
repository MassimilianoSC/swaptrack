import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { watchToComplete, type Item } from "@/lib/data/items";
import type { Row } from "@/lib/data/db";
import { PageHeader, Badge } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";

// §6.4 / §12.2: pieces without a model (or with required extra fields missing — step 4).
export default function ToComplete() {
  const { t } = useTranslation();
  const { claims } = useSession();
  const [items, setItems] = React.useState<Row<Item>[] | null>(null);
  React.useEffect(() => claims?.orgId ? watchToComplete({ role: claims.role!, orgId: claims.orgId }, setItems) : undefined, [claims]);
  if (!items) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={t("items.toComplete")} subtitle={t("items.toCompleteSubtitle")} />
      {items.length === 0 ? <Empty title={t("items.toCompleteEmpty")} /> : (
        <DataTable testId="to-complete-table" rows={items} columns={[
          { key: "code", header: t("items.lastEvent"), value: (r) => r.lastEventId?.slice(0, 8) ?? "—", className: "font-mono text-xs" },
          { key: "status", header: t("items.status"), render: (r) => <Badge>{t(`items.statuses.${r.status}`, { defaultValue: r.status })}</Badge> },
          { key: "loc", header: t("items.location"), value: (r) => r.currentLocationId ?? "—", className: "font-mono text-xs" },
          { key: "a", header: "", render: (r) => <Link to={`/items/${r.id}`} className="text-primary hover:underline" data-testid={`to-complete-row-${r.id}`}>{t("common.open")}</Link> },
        ]} />
      )}
    </div>
  );
}
