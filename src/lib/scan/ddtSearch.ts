// P-164: finding a DDT by its number in the menu of "Scan". A number is matched as it is typed on the phone or read on
// the paper: case, spaces, dashes and slashes do not count. Nothing is ever chosen by the search (P-24: the choice is
// the user's); the DDT already chosen stays in the list even when it does not match, so the menu never hides it.
export const ddtKey = (s: string): string => s.toLowerCase().replace(/[\s\-/]/g, "");

export function matchingDdts<T extends { number: string }>(list: T[], query: string): T[] {
  const k = ddtKey(query);
  return k ? list.filter((d) => ddtKey(d.number).includes(k)) : list;
}

export function ddtsToShow<T extends { id: string; number: string }>(list: T[], query: string, chosenId: string): T[] {
  const k = ddtKey(query);
  return k ? list.filter((d) => d.id === chosenId || ddtKey(d.number).includes(k)) : list;
}
