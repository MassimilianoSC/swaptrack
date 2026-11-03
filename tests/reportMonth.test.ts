import { describe, it, expect } from "vitest";
import { reportMonth, previousReportMonth, romeDateTime } from "../functions/src/shared/reportMonth";

// §13.4: the label is the month the report covers (and the start of its file name, reports/{scope}/{label}-{stamp}.pdf).
// Before: the on-demand report of October was labelled "2026-09" (overwriting September's file) and the
// January run of the monthly job wrote "2027-00".
describe("reportMonth", () => {
  it("on demand: the month asked (1-12) and its UTC range", () => {
    const r = reportMonth(2026, 10);
    expect(r.label).toBe("2026-10");
    expect(r.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(r.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
    expect(reportMonth(2027, 1).label).toBe("2027-01");
    expect(reportMonth(2026, 12).end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
  it("monthly job: the month before the run, also across the year", () => {
    const jan = previousReportMonth(new Date("2027-01-01T05:00:00Z"));
    expect(jan.label).toBe("2026-12");
    expect(jan.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(jan.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
    expect(previousReportMonth(new Date("2026-11-01T05:00:00Z")).label).toBe("2026-10");
  });
});

// P-120: the time of the end-of-month numbers, in Rome time, as the report prints it.
describe("romeDateTime", () => {
  it("dd/mm/yyyy hh:mm in Europe/Rome, summer and winter time", () => {
    expect(romeDateTime(new Date(Date.UTC(2026, 10, 1, 5, 0)))).toBe("01/11/2026 06:00");
    expect(romeDateTime(new Date(Date.UTC(2026, 6, 1, 4, 30)))).toBe("01/07/2026 06:30");
  });
});
