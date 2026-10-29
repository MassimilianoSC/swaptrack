import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Plus, Truck, PackageCheck } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchShipments, type Shipment } from "@/lib/data/shipments";
import { listLocations, type Row, type Location } from "@/lib/data/db";
import { isClientRole } from "@shared/roles";
import { PageHeader, Badge } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { Button } from "@/components/ui/button";
import { Select, Field } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loading } from "@/components/states";
import { formatInstant } from "@/lib/utils";

// §9.3 / §9.4: shipments list — return + transfer. Create actions depend on role.
export default function Shipments() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const [all, setAll] = React.useState<Row<Shipment>[] | null>(null);
  const [locations, setLocations] = React.useState<Row<Location>[]>([]);
  const [newKind, setNewKind] = React.useState<"return" | "transfer" | null>(null);
  const [fromLoc, setFromLoc] = React.useState("");
  const [toLoc, setToLoc] = React.useState("");

  React.useEffect(() => claims?.orgId ? watchShipments({ role: claims.role!, orgId: claims.orgId }, setAll) : undefined, [claims]);
  React.useEffect(() => { void listLocations().then(setLocations).catch(() => undefined); }, []);

  const role = claims?.role ?? "";
  const client = isClientRole(role);
  const canReturn = role === "asp_admin" || role === "asp_warehouse";
  const canTransferWithin = canReturn;
  const canTransferBetween = role === "client_admin";

  const warehousesOfOwn = locations.filter((l) => l.type === "asp_warehouse" && l.aspId === claims?.orgId && l.active);
  const clientWarehouses = locations.filter((l) => l.type === "client_warehouse" && l.active);
  const asps = React.useMemo(() => Array.from(new Set(locations.filter((l) => l.type === "asp_warehouse").map((l) => l.aspId))).filter(Boolean) as string[], [locations]);
  const warehousesByAsp = (aspId: string) => locations.filter((l) => l.type === "asp_warehouse" && l.aspId === aspId && l.active);

  const openCreate = (kind: "return" | "transfer") => { setNewKind(kind); setFromLoc(""); setToLoc(""); };
  const create = async () => {
    if (!fromLoc || !toLoc) return;
    const r = await run(() => call<{ shipmentId: string }>("createShipment", { kind: newKind, fromLocationId: fromLoc, toLocationId: toLoc }), t("shipments.created"));
    if (r?.shipmentId) { setNewKind(null); window.location.href = `/shipments/${r.shipmentId}`; }
  };

  if (!all) return <Loading />;
  const toneFor = (s: string) => s === "draft" ? "warning" : s === "cancelled" ? "neutral" : s === "sent" ? "primary" : s === "received" || s === "confirmed" ? "success" : "neutral";

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("nav.shipments")}
        subtitle={t("shipments.subtitle")}
        actions={<>
          {canReturn && <Button onClick={() => openCreate("return")} data-testid="shipments-new-return"><Truck className="h-4 w-4" />{t("shipments.newReturn")}</Button>}
          {(canTransferWithin || canTransferBetween) && <Button variant="secondary" onClick={() => openCreate("transfer")} data-testid="shipments-new-transfer"><Plus className="h-4 w-4" />{t("shipments.newTransfer")}</Button>}
        </>}
      />
      <DataTable testId="shipments-table" rows={all} columns={[
        { key: "kind", header: t("shipments.kind"), render: (s) => <Badge>{t(`shipments.kinds.${s.kind}`)}</Badge> },
        { key: "status", header: t("common.status"), render: (s) => <Badge tone={toneFor(s.status) as "warning" | "neutral" | "primary" | "success"}>{t(`shipments.statuses.${s.status}`)}</Badge> },
        { key: "from", header: t("shipments.from"), value: (s) => client ? s.fromLocationId : (s.fromAspId === claims?.orgId ? s.fromLocationId : t("items.anotherOrg")), className: "font-mono text-xs" },
        { key: "to", header: t("shipments.to"), value: (s) => client ? s.toLocationId : (s.toAspId === claims?.orgId || s.kind === "return" ? s.toLocationId : t("items.anotherOrg")), className: "font-mono text-xs" },
        { key: "n", header: t("shipments.lineCount"), value: (s) => s.itemCount ?? 0 },
        { key: "ddt", header: t("shipments.ddtNumber"), value: (s) => s.ddtNumber ?? "—", className: "font-mono text-xs" },
        { key: "at", header: t("shipments.created"), value: (s) => formatInstant(s.createdAt?.toDate?.() ?? null, i18n.language) },
        { key: "a", header: "", render: (s) => <Link to={`/shipments/${s.id}`} className="text-primary hover:underline" data-testid={`shipments-row-${s.id}`}><PackageCheck className="inline h-4 w-4" /> {t("common.open")}</Link> },
      ]} />
      <Dialog open={!!newKind} onOpenChange={(o) => { if (!o) setNewKind(null); }}>
        <DialogContent title={newKind === "return" ? t("shipments.newReturn") : t("shipments.newTransfer")} description={t("shipments.createHint")}>
          <div className="space-y-3">
            <Field label={t("shipments.from")} htmlFor="s-f">
              <Select id="s-f" value={fromLoc} onChange={(e) => setFromLoc(e.target.value)} data-testid="shipments-from-select">
                <option value="">{t("common.choose")}</option>
                {(canTransferBetween && newKind === "transfer" ? locations.filter((l) => l.type === "asp_warehouse" && l.active) : warehousesOfOwn).map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
              </Select>
            </Field>
            <Field label={t("shipments.to")} htmlFor="s-t">
              <Select id="s-t" value={toLoc} onChange={(e) => setToLoc(e.target.value)} data-testid="shipments-to-select">
                <option value="">{t("common.choose")}</option>
                {newKind === "return" ? clientWarehouses.map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)
                  : (canTransferBetween ? asps.flatMap((a) => warehousesByAsp(a)) : warehousesOfOwn).filter((l) => l.id !== fromLoc).map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
              </Select>
            </Field>
            <div className="flex justify-end"><Button disabled={busy || !fromLoc || !toLoc} onClick={create} data-testid="shipments-create">{t("shipments.create")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
