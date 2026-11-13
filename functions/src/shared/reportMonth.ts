// §13.4: the month a report covers, as "YYYY-MM" (also its file name) with its range [start, end).
// P-204: the range runs from midnight of the 1st to midnight of the next 1st in Italian time (Europe/Rome, summer
// and winter time); before, it was UTC and a reading of the first one or two hours of the 1st fell in the month before.
export interface ReportMonth { label: string; start: Date; end: Date }

const ROME = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const romeParts = (d: Date) => Object.fromEntries(ROME.formatToParts(d).map((p) => [p.type, Number(p.value)])) as Record<string, number>;

// How far Italian time is ahead of UTC at a moment (1 h in winter, 2 h in summer).
function romeOffsetMs(at: number): number {
  const p = romeParts(new Date(at));
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(at / 1000) * 1000;
}

// Midnight of the 1st of a month (1-12; 13 is January of the next year) in Italian time. The change of time happens at
// night on the last Sunday of March and October, never at midnight of a 1st, so two steps are always enough.
function romeMonthStart(year: number, month: number): Date {
  const utc = Date.UTC(year, month - 1, 1);
  return new Date(utc - romeOffsetMs(utc - romeOffsetMs(utc)));
}

// month is 1-12, as the app sends it.
export function reportMonth(year: number, month: number): ReportMonth {
  const first = new Date(Date.UTC(year, month - 1, 1));
  return {
    label: `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}`,
    start: romeMonthStart(year, month),
    end: romeMonthStart(year, month + 1),
  };
}

// The monthly job runs on the 1st (06:00 Italian time) and reports on the month before, as the calendar in Italy says.
export function previousReportMonth(now: Date): ReportMonth {
  const p = romeParts(now);
  return reportMonth(p.month === 1 ? p.year - 1 : p.year, p.month === 1 ? 12 : p.month - 1);
}

// P-120: a moment as the report prints it, dd/mm/yyyy hh:mm in Europe/Rome time (summer and winter time).
export function romeDateTime(d: Date): string {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(d).map((p) => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year} ${parts.hour}:${parts.minute}`;
}
