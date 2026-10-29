import * as React from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Send, Trash2, ScanLine, PackageCheck } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchShipment, watchLines, type Shipment, type ShipmentLine } from "@/lib/data/shipments";
import type { Row } from "@/lib/data/db";
import { isClientRole } from "@shared/roles";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { toast } from "sonner";

// §9.3 / §9.4: shipment detail — send/cancel draft, confirm (return), see arrivals (transfer).
export default function ShipmentDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const nav = useNavigate();
  const [shipment, setShipment] = React.useState<Row<Shipment> | null>(null);
  const [lines, setLines] = React.useState<Row<ShipmentLine>[]>([]);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [ddtNumber, setDdtNumber] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [extra, setExtra] = React.useState<string[]>([]);
  const [extraInput, setExtraInput] = React.useState("");

  React.useEffect(() => id ? watchShipment(id, setShipment) : undefined, [id]);
  React.useEffect(() => id ? watchLines(id, setLines) : undefined, [id]);

  if (!id || !shipment) return <Loading />;
  const role = claims?.role ?? "";
  const isOwnSender = shipment.fromAspId === claims?.orgId;
  const isOwnReceiver = shipment.toAspId === claims?.orgId;
  const client = isClientRole(role);
  const canSend = shipment.status === "draft" && (role === "asp_admin" || role === "asp_warehouse") && isOwnSender;
  const canCancel = shipment.status === "draft" && (isOwnSender || role === "client_admin");
  const canScanDraft = canSend;
  const canConfirm = shipment.kind === "return" && (shipment.status === "sent" || shipment.status === "confirmed") && (role === "client_warehouse" || role === "client_admin");
  const canScanArrival = shipment.kind === "transfer" && shipment.status === "sent" && isOwnReceiver && (role === "asp_admin" || role === "asp_warehouse");

  const send = async () => {
    const payload: Record<string, unknown> = { shipmentId: id };
    if (shipment.kind === "return") { if (!ddtNumber.trim()) { toast.error(t("errors.ddt_number_required")); return; } payload.ddtNumber = ddtNumber.trim(); }
    if (await run(() => call("sendShipment", payload), t("shipments.sent"))) setSendOpen(false);
  };
  const cancel = async () => {
    if (!confirm(t("shipments.cancelConfirm"))) return;
    await run(() => call("cancelShipment", { shipmentId: id }), t("shipments.cancelled"));
  };
  const toggleMissing = (itemId: string) => setMissing((s) => { const n = new Set(s); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
  const addExtra = () => { const c = extraInput.trim(); if (!c) return; setExtra((x) => Array.from(new Set([...x, c]))); setExtraInput(""); };
  const dropExtra = (c: string) => setExtra((x) => x.filter((v) => v !== c));
  const confirmReturn = async () => {
    const confirmed = lines.filter((l) => !missing.has(l.id)).map((l) => l.id);
    const missingArr = [...missing];
    await run(() => call("confirmReturn", { shipmentId: id, confirmed, missing: missingArr, extra }), t("shipments.confirmed"));
    setConfirmOpen(false); setMissing(new Set()); setExtra([]);
  };

  const scanTo = canScanDraft ? `/scan?mode=${shipment.kind === "return" ? "return_ship" : "transfer_out"}&shipmentId=${id}` : canScanArrival ? `/scan?mode=arrive_at_warehouse&shipmentId=${id}` : null;

  const attachDdt = async (file: File) => {
    const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(new Error("read_failed")); r.readAsDataURL(file); });
    await run(() => call("saveDocument", {
      kind: "ddt_return", number: shipment.ddtNumber || `R-${id.slice(0, 6)}`,
      locationId: shipment.fromLocationId, linesSource: "manual", lines: [],
      files: [{ base64, contentType: file.type }], shipmentId: id,
    }), t("documents.attached"));
  };

  const title = `${t(`shipments.kinds.${shipment.kind}`)} · ${id.slice(0, 8)}`;
  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        subtitle={`${t(`shipments.statuses.${shipment.status}`)} · ${formatInstant(shipment.createdAt?.toDate?.() ?? null, i18n.language)}`}
        actions={<>
          {scanTo && <Button asChild><Link to={scanTo} data-testid="shipment-scan"><ScanLine className="h-4 w-4" />{t("shipments.scanPieces")}</Link></Button>}
          {canSend && <Button variant="secondary" onClick={() => setSendOpen(true)} data-testid="shipment-send"><Send className="h-4 w-4" />{t("shipments.send")}</Button>}
          {shipment.kind === "return" && isOwnSender && (shipment.status === "draft" || shipment.status === "sent") && (
            <label className="inline-flex items-center gap-1 rounded border border-border px-3 min-h-touch text-sm cursor-pointer" data-testid="shipment-attach-ddt-wrap">
              {t("documents.attach")}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" data-testid="shipment-attach-ddt" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void attachDdt(f); }} />
            </label>
          )}
          {canConfirm && <Button variant="secondary" onClick={() => setConfirmOpen(true)} data-testid="shipment-confirm"><PackageCheck className="h-4 w-4" />{t("shipments.confirm")}</Button>}
          {canCancel && <Button variant="danger" onClick={cancel} disabled={busy} data-testid="shipment-cancel"><Trash2 className="h-4 w-4" />{t("shipments.cancel")}</Button>}
          <Button variant="ghost" onClick={() => nav(-1)} data-testid="shipment-back">{t("common.back")}</Button>
        </>}
      />
      <Card>
        <h2 className="font-semibold mb-3">{t("shipments.summary")}</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm max-w-xl">
          <dt className="text-muted">{t("shipments.from")}</dt><dd className="font-mono text-xs">{(client || isOwnSender) ? shipment.fromLocationId : t("items.anotherOrg")}</dd>
          <dt className="text-muted">{t("shipments.to")}</dt><dd className="font-mono text-xs">{(client || isOwnReceiver || shipment.kind === "return") ? shipment.toLocationId : t("items.anotherOrg")}</dd>
          <dt className="text-muted">{t("shipments.lineCount")}</dt><dd>{shipment.itemCount ?? lines.length}</dd>
          {shipment.ddtNumber && (<><dt className="text-muted">{t("shipments.ddtNumber")}</dt><dd className="font-mono">{shipment.ddtNumber}</dd></>)}
          {shipment.sentAt && (<><dt className="text-muted">{t("shipments.sentAt")}</dt><dd>{formatInstant(shipment.sentAt.toDate(), i18n.language)}</dd></>)}
          {shipment.confirmedAt && (<><dt className="text-muted">{t("shipments.confirmedAt")}</dt><dd>{formatInstant(shipment.confirmedAt.toDate(), i18n.language)}</dd></>)}
          {shipment.receivedAt && (<><dt className="text-muted">{t("shipments.receivedAt")}</dt><dd>{formatInstant(shipment.receivedAt.toDate(), i18n.language)}</dd></>)}
          {shipment.confirmedComplete !== null && (<><dt className="text-muted">{t("shipments.complete")}</dt><dd>{shipment.confirmedComplete ? t("common.yes") : t("common.no")}</dd></>)}
        </dl>
      </Card>
      <Card>
        <h2 className="font-semibold mb-3">{t("shipments.lines")}</h2>
        {lines.length === 0 ? <Empty title={t("shipments.linesEmpty")} /> : (
          <ul className="divide-y divide-border text-sm" data-testid="shipment-lines">
            {lines.map((l) => (
              <li key={l.id} className="flex items-center gap-3 py-2">
                <span className="font-mono truncate flex-1">{l.codeRaw}</span>
                <span className="text-muted">{l.model ?? "—"}</span>
                {l.arrivedAt && <Badge tone="success">{t("shipments.arrived")}</Badge>}
                {l.confirmedAt && <Badge tone="success">{t("shipments.confirmedLine")}</Badge>}
                {l.missing && <Badge tone="warning">{t("shipments.missing")}</Badge>}
                <Link to={`/items/${l.id}`} className="text-primary hover:underline text-xs" data-testid={`shipment-line-link-${l.id}`}>{t("common.open")}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={sendOpen} onOpenChange={(o) => { if (!o) setSendOpen(false); }}>
        <DialogContent title={t("shipments.send")} description={shipment.kind === "return" ? t("shipments.sendReturnHint") : t("shipments.sendTransferHint")}>
          <div className="space-y-3">
            {shipment.kind === "return" && <Field label={t("shipments.ddtNumber")} htmlFor="d-n"><Input id="d-n" value={ddtNumber} onChange={(e) => setDdtNumber(e.target.value)} data-testid="shipment-ddt-input" /></Field>}
            <div className="flex justify-end"><Button onClick={send} disabled={busy || (shipment.kind === "return" && !ddtNumber.trim())} data-testid="shipment-send-save">{t("shipments.send")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent title={t("shipments.confirm")} description={t("shipments.confirmHint")} className="max-w-2xl">
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <h3 className="font-semibold text-sm">{t("shipments.linesToTick")}</h3>
            <ul className="divide-y divide-border text-sm" data-testid="confirm-lines-list">
              {lines.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2">
                  <input id={`cl-${l.id}`} type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={!missing.has(l.id)} onChange={() => toggleMissing(l.id)} data-testid={`confirm-line-${l.id}`} />
                  <label htmlFor={`cl-${l.id}`} className="font-mono flex-1 truncate">{l.codeRaw}</label>
                  <span className="text-muted">{l.model ?? "—"}</span>
                </li>
              ))}
            </ul>
            <h3 className="font-semibold text-sm mt-4">{t("shipments.extraPieces")}</h3>
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addExtra(); }}>
              <Input className="font-mono" value={extraInput} onChange={(e) => setExtraInput(e.target.value)} placeholder={t("shipments.extraPlaceholder")} data-testid="confirm-extra-input" />
              <Button type="submit" variant="secondary" data-testid="confirm-extra-add">{t("common.add")}</Button>
            </form>
            {extra.length > 0 && <ul className="space-y-1 text-sm font-mono" data-testid="confirm-extra-list">
              {extra.map((c) => <li key={c} className="flex items-center justify-between"><span>{c}</span><Button size="sm" variant="ghost" onClick={() => dropExtra(c)} data-testid={`confirm-extra-remove-${c}`}>×</Button></li>)}
            </ul>}
          </div>
          <div className="flex justify-end mt-4"><Button onClick={confirmReturn} disabled={busy} data-testid="confirm-save">{t("shipments.confirm")}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
