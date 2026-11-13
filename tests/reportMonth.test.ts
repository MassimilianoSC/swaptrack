import { describe, it, expect } from "vitest";
import { reportMonth, previousReportMonth, romeDateTime } from "../functions/src/shared/reportMonth";

// §13.4: the label is the month the report covers (and the start of its file name, reports/{scope}/{label}-{stamp}.pdf).
// Before: the on-demand report of October was labelled "2026-09" (overwriting September's file) and the
// January run of the monthly job wrote "2027-00".
// P-204 (census by role): the month runs from midnight to midnight in Italian time (Europe/Rome), not in UTC. Before,
// a reading between 00:00 and 01:00 (winter) or 02:00 (summer) of the 1st, Italian time, fell in the month before.
describe("reportMonth", () => {
  it("on demand: the month asked (1-12), from midnight to midnight in Italian time", () => {
    const r = reportMonth(2026, 10);
    expect(r.label).toBe("2026-10");
    expect(r.start.toISOString()).toBe("2026-09-30T22:00:00.000Z"); // 1 October 00:00, summer time (UTC+2)
    expect(r.end.toISOString()).toBe("2026-10-31T23:00:00.000Z"); // 1 November 00:00, winter time (UTC+1)
    expect(reportMonth(2027, 1).label).toBe("2027-01");
    expect(reportMonth(2026, 12).end.toISOString()).toBe("2026-12-31T23:00:00.000Z"); // 1 January 2027 00:00
  });
  it("the months with the change of time: March and October", () => {
    const mar = reportMonth(2027, 3); // summer time from 28 March 2027
    expect([mar.start.toISOString(), mar.end.toISOString()]).toEqual(["2027-02-28T23:00:00.000Z", "2027-03-31T22:00:00.000Z"]);
    const oct = reportMonth(2027, 10); // winter time from 31 October 2027
    expect([oct.start.toISOString(), oct.end.toISOString()]).toEqual(["2027-09-30T22:00:00.000Z", "2027-10-31T23:00:00.000Z"]);
  });
  it("a reading at 00:30 of the 1st, Italian time, is in that month, not in the month before", () => {
    const nov1 = new Date("2026-10-31T23:30:00Z"); // 1 November 2026, 00:30 in Italy
    const oct = reportMonth(2026, 10), nov = reportMonth(2026, 11);
    expect(nov1 >= oct.end).toBe(true);
    expect(nov1 >= nov.start && nov1 < nov.end).toBe(true);
    const jul1 = new Date("2026-06-30T22:30:00Z"); // 1 July 2026, 00:30 in Italy (summer time)
    expect(jul1 >= reportMonth(2026, 7).start).toBe(true);
    expect(jul1 < reportMonth(2026, 6).end).toBe(false);
  });
  it("monthly job: the month before the run (06:00 of the 1st, Italian time), also across the year", () => {
    const jan = previousReportMonth(new Date("2027-01-01T05:00:00Z"));
    expect(jan.label).toBe("2026-12");
    expect(jan.start.toISOString()).toBe("2026-11-30T23:00:00.000Z");
    expect(jan.end.toISOString()).toBe("2026-12-31T23:00:00.000Z");
    expect(previousReportMonth(new Date("2026-11-01T05:00:00Z")).label).toBe("2026-10");
    // The 1st just after midnight in Italy is still the last day of the month before in UTC.
    expect(previousReportMonth(new Date("2026-10-31T23:30:00Z")).label).toBe("2026-10");
  });
});

// P-120: the time of the end-of-month numbers, in Rome time, as the report prints it.
describe("romeDateTime", () => {
  it("dd/mm/yyyy hh:mm in Europe/Rome, summer and winter time", () => {
    expect(romeDateTime(new Date(Date.UTC(2026, 10, 1, 5, 0)))).toBe("01/11/2026 06:00");
    expect(romeDateTime(new Date(Date.UTC(2026, 6, 1, 4, 30)))).toBe("01/07/2026 06:30");
  });
});
