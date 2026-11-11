import * as React from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router";
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

// The text a rendered cell shows (badges, links, plain text), for filtering and sorting.
function nodeText(n: React.ReactNode): string {
  if (n == null || typeof n === "boolean") return "";
  if (typeof n === "string" || typeof n === "number") return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join(" ");
  if (React.isValidElement(n)) return nodeText((n.props as { children?: React.ReactNode }).children);
  return "";
}

// P-162: what a click on a row leaves to the element it lands on (its own action), not to the row.
const OWN_ACTION = "a, button, input, select, textarea, label, summary, [role='button'], [role='checkbox'], [role='link'], [contenteditable='true']";

// Desk table: sorting, text filter, pagination (§15).
// P-162: with rowHref, a click anywhere on the row opens its page (Ctrl/Cmd/Shift-click or the middle button: a new tab),
// like the "Open" link that stays; a click on a control of the row, or that ends a text selection, does not. The row
// is reached with Tab and opened with Enter. A row whose rowHref gives nothing is a plain row.
export function DataTable<T extends { id: string }>({ rows, columns, testId, toolbar, pageSize = 25, empty, rowHref }: {
  rows: T[]; columns: Column<T>[]; testId: string; toolbar?: React.ReactNode; pageSize?: number; empty?: React.ReactNode;
  rowHref?: (row: T) => string | null | undefined;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ownAction = (e: React.MouseEvent<HTMLTableRowElement>) => {
    const hit = (e.target as Element).closest?.(OWN_ACTION);
    return !!hit && e.currentTarget.contains(hit);
  };
  const openRow = (href: string, newTab: boolean) => {
    if (newTab) window.open(href, "_blank", "noopener");
    else navigate(href);
  };
  const rowProps = (href: string): React.HTMLAttributes<HTMLTableRowElement> & { "data-href": string } => ({
    "data-href": href,
    tabIndex: 0,
    onClick: (e) => {
      if (e.defaultPrevented || ownAction(e)) return;
      if (window.getSelection()?.toString()) return; // the click that ends a text selection
      openRow(href, e.ctrlKey || e.metaKey || e.shiftKey);
    },
    // The middle button: a new tab, without the browser's scrolling mode.
    onMouseDown: (e) => { if (e.button === 1 && !ownAction(e)) e.preventDefault(); },
    onAuxClick: (e) => { if (e.button === 1 && !ownAction(e)) openRow(href, true); },
    onKeyDown: (e) => {
      if (e.key !== "Enter" || e.target !== e.currentTarget) return;
      e.preventDefault();
      openRow(href, e.ctrlKey || e.metaKey);
    },
  });
  const [q, setQ] = React.useState("");
  const [sort, setSort] = React.useState<{ key: string; dir: 1 | -1 } | null>(null);
  const [page, setPage] = React.useState(0);
  // P-116 (n.39): filter and sort on what the cell shows: its value, else the text of what it renders, else the field.
  const val = (c: Column<T>, r: T) => (c.value ? c.value(r) : c.render ? nodeText(c.render(r)) : (r as Record<string, unknown>)[c.key]) as string | number | null;

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
              {shown.map((r) => {
                const href = rowHref?.(r) || null;
                return (
                  <tr key={r.id} data-testid={`${testId}-row`} {...(href ? rowProps(href) : {})}
                    className={`border-t border-border hover:bg-surface-2/50${href ? " cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary" : ""}`}>
                    {columns.map((c) => <td key={c.key} className={`px-3 py-2 align-middle ${c.className ?? ""}`}>{c.render ? c.render(r) : String(val(c, r) ?? "")}</td>)}
                  </tr>
                );
              })}
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
