import * as React from "react";
import { Link, useSearchParams } from "react-router";
import { useTranslation } from "react-i18next";
import { Search } from "lucide-react";
import { useSession } from "@/app/session";
import { watchItems, searchItemByCode, LookupUnavailable, ITEMS_PAGE, type Item, type ItemFilters } from "@/lib/data/items";
import { listLocationsFor, listModels, listOrganizations, type Row, type Location, type Model, type Organization } from "@/lib/data/db";
import { isClientRole } from "@shared/roles";
import { STATUSES } from "@shared/stateMachine";
import { PageHeader, Badge } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Input, Select, Field } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Loading, ErrorState } from "@/components/states";
import { toast } from "sonner";
import { useNames } from "@/lib/names";

const FILTER_KEYS = ["status", "asp", "locationId", "modelId"] as const;

// §13.2 search by any code (exact) + item list of the ASP (own) or all (client), latest reading first.
// §13.1 (P-101): the dashboard numbers and the alerts open this list filtered (?status=, ?asp=, ?locationId=,
// ?modelId=); the same filters are here as choices, so the list can also be narrowed by site and by model.
export default function Items() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const client = isClientRole(claims?.role ?? "");
  const [params, setParams] = useSearchParams();
  const filters: ItemFilters = {
    status: params.get("status") ?? undefined, aspId: params.get("asp") ?? undefined,
    locationId: params.get("locationId") ?? undefined, modelId: params.get("modelId") ?? undefined,
  };
  const filterKey = FILTER_KEYS.map((k) => params.get(k) ?? "").join("|");
  const [items, setItems] = React.useState<Row<Item>[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [max, setMax] = React.useState(ITEMS_PAGE);
  const [locations, setLocations] = React.useState<Row<Location>[]>([]);
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  const [asps, setAsps] = React.useState<Row<Organization>[]>([]);
  const [placeText, setPlaceText] = React.useState("");
  const [q, setQ] = React.useState("");

  React.useEffect(() => { setMax(ITEMS_PAGE); }, [filterKey]);
  React.useEffect(() => {
    if (!claims?.orgId) return;
    // The rows shown stay until the new ones arrive (changing a filter or "show more" does not blank the page).
    setFailed(false);
    return watchItems({ role: claims.role!, orgId: claims.orgId }, filters, max, setItems, () => setFailed(true));
  }, [claims, filterKey, max]);
  React.useEffect(() => {
    if (!claims?.orgId) return;
    void listLocationsFor({ role: claims.role!, orgId: claims.orgId }).then(setLocations).catch(() => undefined);
    void listModels().then(setModels).catch(() => undefined);
    if (client) void listOrganizations().then((o) => setAsps(o.filter((x) => x.type === "asp"))).catch(() => undefined);
  }, [claims, client]);

  // P-205: a piece arriving from a place this role does not read (another ASP's warehouse) shows "a place of another
  // ASP" (names.place), never the place's id.
  const names = useNames();
  const place = (id: string | null) => {
    const l = id ? locations.find((x) => x.id === id) : null;
    return l ? `${l.code} · ${l.name}` : names.place(id);
  };
  React.useEffect(() => { setPlaceText(filters.locationId ? place(filters.locationId) : ""); }, [filters.locationId, locations]);

  const setFilter = (key: (typeof FILTER_KEYS)[number], value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value); else next.delete(key);
    setParams(next, { replace: true });
  };
  // The place is chosen by typing its code or name and picking it from the list (sites and warehouses).
  const choosePlace = (text: string) => {
    setPlaceText(text);
    if (!text.trim()) return setFilter("locationId", null);
    const l = locations.find((x) => `${x.code} · ${x.name}` === text || x.code.toLowerCase() === text.trim().toLowerCase());
    if (l) setFilter("locationId", l.id);
  };
  const codeSearch = async () => {
    if (!q.trim()) return;
    // A code the rules do not let this user read is "not found" for them (R7: existence is not revealed), never a silent failure.
    // D-58 B2: without network the answer is "not available", never "not found".
    const found = await searchItemByCode(q).catch((e) => e instanceof LookupUnavailable ? "unavailable" as const : null);
    if (found === "unavailable") toast.error(t("errors.offlineUnavailable"));
    else if (found) window.location.href = `/items/${found.id}`;
    else toast.error(t("items.notFound"));
  };
  const anyFilter = FILTER_KEYS.some((k) => params.get(k) && !(k === "asp" && !client));
  // As before P-101, the page (code search included) opens once the list has answered: a search sent while the
  // tab's database connection is still starting could answer "not found" for a piece that exists.
  if (!items && !failed) return <Loading />;

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

      {/* Aligned at the top: the hint under "Site or warehouse" must not push its box above the others. */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 items-start" data-testid="items-filters">
        <Field label={t("items.filters.status")} htmlFor="f-status">
          <Select id="f-status" value={filters.status ?? ""} onChange={(e) => setFilter("status", e.target.value || null)} data-testid="items-filter-status">
            <option value="">{t("items.filters.all")}</option>
            {STATUSES.map((s) => <option key={s} value={s}>{t(`items.statuses.${s}`, { defaultValue: s })}</option>)}
          </Select>
        </Field>
        {client && (
          <Field label={t("items.filters.asp")} htmlFor="f-asp">
            <Select id="f-asp" value={filters.aspId ?? ""} onChange={(e) => setFilter("asp", e.target.value || null)} data-testid="items-filter-asp">
              <option value="">{t("items.filters.all")}</option>
              {asps.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
        )}
        <Field label={t("items.filters.location")} htmlFor="f-place" hint={t("items.filters.locationHint")}>
          <Input id="f-place" list="f-place-list" value={placeText} onChange={(e) => choosePlace(e.target.value)} autoComplete="off" data-testid="items-filter-location" />
          <datalist id="f-place-list">
            {locations.map((l) => <option key={l.id} value={`${l.code} · ${l.name}`} />)}
          </datalist>
        </Field>
        <Field label={t("items.filters.model")} htmlFor="f-model">
          <Select id="f-model" value={filters.modelId ?? ""} onChange={(e) => setFilter("modelId", e.target.value || null)} data-testid="items-filter-model">
            <option value="">{t("items.filters.all")}</option>
            {[...models].sort((a, b) => (a.model ?? "").localeCompare(b.model ?? "", i18n.language)).map((m) => <option key={m.id} value={m.id}>{m.model} · {m.materialCode}</option>)}
          </Select>
        </Field>
        {anyFilter && (
          // An empty label of the same height keeps the button on the row of the boxes.
          <div className="space-y-1.5">
            <span className="block text-sm font-medium invisible" aria-hidden>&nbsp;</span>
            <Button type="button" variant="secondary" onClick={() => setParams(new URLSearchParams(), { replace: true })} data-testid="items-filter-clear">{t("items.filters.clear")}</Button>
          </div>
        )}
      </div>

      {failed || !items ? <ErrorState message={t("errors.load_failed")} /> : (
        <>
          <DataTable testId="items-table" rows={items} rowHref={(r) => `/items/${r.id}`} columns={[
            { key: "model", header: t("items.model"), render: (r) => <Link to={`/items/${r.id}`} data-testid={`items-row-link-${r.id}`} className="hover:underline">{r.model ?? "—"}</Link> },
            { key: "material", header: t("items.materialCode"), value: (r) => r.materialCode ?? "—", className: "font-mono" },
            { key: "status", header: t("items.status"), render: (r) => <Badge tone={r.needsModel ? "warning" : "neutral"}>{t(`items.statuses.${r.status}`, { defaultValue: r.status })}</Badge> },
            { key: "flow", header: t("items.flow"), value: (r) => t(`items.flows.${r.flow}`, { defaultValue: r.flow }) },
            { key: "loc", header: t("items.location"), value: (r) => place(r.currentLocationId) },
            { key: "needs", header: "", render: (r) => r.needsModel ? <Badge tone="warning">{t("items.needsModel")}</Badge> : null },
          ]} />
          {items.length >= max && (
            <div className="flex items-center gap-3" data-testid="items-more">
              <p className="text-sm text-muted">{t("items.filters.moreAvailable", { count: items.length })}</p>
              <Button type="button" variant="secondary" onClick={() => setMax(max + ITEMS_PAGE)} data-testid="items-show-more">{t("items.filters.showMore")}</Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
