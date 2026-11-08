import * as React from "react";

// P-155: the times of the last readings on the scanning screen, shown only on request (/scan?scanlog=1, kept for the
// browser session), to measure on a real phone what no test can: from the code being recognised to each signal.
const KEY = "swaptrack.scanlog";
const MAX_ROWS = 10;

export type ScanLogMark = "first" | "piece" | "rules";
export type ScanLogEnd = "green" | "yellow" | "red" | "window";
export interface ScanLogRow {
  id: number;
  code: string;
  first?: number;
  piece?: number;
  rules?: number;
  end?: number;
  endKind?: ScanLogEnd;
  copy?: boolean; // the server was late: the piece came from the phone's copy
}
export interface ScanLog {
  on: boolean;
  rows: ScanLogRow[];
  start: (code: string) => void;
  mark: (what: ScanLogMark) => void;
  usedCopy: () => void;
  end: (kind: ScanLogEnd) => void;
}

function enabled(requested: boolean): boolean {
  try {
    if (requested) sessionStorage.setItem(KEY, "1");
    return sessionStorage.getItem(KEY) === "1";
  } catch { return requested; }
}

export function useScanLog(requested: boolean): ScanLog {
  const [on] = React.useState(() => enabled(requested));
  const [rows, setRows] = React.useState<ScanLogRow[]>([]);
  const current = React.useRef<{ id: number; at: number } | null>(null);
  const nextId = React.useRef(1);
  return React.useMemo(() => {
    const change = (fn: (r: ScanLogRow, ms: number) => ScanLogRow) => {
      const c = current.current;
      if (!c) return;
      const ms = Math.round(performance.now() - c.at);
      setRows((all) => all.map((r) => (r.id === c.id ? fn(r, ms) : r)));
    };
    if (!on) return { on, rows: [], start: () => undefined, mark: () => undefined, usedCopy: () => undefined, end: () => undefined };
    return {
      on,
      rows,
      start: (code) => {
        const id = nextId.current++;
        current.current = { id, at: performance.now() };
        setRows((all) => [{ id, code }, ...all].slice(0, MAX_ROWS));
      },
      mark: (what) => change((r, ms) => ({ ...r, [what]: ms })),
      usedCopy: () => change((r) => ({ ...r, copy: true })),
      end: (kind) => {
        change((r, ms) => ({ ...r, end: ms, endKind: kind }));
        current.current = null;
      },
    };
  }, [on, rows]);
}
