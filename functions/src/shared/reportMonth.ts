// §13.4: the month a report covers, as "YYYY-MM" (also its file name) with its UTC range [start, end).
export interface ReportMonth { label: string; start: Date; end: Date }

// month is 1-12, as the app sends it.
export function reportMonth(year: number, month: number): ReportMonth {
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 1));
  return { label: `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`, start, end };
}

// The monthly job runs on the 1st and reports on the month before.
export function previousReportMonth(now: Date): ReportMonth {
  return reportMonth(now.getUTCFullYear(), now.getUTCMonth());
}

// P-120: a moment as the report prints it, dd/mm/yyyy hh:mm in Europe/Rome time (summer and winter time).
export function romeDateTime(d: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}
