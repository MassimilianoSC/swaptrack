import * as React from "react";
import { useParams, Link, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { Send, Trash2, ScanLine, PackageCheck } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchShipment, watchLines, type Shipment, type ShipmentLine } from "@/lib/data/shipments";
import { searchItemByCode } from "@/lib/data/items";
import type { Row } from "@/lib/data/db";
import { isClientRole } from "@shared/roles";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/dialogs";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { compressImage } from "@/lib/imageCompress.js";
import { toast } from "sonner";
import { useNames } from "@/lib/names";

// §9.3 / §9.4: shipment detail — send/cancel draft, confirm (return), see arrivals (transfer).
export default function ShipmentDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const names = useNames();
  const nav = useNavigate();
  const { busy, run } = useAction();
  const [shipment, setShipment] = React.useState<Row<Shipment> | null>(null);
  const [lines, setLines] = React.useState<Row<ShipmentLine>[]>([]);
  const [sendOpen, setSendOpen] = React.useState(false);
  const [ddtNumber, setDdtNumber] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [missing, setMissing] = React.useState<Set<string>>(new Set());
  const [extra, setExtra] = React.useState<string[]>([]);
  const [extraInput, setExtraInput] = React.useState("");
  // P-151: the app's window, never the browser's confirm (before the early return: a hook, React's rule).
  const [cancelling, setCancelling] = React.useState(false);
  // P-200: the DDT file waiting for the DDT number (asked before the first file).
  const [attachFile, setAttachFile] = React.useState<File | null>(null);
  const [attachNumber, setAttachNumber] = React.useState("");

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
  // P-186, §9.3: once confirmed, a return is confirmed again only for its missing pieces that arrived later: the
  // window then lists the lines still open, none ticked, and no extra pieces (the server refuses them).
  const openLines = lines.filter((l) => !l.confirmedAt && !l.confirmedElsewhere);
  const late = shipment.status === "confirmed";
  const confirmLines = late ? openLines : lines;
  const extraCodes = (shipment as Shipment & { extraCodes?: string[] }).extraCodes ?? [];
  const withDifferences = late && shipment.confirmedComplete === false;
  const canConfirm = shipment.kind === "return" && (shipment.status === "sent" || (late && openLines.length > 0)) && (role === "client_warehouse" || role === "client_admin");
  const openConfirm = () => { setMissing(new Set(late ? openLines.map((l) => l.id) : [])); setExtra([]); setConfirmOpen(true); };
  const canScanArrival = shipment.kind === "transfer" && shipment.status === "sent" && isOwnReceiver && (role === "asp_admin" || role === "asp_warehouse");

  const send = async () => {
    const payload: Record<string, unknown> = { shipmentId: id };
    if (shipment.kind === "return") { if (!ddtNumber.trim()) { toast.error(t("errors.ddt_number_required")); return; } payload.ddtNumber = ddtNumber.trim(); }
    // P-200: the DDT document of the return and the shipment always carry the same number: a number changed here makes a
    // new version of the document first (its files and history kept), then the shipment is sent.
    const renumber = shipment.kind === "return" && !!shipment.documentId && !!shipment.ddtNumber && payload.ddtNumber !== shipment.ddtNumber;
    let done = false;
    await run(async () => {
      if (renumber) await call("saveDocument", { documentId: shipment.documentId, kind: "ddt_return", number: payload.ddtNumber, locationId: shipment.fromLocationId, linesSource: "manual", lines: [], shipmentId: id });
      await call("sendShipment", payload);
      done = true;
    }, t("shipments.sent"));
    if (done) setSendOpen(false);
  };
  const cancel = async () => {
    setCancelling(false);
    await run(() => call("cancelShipment", { shipmentId: id }), t("shipments.cancelled"));
  };
  const toggleMissing = (itemId: string) => setMissing((s) => { const n = new Set(s); n.has(itemId) ? n.delete(itemId) : n.add(itemId); return n; });
  const addExtra = () => { const c = extraInput.trim(); if (!c) return; setExtra((x) => Array.from(new Set([...x, c]))); setExtraInput(""); };
  const dropExtra = (c: string) => setExtra((x) => x.filter((v) => v !== c));
  const confirmReturn = async () => {
    // A line confirmed in another return is already decided (the server skips it as well).
    const confirmed = confirmLines.filter((l) => !missing.has(l.id) && !l.confirmedElsewhere).map((l) => l.id);
    const missingArr = [...missing];
    // P-199: the window closes, and forgets the ticks and the extra pieces, only when the server has confirmed; with an
    // error (no network, a refusal) it stays as it is, with the message, so the work can be sent again.
    let done = false;
    await run(async () => { await call("confirmReturn", { shipmentId: id, confirmed, missing: missingArr, extra: late ? [] : extra }); done = true; }, t("shipments.confirmed"));
    if (!done) return;
    setConfirmOpen(false); setMissing(new Set()); setExtra([]);
  };

  // P-115 (n.28): the reading opens at the shipment's place (departure to prepare it, destination for its arrival).
  const scanTo = canScanDraft ? `/scan?mode=${shipment.kind === "return" ? "return_ship" : "transfer_out"}&shipmentId=${id}&location=${shipment.fromLocationId}`
    : canScanArrival ? `/scan?mode=arrive_at_warehouse&shipmentId=${id}&location=${shipment.toLocationId}` : null;

  // P-200: the DDT file of a return goes into one document with the DDT's real number. Without a number yet it is asked
  // first (it was made up as "R-xxxxxx" and became the shipment's DDT number); a later file is a new version of the same
  // document (every file made a new document).
  const attachDdt = (file: File, number: string) => run(async () => {
    // §7.3: a photo is never uploaded as taken: re-encoded (at most 1200 px, JPEG), which also drops EXIF and GPS.
    const isImage = file.type.startsWith("image/");
    const blob = isImage ? await compressImage(file).catch(() => { throw new Error("image_unreadable"); }) : file;
    const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(new Error("read_failed")); r.readAsDataURL(blob); });
    const r = await call("saveDocument", {
      ...(shipment.documentId ? { documentId: shipment.documentId } : {}),
      kind: "ddt_return", number, locationId: shipment.fromLocationId, linesSource: "manual", lines: [],
      // P-176: the file keeps its name (a photo becomes a JPEG: its name too).
      files: [{ base64, contentType: isImage ? "image/jpeg" : file.type, name: isImage ? file.name.replace(/\.[^.]+$/, ".jpg") : file.name }], shipmentId: id,
    });
    setAttachFile(null);
    return r;
  }, t("documents.attached"));
  const pickDdtFile = (file: File) => {
    if (shipment.ddtNumber) { void attachDdt(file, shipment.ddtNumber); return; }
    setAttachNumber(""); setAttachFile(file);
  };

  // P-205: the shipment is called by its DDT number, or by its places (it was called by 8 letters of its id). The other
  // ASP's place stays "another organization", as in the summary.
  const fromName = (client || isOwnSender) ? names.place(shipment.fromLocationId) : t("items.anotherOrg");
  const toName = (client || isOwnReceiver || shipment.kind === "return") ? names.place(shipment.toLocationId) : t("items.anotherOrg");
  const kindName = t(`shipments.kinds.${shipment.kind}`);
  const title = shipment.ddtNumber ? t("shipments.titleDdt", { kind: kindName, number: shipment.ddtNumber }) : t("shipments.titleRoute", { kind: kindName, from: fromName, to: toName });
  return (
    <div className="space-y-6">
      <PageHeader
        back="/shipments"
        title={title}
        subtitle={`${withDifferences ? t("shipments.confirmedWithDifferences") : t(`shipments.statuses.${shipment.status}`)} · ${formatInstant(shipment.createdAt?.toDate?.() ?? null, i18n.language)}`}
        actions={<>
          {scanTo && <Button asChild><Link to={scanTo} data-testid="shipment-scan"><ScanLine className="h-4 w-4" />{t("shipments.scanPieces")}</Link></Button>}
          {canSend && <Button variant="secondary" onClick={() => { setDdtNumber(shipment.ddtNumber ?? ""); setSendOpen(true); }} data-testid="shipment-send"><Send className="h-4 w-4" />{t("shipments.send")}</Button>}
          {shipment.kind === "return" && isOwnSender && (shipment.status === "draft" || shipment.status === "sent") && (
            <label className="inline-flex items-center gap-1 rounded border border-border px-3 min-h-touch text-sm cursor-pointer" data-testid="shipment-attach-ddt-wrap">
              {t("documents.attach")}
              <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden" data-testid="shipment-attach-ddt" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) pickDdtFile(f); }} />
            </label>
          )}
          {canConfirm && <Button variant="secondary" onClick={openConfirm} data-testid="shipment-confirm"><PackageCheck className="h-4 w-4" />{t(late ? "shipments.confirmLate" : "shipments.confirm")}</Button>}
          {canCancel && <Button variant="danger" onClick={() => setCancelling(true)} disabled={busy} data-testid="shipment-cancel"><Trash2 className="h-4 w-4" />{t("shipments.cancel")}</Button>}
          <ConfirmDialog open={cancelling} danger busy={busy} title={t("shipments.cancel")} body={t("shipments.cancelConfirm")} confirmLabel={t("shipments.cancel")} onConfirm={() => void cancel()} onClose={() => setCancelling(false)} />
        </>}
      />
      <Card>
        <h2 className="font-semibold mb-3">{t("shipments.summary")}</h2>
        <dl className="grid grid-cols-2 gap-2 text-sm max-w-xl">
          <dt className="text-muted">{t("shipments.from")}</dt><dd data-testid="shipment-from">{fromName}</dd>
          <dt className="text-muted">{t("shipments.to")}</dt><dd data-testid="shipment-to">{toName}</dd>
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
                {/* P-59 (D-30): this piece was confirmed by the client in another return. */}
                {l.confirmedElsewhere && (typeof l.confirmedElsewhere === "string"
                  ? <Link to={`/shipments/${l.confirmedElsewhere}`} data-testid={`shipment-line-elsewhere-${l.id}`}><Badge tone="neutral">{t("shipments.confirmedElsewhere")}</Badge></Link>
                  : <span data-testid={`shipment-line-elsewhere-${l.id}`}><Badge tone="neutral">{t("shipments.confirmedElsewhere")}</Badge></span>)}
                <Link to={`/items/${l.id}`} className="text-primary hover:underline text-xs" data-testid={`shipment-line-link-${l.id}`}>{t("common.open")}</Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {/* P-186: the extra pieces the client found in this return (§9.3: confirmed, with the alert). */}
      {extraCodes.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-3">{t("shipments.extraPieces")}</h2>
          <ul className="divide-y divide-border text-sm" data-testid="shipment-extra-lines">
            {extraCodes.map((c) => (
              <li key={c} className="flex items-center gap-3 py-2">
                <span className="font-mono truncate flex-1">{c}</span>
                <Badge tone="warning">{t("shipments.extraLine")}</Badge>
                <button type="button" className="text-primary hover:underline text-xs" data-testid={`shipment-extra-open-${c}`}
                  onClick={() => void run(async () => { const it = await searchItemByCode(c); if (!it) throw new Error("item_not_found"); nav(`/items/${it.id}`); })}>{t("common.open")}</button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* P-200: the DDT number before the first DDT file of a return. */}
      <Dialog open={!!attachFile} onOpenChange={(o) => { if (!o) setAttachFile(null); }}>
        <DialogContent title={t("documents.attach")} description={t("shipments.attachNeedsNumber")}>
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); if (attachFile && attachNumber.trim()) void attachDdt(attachFile, attachNumber.trim()); }}>
            <Field label={t("shipments.ddtNumber")} htmlFor="a-n"><Input id="a-n" value={attachNumber} onChange={(e) => setAttachNumber(e.target.value)} autoFocus data-testid="shipment-attach-number" /></Field>
            <p className="text-xs text-muted truncate">{attachFile?.name}</p>
            <div className="flex justify-end"><Button type="submit" disabled={busy || !attachNumber.trim()} data-testid="shipment-attach-save">{t("documents.attach")}</Button></div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={sendOpen} onOpenChange={(o) => { if (!o) setSendOpen(false); }}>
        <DialogContent title={t("shipments.send")} description={shipment.kind === "return" ? t("shipments.sendReturnHint") : t("shipments.sendTransferHint")}>
          <div className="space-y-3">
            {shipment.kind === "return" && <Field label={t("shipments.ddtNumber")} htmlFor="d-n"><Input id="d-n" value={ddtNumber} onChange={(e) => setDdtNumber(e.target.value)} data-testid="shipment-ddt-input" /></Field>}
            <div className="flex justify-end"><Button onClick={send} disabled={busy || (shipment.kind === "return" && !ddtNumber.trim())} data-testid="shipment-send-save">{t("shipments.send")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={(o) => { if (!o) setConfirmOpen(false); }}>
        <DialogContent title={t(late ? "shipments.confirmLate" : "shipments.confirm")} description={t(late ? "shipments.confirmLateHint" : "shipments.confirmHint")} className="max-w-2xl">
          <div className="space-y-3 max-h-[60vh] overflow-y-auto">
            <h3 className="font-semibold text-sm">{t("shipments.linesToTick")}</h3>
            <ul className="divide-y divide-border text-sm" data-testid="confirm-lines-list">
              {confirmLines.map((l) => (
                <li key={l.id} className="flex items-center gap-2 py-2">
                  <input id={`cl-${l.id}`} type="checkbox" className="h-5 w-5 accent-[rgb(var(--primary))]" checked={!missing.has(l.id)} disabled={!!l.confirmedElsewhere} onChange={() => toggleMissing(l.id)} data-testid={`confirm-line-${l.id}`} />
                  <label htmlFor={`cl-${l.id}`} className="font-mono flex-1 truncate">{l.codeRaw}</label>
                  {l.confirmedElsewhere && <Badge tone="neutral">{t("shipments.confirmedElsewhere")}</Badge>}
                  <span className="text-muted">{l.model ?? "—"}</span>
                </li>
              ))}
            </ul>
            {!late && <>
              <h3 className="font-semibold text-sm mt-4">{t("shipments.extraPieces")}</h3>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); addExtra(); }}>
                <Input className="font-mono" value={extraInput} onChange={(e) => setExtraInput(e.target.value)} placeholder={t("shipments.extraPlaceholder")} data-testid="confirm-extra-input" />
                <Button type="submit" variant="secondary" data-testid="confirm-extra-add">{t("common.add")}</Button>
              </form>
              {extra.length > 0 && <ul className="space-y-1 text-sm font-mono" data-testid="confirm-extra-list">
                {extra.map((c) => <li key={c} className="flex items-center justify-between"><span>{c}</span><Button size="sm" variant="ghost" onClick={() => dropExtra(c)} data-testid={`confirm-extra-remove-${c}`}>×</Button></li>)}
              </ul>}
            </>}
          </div>
          {/* A late confirmation with nothing ticked would confirm nothing. */}
          <div className="flex justify-end mt-4"><Button onClick={confirmReturn} disabled={busy || (late && missing.size >= confirmLines.length)} data-testid="confirm-save">{t(late ? "shipments.confirmLate" : "shipments.confirm")}</Button></div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
