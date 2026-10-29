import * as React from "react";
import { useTranslation } from "react-i18next";
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "./ui/form";
import { Button } from "./ui/button";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  value?: (row: T) => string | number | boolean | null | undefined;
  className?: string;
}

// Desk table: sorting, text filter, pagination (§15).
export function DataTable<T extends { id: string }>({ rows, columns, testId, toolbar, pageSize = 25, empty }: {
  rows: T[]; columns: Column<T>[]; testId: string; toolbar?: React.ReactNode; pageSize?: number; empty?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = React.useState(0);
  const val = (c: Column<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.key]) as string | number | null;

  const filtered = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    let out = needle ? rows.filter((r) => columns.some((c) => String(val(c, r) ?? "").toLowerCase().includes(needle))) : rows;
    if (sort) {
      const c = columns.find((x) => x.key === sort.key)!;
      out = [...out].sort((a, b) => String(val(c, a) ?? "").localeCompare(String(val(c, b) ?? ""), undefined, { numeric: true }) * sort.dir);
    }
    return out;
  }, [rows, q, sort, columns]);
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const shown = filtered.slice(page * pageSize, page * pageSize + pageSize);
  React.useEffect(() => { setPage(0); }, [q]);

  return (
    <div className="space-y-3" data-testid={testId}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" aria-hidden />
          <Input aria-label={t("common.filter")} placeholder={t("common.filter")} className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} data-testid={`${testId}-filter`} />
        </div>
        {toolbar}
        <span className="ml-auto text-sm text-muted tabular" data-testid={`${testId}-count`}>{t("common.rows", { count: filtered.length })}</span>
      </div>
      {filtered.length === 0 ? empty ?? <p className="text-sm text-muted py-6">{t("common.noResults")}</p> : (
        <div className="overflow-x-auto rounded border border-border bg-surface">
          <table className="w-full text-sm">
            <thead className="bg-surface-2 text-left">
              <tr>
                {columns.map((c) => (
                  <th key={c.key} scope="col" className="px-3 py-2 font-medium whitespace-nowrap">
                    <button type="button" className="inline-flex items-center gap-1 hover:underline" data-testid={`${testId}-sort-${c.key}`}
                      onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 1 ? -1 : 1 } : { key: c.key, dir: 1 }))}>
                      {c.header}
                      {sort?.key === c.key && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-label={t("common.ascending")} /> : <ArrowDown className="h-3 w-3" aria-label={t("common.descending")} />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-surface-2/50" data-testid={`${testId}-row`}>
                  {columns.map((c) => <td key={c.key} className={`px-3 py-2 align-middle ${c.className ?? ""}`}>{c.render ? c.render(r) : String(val(c, r) ?? "")}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && (
        <div className="flex items-center gap-2 justify-end text-sm">
          <Button size="sm" variant="secondary" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={t("common.previous")} data-testid={`${testId}-prev`}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="tabular">{t("common.page", { page: page + 1, pages })}</span>
          <Button size="sm" variant="secondary" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label={t("common.next")} data-testid={`${testId}-next`}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      )}
    </div>
  );
}
