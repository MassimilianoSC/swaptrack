// P-100: names in place of ids (places and organizations) on every page. The lists are read once per user and kept for
// the pages that follow. An ASP reads only its own organization and its own places (firestore.rules): any other one is
// "another ASP" / "a place of another ASP", never its id (criterion 1).
import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { listLocationsFor, listOrganizations, getOrganization, type Row, type Location } from "@/lib/data/db";
import { isClientRole } from "@shared/roles";

interface Lists { places: Map<string, Row<Location>>; orgs: Map<string, string> }
let cache: { key: string; lists: Promise<Lists> } | null = null;

function load(role: string, orgId: string): Promise<Lists> {
  const key = `${role}|${orgId}`;
  if (cache?.key === key) return cache.lists;
  const lists = Promise.all([
    listLocationsFor({ role, orgId }).catch(() => [] as Row<Location>[]),
    (isClientRole(role) ? listOrganizations() : getOrganization(orgId).then((o) => (o ? [o] : []))).catch(() => []),
  ]).then(([p, o]) => ({ places: new Map(p.map((l) => [l.id, l])), orgs: new Map(o.map((x) => [x.id, x.name])) }));
  cache = { key, lists };
  lists.catch(() => { cache = null; });
  return lists;
}

export function useNames() {
  const { t } = useTranslation();
  const { claims } = useSession();
  const role = claims?.role ?? "";
  const [lists, setLists] = React.useState<Lists | null>(null);
  React.useEffect(() => {
    if (!claims?.orgId) return;
    let gone = false;
    void load(role, claims.orgId).then((l) => { if (!gone) setLists(l); });
    return () => { gone = true; };
  }, [role, claims?.orgId]);
  const client = isClientRole(role);
  return React.useMemo(() => ({
    // "MAG-NORD-01 · Magazzino Nord 1"; "…" while the lists load.
    place: (id: string | null | undefined): string => {
      if (!id) return "—";
      if (!lists) return "…";
      const l = lists.places.get(id);
      return l ? `${l.code} · ${l.name}` : client ? id : t("names.otherPlace");
    },
    org: (id: string | null | undefined): string => {
      if (!id) return "—";
      if (id === "client") return t("names.client");
      if (!lists) return "…";
      return lists.orgs.get(id) ?? (client ? id : t("names.otherAsp"));
    },
  }), [lists, client, t]);
}
