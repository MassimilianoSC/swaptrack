import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { readAggregate } from "@/lib/data/documents";
import { isClientRole } from "@shared/roles";
import { listLocations, listModels, listOrganizations, type Row, type Location, type Model, type Organization } from "@/lib/data/db";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/form";
import { Loading } from "@/components/states";

// §13.1 Dashboard: reads aggregates (never items). Every number drills down to /items with filters.
export default function Dashboard() {
  const { t } = useTranslation();
  const { claims } = useSession();
  const [scope, setScope] = React.useState<string>("client");
  const [asps, setAsps] = React.useState<Row<Organization>[]>([]);
  const [locations, setLocations] = React.useState<Row<Location>[]>([]);
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  const [byFlow, setByFlow] = React.useState<Record<string, number> | null>(null);
  const [byRegion, setByRegion] = React.useState<Record<string, number> | null>(null);
  const [bySortingCategory, setBySortingCategory] = React.useState<Record<string, number> | null>(null);
  const [byModel, setByModel] = React.useState<Record<string, number> | null>(null);
  const [byManufacturer, setByManufacturer] = React.useState<Record<string, number> | null>(null);
  const [removedPrevNew, setRemovedPrevNew] = React.useState<Record<string, number> | null>(null);

  const client = isClientRole(claims?.role ?? "");

  React.useEffect(() => {
    if (!claims?.orgId) return;
    setScope(client ? "client" : claims.orgId);
    void listOrganizations().then((xs) => setAsps(xs.filter((x) => x.type === "asp")));
    void listLocations().then(setLocations);
    void listModels().then(setModels);
  }, [claims, client]);

  React.useEffect(() => {
    (async () => {
      const [a, b, c, d, e, f] = await Promise.all([
        readAggregate(scope, "statusByFlow"),
        readAggregate(scope, "statusByRegion"),
        readAggregate(scope, "sortingCategory"),
        readAggregate(scope, "statusByModel"),
        readAggregate(scope, "statusByManufacturer"),
        readAggregate(scope, "removedPreviouslyNew"),
      ]);
      setByFlow(a); setByRegion(b); setBySortingCategory(c); setByModel(d); setByManufacturer(e); setRemovedPrevNew(f);
    })().catch(() => undefined);
  }, [scope]);

  if (!byFlow) return <Loading />;

  const sum = (m: Record<string, number>, filter?: (k: string) => boolean) => Object.entries(m).reduce((n, [k, v]) => n + (!filter || filter(k) ? v : 0), 0);
  const sumByStatus = (m: Record<string, number>, status: string) => sum(m, (k) => k.endsWith(`|${status}`));
  const groupByFirst = (m: Record<string, number>) => {
    const g = new Map<string, number>();
    for (const [k, v] of Object.entries(m)) {
      const [first] = k.split("|");
      g.set(first, (g.get(first) ?? 0) + v);
    }
    return g;
  };
  const modelLabel = (id: string) => models.find((m) => m.id === id)?.model ?? id;
  const drill = (status?: string, extra: Record<string, string> = {}) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (scope !== "client") p.set("asp", scope);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/items?${p.toString()}`;
  };

  const warehouses = locations.filter((l) => l.type === "asp_warehouse");
  return (
    <div className="space-y-6">
      <PageHeader title={t("nav.dashboard")} subtitle={t("dashboard.subtitle")}
        actions={client ? (
          <Field label={t("dashboard.scope")} htmlFor="s"><Select id="s" value={scope} onChange={(e) => setScope(e.target.value)} data-testid="dashboard-scope">
            <option value="client">{t("dashboard.allAsps")}</option>
            {asps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select></Field>
        ) : null}
      />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatusCard testId="k-received" label={t("items.statuses.received_at_asp")} value={sumByStatus(byFlow, "received_at_asp")} to={drill("received_at_asp")} />
        <StatusCard testId="k-installed" label={t("items.statuses.installed")} value={sumByStatus(byFlow, "installed")} to={drill("installed")} />
        <StatusCard testId="k-removed" label={t("items.statuses.removed_at_site")} value={sumByStatus(byFlow, "removed_at_site")} to={drill("removed_at_site")} />
        <StatusCard testId="k-returned" label={t("items.statuses.returned")} value={sumByStatus(byFlow, "returned")} to={drill("returned")} />
        <StatusCard testId="k-sorted" label={t("items.statuses.sorted")} value={sumByStatus(byFlow, "sorted")} to={drill("sorted")} />
        <StatusCard testId="k-defective" label={t("items.statuses.defective")} value={sumByStatus(byFlow, "defective")} to={drill("defective")} />
        <StatusCard testId="k-leftover" label={t("items.statuses.leftover")} value={sumByStatus(byFlow, "leftover")} to={drill("leftover")} />
        <StatusCard testId="k-in-transfer" label={t("items.statuses.in_transfer")} value={sumByStatus(byFlow, "in_transfer")} to={drill("in_transfer")} />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold mb-3">{t("dashboard.byFlow")}</h2>
          <ul className="text-sm" data-testid="dashboard-by-flow">
            {[...groupByFirst(byFlow).entries()].map(([k, v]) => <li key={k} className="flex justify-between border-b border-border py-1"><span>{t(`items.flows.${k}`, { defaultValue: k })}</span><span className="tabular font-bold">{v}</span></li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">{t("dashboard.byRegion")}</h2>
          {byRegion && Object.keys(byRegion).length > 0 ? (
            <ul className="text-sm" data-testid="dashboard-by-region">
              {[...groupByFirst(byRegion).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => <li key={k} className="flex justify-between border-b border-border py-1"><span>{k === "none" ? "—" : k}</span><span className="tabular font-bold">{v}</span></li>)}
            </ul>
          ) : <p className="text-sm text-muted">{t("dashboard.noRegion")}</p>}
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">{t("dashboard.topModels")}</h2>
          <ul className="text-sm" data-testid="dashboard-top-models">
            {byModel && [...groupByFirst(byModel).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => <li key={k} className="flex justify-between border-b border-border py-1"><span>{modelLabel(k)}</span><Link to={drill(undefined, { modelId: k })} className="tabular font-bold text-primary hover:underline">{v}</Link></li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">{t("dashboard.byManufacturer")}</h2>
          <ul className="text-sm" data-testid="dashboard-by-manufacturer">
            {byManufacturer && [...groupByFirst(byManufacturer).entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => <li key={k} className="flex justify-between border-b border-border py-1"><span>{k === "none" ? "—" : k}</span><span className="tabular font-bold">{v}</span></li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">{t("dashboard.sortingOutcome")}</h2>
          <ul className="text-sm" data-testid="dashboard-sorting-outcome">
            {bySortingCategory && [...groupByFirst(bySortingCategory).entries()].map(([k, v]) => <li key={k} className="flex justify-between border-b border-border py-1"><span>{k === "none" ? "—" : k}</span><span className="tabular font-bold">{v}</span></li>)}
          </ul>
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">{t("dashboard.removedPreviouslyNew")}</h2>
          <ul className="text-sm" data-testid="dashboard-removed-previously-new">
            {removedPrevNew && [...groupByFirst(removedPrevNew).entries()].filter(([k]) => k === "new").map(([k, v]) => <li key={k} className="flex justify-between border-b border-border py-1"><span>{t("dashboard.previouslyNew")}</span><span className="tabular font-bold">{v}</span></li>)}
          </ul>
        </Card>
      </div>
      <Card>
        <h2 className="font-semibold mb-3">{t("dashboard.warehouses")}</h2>
        <ul className="text-sm" data-testid="dashboard-warehouses">
          {warehouses.slice(0, 10).map((w) => <li key={w.id} className="flex justify-between border-b border-border py-1"><span>{w.code} · {w.name}</span><Link to={drill(undefined, { locationId: w.id })} className="text-primary hover:underline text-xs">{t("common.open")}</Link></li>)}
        </ul>
      </Card>
    </div>
  );
}

function StatusCard({ label, value, to, testId }: { label: string; value: number; to: string; testId: string }) {
  return (
    <Card>
      <Badge tone="neutral">{label}</Badge>
      <p className="text-3xl font-bold tabular mt-2" data-testid={testId}>{value}</p>
      <Link to={to} className="text-sm text-primary hover:underline mt-2 inline-block">→ {label}</Link>
    </Card>
  );
}
