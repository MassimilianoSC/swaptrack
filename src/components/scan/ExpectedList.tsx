import * as React from "react";
import { AlertTriangle, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";


// The pieces "Scan" expects, ticked as they are read: the BOM of a site (§12.1, P-175) and the pieces of an incoming
// transfer (P-189). Two views of the same list: a summary on the video that opens it over the video (no height taken
// from the video, P-155), and a section below. testId gives the prefix of every test id (scan-bom, scan-transfer).
export interface ExpectedLine { key: string; codeRaw: string; done: boolean }
// P-188: a line without serial: so many pieces of a model (material code), counted as they are read.
export interface QuantityItem { key: string; label: string; expected: number; counted: number }

export function QuantityRow({ q, testId, className }: { q: QuantityItem; testId: string; className?: string }) {
  const done = q.counted >= q.expected;
  return (
    <li className={cn("flex items-center gap-2", className, done && "text-success")} data-testid={`${testId}-${done ? "done" : "todo"}`}>
      <Check className={cn("h-4 w-4 shrink-0", done ? "" : "opacity-30")} aria-hidden />
      <span className="min-w-0 truncate">{q.label}</span>
      <span className="ml-auto shrink-0 tabular font-semibold" data-testid={`${testId}-count`}>{q.counted}/{q.expected}</span>
    </li>
  );
}
export interface ExpectedListProps {
  testId: string;
  chip: string; // the summary on the video, e.g. "BOM 1/2"
  title: string; // the section's title
  name: string | null; // the document's number, the shipment's places
  subtitle: string;
  lines: ExpectedLine[];
  quantities?: QuantityItem[];
  noLines: string;
  unexpected: string[];
  unexpectedTitle: string;
}

export function ExpectedChip({ p, hidden }: { p: ExpectedListProps; hidden: boolean }) {
  const [open, setOpen] = React.useState(false);
  if (hidden) return null;
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="absolute right-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs font-semibold text-white" data-testid={`${p.testId}-chip`}>
        {p.chip} {open ? "▴" : "▾"}
      </button>
      {open && (
        <div className="absolute inset-x-2 top-9 max-h-[70%] overflow-y-auto rounded bg-black/80 p-2 text-white" data-testid={`${p.testId}-overlay`}>
          {p.name && <p className="truncate font-mono text-xs font-semibold" data-testid={`${p.testId}-overlay-number`}>{p.name}</p>}
          <p className="mb-1 text-xs">{p.subtitle}</p>
          {p.lines.length === 0 && !p.quantities?.length ? <p className="text-xs">{p.noLines}</p> : (
            <ul className="space-y-1 font-mono text-xs">
              {p.lines.map((line) => (
                <li key={line.key} className={cn("flex items-center gap-2", line.done && "text-success")} data-testid={`${p.testId}-overlay-${line.done ? "done" : "todo"}`}>
                  <Check className={cn("h-4 w-4 shrink-0", line.done ? "" : "opacity-30")} aria-hidden /><span className="truncate">{line.codeRaw}</span>
                </li>
              ))}
              {p.quantities?.map((q) => <QuantityRow key={q.key} q={q} testId={`${p.testId}-overlay-qty`} />)}
            </ul>
          )}
        </div>
      )}
    </>
  );
}

// P-188: the pieces done and expected, serials and quantities together (a quantity line counts up to its quantity).
export function expectedProgress(lines: ExpectedLine[], quantities: QuantityItem[] = []) {
  return {
    done: lines.filter((l) => l.done).length + quantities.reduce((n, q) => n + Math.min(q.counted, q.expected), 0),
    total: lines.length + quantities.reduce((n, q) => n + q.expected, 0),
  };
}

export function ExpectedSection({ p }: { p: ExpectedListProps }) {
  const { done, total } = expectedProgress(p.lines, p.quantities);
  return (
    <details data-testid={`${p.testId}-section`} className="rounded border border-border px-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 min-h-touch font-semibold [&::-webkit-details-marker]:hidden" data-testid={`${p.testId}-toggle`}>
        {p.title} · <span className="tabular" data-testid={`${p.testId}-count`}>{done}/{total}</span>
        {p.name && <span className="min-w-0 truncate text-xs text-muted font-mono font-normal" data-testid={`${p.testId}-number`}>{p.name}</span>}
        <ChevronDown className="ml-auto h-5 w-5" aria-hidden />
      </summary>
      <div className="pb-3">
        <p className="text-xs text-muted mb-2">{p.subtitle}</p>
        {p.lines.length === 0 && !p.quantities?.length ? (
          <p className="text-sm text-muted">{p.noLines}</p>
        ) : (
          <ul className="space-y-1 text-sm" data-testid={`${p.testId}-lines`}>
            {p.lines.map((line) => (
              <li key={line.key} className={cn("flex items-center gap-2 border-b border-border py-1 font-mono text-xs", line.done && "text-success")} data-testid={`${p.testId}-line-${line.done ? "done" : "todo"}`}>
                <Check className={cn("h-4 w-4", line.done ? "" : "opacity-30")} aria-hidden />
                <span className="truncate">{line.codeRaw}</span>
              </li>
            ))}
            {p.quantities?.map((q) => <QuantityRow key={q.key} q={q} testId={`${p.testId}-qty`} className="border-b border-border py-1 font-mono text-xs" />)}
          </ul>
        )}
        {p.unexpected.length > 0 && (
          <>
            <p className="text-xs text-warning font-semibold mt-3 flex items-center gap-2" data-testid={`${p.testId}-unexpected-title`}>
              <AlertTriangle className="h-4 w-4" aria-hidden />
              {p.unexpectedTitle}
            </p>
            <ul className="space-y-1 text-xs font-mono mt-1 text-warning" data-testid={`${p.testId}-unexpected-list`}>
              {p.unexpected.map((c) => <li key={c} className="truncate">{c}</li>)}
            </ul>
          </>
        )}
      </div>
    </details>
  );
}
