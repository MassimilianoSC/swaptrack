import * as React from "react";
import { useTranslation } from "react-i18next";
import { Search, MapPin, CheckCircle2 } from "lucide-react";
import { useSession } from "@/app/session";
import { loadFieldLocations, type Row, type Location } from "@/lib/data/db";
import { formatInstant, cn } from "@/lib/utils";
import { Input } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Loading, Empty, ErrorState } from "@/components/states";

const META_KEY = "swaptrack.fieldLocationsMeta";

// §5 site picker: one query at sign-in and resume, offline from the cache, instant search. Never pre-selects.
export default function SitePicker() {
  const { t, i18n } = useTranslation();
  const { claims, location, setLocation } = useSession();
  const [list, setList] = React.useState<Row<Location>[] | null>(null);
  const [error, setError] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [meta, setMeta] = React.useState<{ count: number; at: number } | null>(() => {
    try { return JSON.parse(localStorage.getItem(META_KEY) ?? "null"); } catch { return null; }
  });
  const wanted = claims?.role === "asp_technician" ? "site" : "asp_warehouse";

  const load = React.useCallback(async () => {
    setError(false);
    try {
      const r = await loadFieldLocations(claims!.orgId!);
      const usable = r.list.filter((l) => l.active && l.type === wanted);
      setList(usable);
      if (!r.fromCache) {
        const m = { count: usable.length, at: Date.now() };
        localStorage.setItem(META_KEY, JSON.stringify(m));
        setMeta(m);
      }
    } catch { setError(true); }
  }, [claims, wanted]);

  React.useEffect(() => {
    void load();
    const onVis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [load]);

  const results = React.useMemo(() => {
    const n = q.trim().toLowerCase();
    const all = list ?? [];
    return (n ? all.filter((l) => l.code.toLowerCase().includes(n) || l.name.toLowerCase().includes(n)) : all).slice(0, 50);
  }, [list, q]);

  if (error) return <ErrorState message={t("location.loadError")} onRetry={load} />;
  if (!list) return <Loading />;
  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-2xl font-semibold" data-testid="page-title">{t(wanted === "site" ? "location.pickSite" : "location.pickWarehouse")}</h1>
      <p className="text-sm text-muted tabular" data-testid="site-picker-offline-info">
        {t("location.offlineInfo", { count: meta?.count ?? list.length, when: formatInstant(meta ? new Date(meta.at) : null, i18n.language) })}
      </p>
      {location && (
        <div className="rounded border-2 border-primary p-4 flex items-center gap-3" data-testid="site-picker-selected">
          <CheckCircle2 className="h-6 w-6 text-primary" aria-hidden />
          <div className="flex-1"><p className="text-xs text-muted">{t("location.selected")}</p><p className="font-semibold"><span className="font-mono">{location.code}</span> · {location.name}</p></div>
          <Button variant="secondary" onClick={() => setLocation(null)} data-testid="site-picker-clear">{t("location.change")}</Button>
        </div>
      )}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted" aria-hidden />
        <Input aria-label={t("location.search")} placeholder={t("location.search")} className="pl-12 text-base" value={q} onChange={(e) => setQ(e.target.value)} data-testid="site-picker-search" />
      </div>
      {list.length === 0 ? <Empty title={t("location.none")} hint={t("location.noneHint")} /> : results.length === 0 ? <p className="text-muted">{t("common.noResults")}</p> : (
        <ul className="space-y-2" data-testid="site-picker-results">
          {results.map((l) => (
            <li key={l.id}>
              <button type="button" onClick={() => setLocation({ id: l.id, code: l.code, name: l.name, type: l.type })} data-testid="site-picker-item"
                className={cn("w-full text-left rounded border border-border bg-surface px-4 min-h-touch py-2 flex items-center gap-3 hover:border-primary", location?.id === l.id && "border-primary")}>
                <MapPin className="h-5 w-5 shrink-0" aria-hidden />
                <span className="font-mono font-medium">{l.code}</span>
                <span className="truncate text-muted">{l.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
