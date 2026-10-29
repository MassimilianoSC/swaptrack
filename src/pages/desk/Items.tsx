import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useSession } from "@/app/session";
import { watchItems, searchItemByCode, type Item } from "@/lib/data/items";
import type { Row } from "@/lib/data/db";
import { PageHeader, Badge } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Loading } from "@/components/states";
import { toast } from "sonner";

// §13.2 search by any code (exact) + lightweight item list of the ASP (own) or all (client).
export default function Items() {
  const { t } = useTranslation();
  const { claims } = useSession();
  const [items, setItems] = React.useState<Row<Item>[] | null>(null);
  const [q, setQ] = React.useState("");
  React.useEffect(() => claims?.orgId ? watchItems({ role: claims.role!, orgId: claims.orgId }, setItems) : undefined, [claims]);
  const codeSearch = async () => {
    if (!q.trim()) return;
    const found = await searchItemByCode(q);
    if (found) window.location.href = `/items/${found.id}`;
    else toast.error(t("items.notFound"));
  };
  if (!items) return <Loading />;
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.items")} subtitle={t("items.subtitle")} />
      <form className="flex gap-2 max-w-xl" onSubmit={(e) => { e.preventDefault(); void codeSearch(); }}>
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" aria-hidden />
          <Input aria-label={t("items.searchByCode")} placeholder={t("items.searchByCode")} className="pl-9 font-mono" value={q} onChange={(e) => setQ(e.target.value)} data-testid="items-search-input" />
        </div>
        <Button type="submit" data-testid="items-search-submit">{t("common.search")}</Button>
      </form>
      <DataTable testId="items-table" rows={items} columns={[
        { key: "model", header: t("items.model"), render: (r) => <Link to={`/items/${r.id}`} data-testid={`items-row-link-${r.id}`} className="hover:underline">{r.model ?? "—"}</Link> },
        { key: "material", header: t("items.materialCode"), value: (r) => r.materialCode ?? "—", className: "font-mono" },
        { key: "status", header: t("items.status"), render: (r) => <Badge tone={r.needsModel ? "warning" : "neutral"}>{t(`items.statuses.${r.status}`, { defaultValue: r.status })}</Badge> },
        { key: "flow", header: t("items.flow"), value: (r) => t(`items.flows.${r.flow}`, { defaultValue: r.flow }) },
        { key: "loc", header: t("items.location"), value: (r) => r.currentLocationId ?? "—", className: "font-mono text-xs" },
        { key: "needs", header: "", render: (r) => r.needsModel ? <Badge tone="warning">{t("items.needsModel")}</Badge> : null },
      ]} />
    </div>
  );
}
