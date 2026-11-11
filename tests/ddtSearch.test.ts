import { describe, it, expect } from "vitest";
import { ddtKey, matchingDdts, ddtsToShow } from "../src/lib/scan/ddtSearch";

// P-164: the search in the DDT menu of "Scan" (one-off exception to the file owners, as P-153 and P-155).
const list = [
  { id: "a", number: "TD-2026/0412" },
  { id: "b", number: "TD-2026/0413" },
  { id: "c", number: "XY 77" },
];

describe("ricerca nel menù dei DDT", () => {
  it("maiuscole, spazi, trattini e barre non contano", () => {
    expect(ddtKey(" Td-2026 / 0412 ")).toBe("td20260412");
    expect(matchingDdts(list, "td 2026-04").map((d) => d.id)).toEqual(["a", "b"]);
    expect(matchingDdts(list, "20260412").map((d) => d.id)).toEqual(["a"]);
    expect(matchingDdts(list, "xy77").map((d) => d.id)).toEqual(["c"]);
  });

  it("una ricerca vuota (o di soli spazi e trattini) mostra tutto", () => {
    expect(matchingDdts(list, "").length).toBe(3);
    expect(matchingDdts(list, " - / ").length).toBe(3);
  });

  it("nessuna corrispondenza: elenco vuoto, ma il DDT già scelto resta nel menù", () => {
    expect(matchingDdts(list, "zzz")).toEqual([]);
    expect(ddtsToShow(list, "zzz", "b").map((d) => d.id)).toEqual(["b"]);
    expect(ddtsToShow(list, "0412", "b").map((d) => d.id)).toEqual(["a", "b"]);
    expect(ddtsToShow(list, "0412", "").map((d) => d.id)).toEqual(["a"]);
  });
});
