import * as React from "react";
import { collection, getDocs, getDocsFromCache, query, where, type Query } from "firebase/firestore";
import { db } from "./firebase";
import { isClientRole } from "@shared/roles";
import type { Row, Location } from "./db";

// P-166: the locations of a page where an empty menu stops the work (a new document, a new return or transfer). The
// pages asked the server once, with no limit and no second try: with a weak signal the menu stayed empty and nothing
// said why. As P-125: the server has QUICK_MS, then the device's copy is used; the server's late answer replaces it; asked
// again when the network comes back and every RETRY_MS while the list is the copy and the page is visible.
const QUICK_MS = 6000;
const RETRY_MS = 30_000;

function queriesFor(scope: { role: string; orgId: string }): Query[] {
  if (isClientRole(scope.role)) return [query(collection(db, "locations"))];
  return [query(collection(db, "locations"), where("aspId", "==", scope.orgId)), query(collection(db, "locations"), where("type", "==", "client_warehouse"))];
}
const merge = (lists: Row<Location>[][]) => {
  const seen = new Set<string>();
  return lists.flat().filter((l) => !seen.has(l.id) && seen.add(l.id));
};
const rowsOf = (s: { docs: Array<{ id: string; data(): unknown }> }) => s.docs.map((d) => ({ id: d.id, ...(d.data() as Location) }));

export function useLocationsFor(scope: { role: string; orgId: string } | null): Row<Location>[] {
  const [list, setList] = React.useState<Row<Location>[]>([]);
  const role = scope?.role ?? "";
  const orgId = scope?.orgId ?? "";
  React.useEffect(() => {
    if (!role || !orgId) return;
    let gone = false;
    let fromCopy = true;
    let asking = false;
    const ask = async () => {
      if (asking) return;
      asking = true;
      const qs = queriesFor({ role, orgId });
      const server = Promise.all(qs.map((q) => getDocs(q)));
      // The server's answer, whenever it comes, wins over the copy.
      void server.then((snaps) => {
        if (gone || snaps.some((s) => s.metadata.fromCache)) return;
        fromCopy = false;
        setList(merge(snaps.map(rowsOf)));
      }, () => undefined).finally(() => { asking = false; });
      try {
        await Promise.race([server, new Promise<never>((_, reject) => setTimeout(() => reject(new Error("slow")), QUICK_MS))]);
      } catch {
        const copies = await Promise.all(qs.map((q) => getDocsFromCache(q).then(rowsOf, () => [] as Row<Location>[])));
        if (!gone && fromCopy) setList(merge(copies));
      }
    };
    void ask();
    const again = () => { if (fromCopy && document.visibilityState === "visible") void ask(); };
    window.addEventListener("online", again);
    const timer = setInterval(again, RETRY_MS);
    return () => { gone = true; window.removeEventListener("online", again); clearInterval(timer); };
  }, [role, orgId]);
  return list;
}
