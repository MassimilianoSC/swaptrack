import * as React from "react";
import { useParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, Pencil, Shuffle, MapPin, Wrench, Shield } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchItem, listCodesOf, listAnomaliesOf, searchItemByCode, type Item, type Code } from "@/lib/data/items";
import { listModels, type Model } from "@/lib/data/db";
import type { Row } from "@/lib/data/db";
import { isAdminRole, isClientRole } from "@shared/roles";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loading, Empty } from "@/components/states";
import { toast } from "sonner";
import { formatInstant } from "@/lib/utils";

type HistoryEvent = { id: string; type: string; scannedAt: number | null; source: string; locationId: string | null; aspId: string | null; organization: string; voided: boolean; corrected: boolean; payload: Record<string, unknown> };

// §13.2 / §6.5: item detail — history (no userId), reveal author, edit, forceState, merge, location correction.
export default function ItemDetail() {
  const { id } = useParams();
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const [item, setItem] = React.useState<Row<Item> | null>(null);
  const [codes, setCodes] = React.useState<Row<Code>[]>([]);
  const [history, setHistory] = React.useState<HistoryEvent[] | null>(null);
  const [anomalies, setAnomalies] = React.useState<Array<Record<string, unknown> & { id: string }>>([]);
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  const [editing, setEditing] = React.useState(false);
  const [editModel, setEditModel] = React.useState<string>("");
  const [editCondition, setEditCondition] = React.useState("");
  const [forceOpen, setForceOpen] = React.useState(false);
  const [forceStatus, setForceStatus] = React.useState("");
  const [forceAsp, setForceAsp] = React.useState("");
  const [forceReason, setForceReason] = React.useState("");
  const [mergeOpen, setMergeOpen] = React.useState(false);
  const [mergeOtherCode, setMergeOtherCode] = React.useState("");
  const [mergeReason, setMergeReason] = React.useState("");
  const [correctOpen, setCorrectOpen] = React.useState<HistoryEvent | null>(null);
  const [correctLoc, setCorrectLoc] = React.useState("");
  const [correctReason, setCorrectReason] = React.useState("");

  const role = claims?.role ?? "";
  const canEdit = role === "client_admin" || role === "asp_admin" || role === "asp_warehouse";
  const canForce = role === "client_admin" || role === "asp_admin";
  const canMerge = canForce;
  const canCorrect = canForce;
  const canReveal = role === "client_admin" || role === "asp_admin";

  const reload = React.useCallback(async () => {
    if (!id) return;
    const [c, h, a] = await Promise.all([
      listCodesOf(id),
      call<{ events: HistoryEvent[] }>("itemHistory", { itemId: id }).then((r) => r.events).catch(() => []),
      listAnomaliesOf(id).catch(() => []),
    ]);
    setCodes(c); setHistory(h); setAnomalies(a);
  }, [id]);

  React.useEffect(() => {
    if (!id) return;
    void listModels().then(setModels).catch(() => undefined);
    void reload();
    return watchItem(id, setItem);
  }, [id, reload]);
  React.useEffect(() => { if (item) { setEditModel(item.modelId ?? ""); setEditCondition(item.condition ?? ""); setForceStatus(item.status); } }, [item]);

  if (!id || !item || history === null) return <Loading />;

  const label = (t: string) => (t ? t : "—");

  const saveEdit = async () => {
    if (await run(() => call("editItem", { itemId: id, modelId: editModel || null, condition: editCondition || null }), t("common.saved"))) {
      setEditing(false); await reload();
    }
  };
  const doForce = async () => {
    if (!forceReason.trim()) { toast.error(t("errors.invalid_data")); return; }
    const payload: Record<string, unknown> = { itemId: id, reason: forceReason };
    if (forceStatus && forceStatus !== item.status) payload.status = forceStatus;
    if (forceAsp && role === "client_admin") payload.aspId = forceAsp;
    if (await run(() => call("forceState", payload), t("common.saved"))) {
      setForceOpen(false); setForceReason(""); setForceAsp(""); await reload();
    }
  };
  const doMerge = async () => {
    const other = await searchItemByCode(mergeOtherCode);
    if (!other) { toast.error(t("items.notFound")); return; }
    if (other.id === id) { toast.error(t("errors.invalid_data")); return; }
    if (await run(() => call("mergeItems", { fromItemId: other.id, intoItemId: id, reason: mergeReason }), t("common.saved"))) {
      setMergeOpen(false); setMergeOtherCode(""); setMergeReason(""); await reload();
    }
  };
  const doCorrect = async () => {
    if (!correctOpen || !correctLoc.trim() || !correctReason.trim()) { toast.error(t("errors.invalid_data")); return; }
    if (await run(() => call("correctEventLocation", { eventId: correctOpen.id, locationId: correctLoc.trim(), reason: correctReason }), t("common.saved"))) {
      setCorrectOpen(null); setCorrectLoc(""); setCorrectReason(""); await reload();
    }
  };
  const reveal = async (eventId: string) => {
    const r = await run(() => call<{ name: string | null }>("revealEventAuthor", { eventId }));
    if (r) toast(r.name ?? t("items.authorUnknown"));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("items.title", { id: id.slice(0, 8) })}
        subtitle={item.model ? `${item.model} · ${item.materialCode ?? ""}` : t("items.unknownModel")}
        actions={<>
          {canEdit && <Button variant="secondary" onClick={() => setEditing(true)} data-testid="item-edit"><Pencil className="h-4 w-4" />{t("common.edit")}</Button>}
          {canForce && <Button variant="secondary" onClick={() => setForceOpen(true)} data-testid="item-force-state"><Wrench className="h-4 w-4" />{t("items.forceState")}</Button>}
          {canMerge && <Button variant="secondary" onClick={() => setMergeOpen(true)} data-testid="item-merge"><Shuffle className="h-4 w-4" />{t("items.merge")}</Button>}
        </>}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <h2 className="font-semibold mb-3">{t("items.state")}</h2>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">{t("items.status")}</dt><dd data-testid="item-status"><Badge>{t(`items.statuses.${item.status}`, { defaultValue: item.status })}</Badge></dd>
            <dt className="text-muted">{t("items.flow")}</dt><dd>{t(`items.flows.${item.flow}`, { defaultValue: item.flow })}{item.previousFlow && ` (${t("items.previously")} ${t(`items.flows.${item.previousFlow}`, { defaultValue: item.previousFlow })})`}</dd>
            <dt className="text-muted">{t("items.location")}</dt><dd className="font-mono text-xs" data-testid="item-location">{item.currentLocationId ?? "—"}</dd>
            <dt className="text-muted">{t("items.aspOwner")}</dt><dd className="font-mono text-xs">{item.currentAspId ?? "—"}{item.pendingAspId && ` → ${item.pendingAspId}`}</dd>
            <dt className="text-muted">{t("items.sortingCategory")}</dt><dd>{label(item.sortingCategoryId ?? "")}</dd>
            <dt className="text-muted">{t("items.lastScanned")}</dt><dd>{formatInstant(item.lastScannedAt?.toDate?.() ?? null, i18n.language)}</dd>
            {item.mergedInto && (<><dt className="text-muted">{t("items.mergedInto")}</dt><dd className="font-mono text-xs"><Link to={`/items/${item.mergedInto}`} className="hover:underline">{item.mergedInto}</Link></dd></>)}
          </dl>
        </Card>
        <Card>
          <h2 className="font-semibold mb-3">{t("items.codes")}</h2>
          {codes.length === 0 ? <p className="text-sm text-muted">—</p> : (
            <ul className="space-y-1 text-sm font-mono" data-testid="item-codes">
              {codes.map((c) => <li key={c.id} className={c.active ? "" : "text-muted line-through"}>{c.raw} {!c.active && <span className="text-xs">(→ {c.replacedBy})</span>}</li>)}
            </ul>
          )}
        </Card>
      </div>

      {anomalies.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-3 flex items-center gap-2"><Shield className="h-4 w-4" />{t("items.anomalies")}</h2>
          <ul className="space-y-2 text-sm" data-testid="item-anomalies">
            {anomalies.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Badge tone={a.resolution ? "neutral" : "warning"}>{t(`anomalies.types.${a.type}`, { defaultValue: String(a.type) })}</Badge>
                {!a.resolution && a.type === "code_of_another_asp" && isClientRole(role) && (
                  <ResolveAnomalyButton anomalyId={a.id} onDone={reload} />
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card>
        <h2 className="font-semibold mb-3">{t("items.history")}</h2>
        {history.length === 0 ? <Empty title={t("items.historyEmpty")} /> : (
          <ol className="space-y-2 text-sm" data-testid="item-history">
            {history.map((h) => (
              <li key={h.id} className={`border-l-2 pl-3 ${h.voided ? "border-muted opacity-60" : "border-primary"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular text-muted">{formatInstant(h.scannedAt ? new Date(h.scannedAt) : null, i18n.language)}</span>
                  <Badge>{t(`scan.modes.${h.type}`, { defaultValue: h.type })}</Badge>
                  {h.voided && <Badge tone="neutral">{t("items.voided")}</Badge>}
                  {h.corrected && <Badge tone="warning">{t("items.corrected")}</Badge>}
                  {h.organization === "another" && <Badge tone="neutral">{t("items.anotherOrg")}</Badge>}
                  {h.source === "server" && <Badge tone="neutral">{t("items.serverEvent")}</Badge>}
                  <span className="ml-auto flex gap-1">
                    {canReveal && isAdminRole(role) && h.source !== "server" && <Button size="sm" variant="ghost" onClick={() => reveal(h.id)} aria-label={t("items.revealAuthor")} data-testid={`item-reveal-${h.id}`}><Eye className="h-4 w-4" /></Button>}
                    {canCorrect && h.locationId && <Button size="sm" variant="ghost" onClick={() => { setCorrectOpen(h); setCorrectLoc(h.locationId!); }} aria-label={t("items.correctLocation")} data-testid={`item-correct-${h.id}`}><MapPin className="h-4 w-4" /></Button>}
                  </span>
                </div>
                {h.locationId && <p className="text-xs text-muted font-mono">{h.locationId}</p>}
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Dialog open={editing} onOpenChange={(o) => { if (!o) setEditing(false); }}>
        <DialogContent title={t("items.editItem")}>
          <div className="space-y-3">
            <Field label={t("items.model")} htmlFor="e-m"><Select id="e-m" value={editModel} onChange={(e) => setEditModel(e.target.value)} data-testid="item-edit-model">
              <option value="">—</option>{models.map((m) => <option key={m.id} value={m.id}>{m.model} · {m.materialCode}</option>)}
            </Select></Field>
            <Field label={t("items.condition")} htmlFor="e-c"><Input id="e-c" value={editCondition} onChange={(e) => setEditCondition(e.target.value)} data-testid="item-edit-condition" /></Field>
            <div className="flex justify-end"><Button onClick={saveEdit} disabled={busy} data-testid="item-edit-save">{t("common.save")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={forceOpen} onOpenChange={(o) => { if (!o) setForceOpen(false); }}>
        <DialogContent title={t("items.forceState")} description={t("items.forceStateHint")}>
          <div className="space-y-3">
            <Field label={t("items.status")} htmlFor="f-s"><Select id="f-s" value={forceStatus} onChange={(e) => setForceStatus(e.target.value)} data-testid="item-force-status">
              {["removed_at_site","received_at_asp","sorted","installed","defective","leftover","in_transfer","in_return","returned"].map((s) => <option key={s} value={s}>{t(`items.statuses.${s}`)}</option>)}
            </Select></Field>
            {role === "client_admin" && <Field label={t("items.changeAsp")} htmlFor="f-a"><Input id="f-a" value={forceAsp} onChange={(e) => setForceAsp(e.target.value)} className="font-mono" placeholder={t("items.aspIdHint")} data-testid="item-force-asp" /></Field>}
            <Field label={t("common.reason")} htmlFor="f-r"><Textarea id="f-r" value={forceReason} onChange={(e) => setForceReason(e.target.value)} data-testid="item-force-reason" /></Field>
            <div className="flex justify-end"><Button variant="danger" onClick={doForce} disabled={busy} data-testid="item-force-save">{t("items.applyForce")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeOpen} onOpenChange={(o) => { if (!o) setMergeOpen(false); }}>
        <DialogContent title={t("items.merge")} description={t("items.mergeHint")}>
          <div className="space-y-3">
            <Field label={t("items.mergeOtherCode")} htmlFor="m-c"><Input id="m-c" value={mergeOtherCode} onChange={(e) => setMergeOtherCode(e.target.value)} className="font-mono" data-testid="item-merge-code" /></Field>
            <Field label={t("common.reason")} htmlFor="m-r"><Textarea id="m-r" value={mergeReason} onChange={(e) => setMergeReason(e.target.value)} data-testid="item-merge-reason" /></Field>
            <div className="flex justify-end"><Button variant="danger" onClick={doMerge} disabled={busy || !mergeOtherCode.trim() || !mergeReason.trim()} data-testid="item-merge-save">{t("items.mergeInto")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!correctOpen} onOpenChange={(o) => { if (!o) setCorrectOpen(null); }}>
        <DialogContent title={t("items.correctLocation")} description={t("items.correctLocationHint")}>
          <div className="space-y-3">
            <Field label={t("items.previousLocation")} htmlFor="c-p"><Input id="c-p" readOnly className="font-mono bg-surface-2" value={correctOpen?.locationId ?? ""} /></Field>
            <Field label={t("items.newLocationId")} htmlFor="c-n"><Input id="c-n" value={correctLoc} onChange={(e) => setCorrectLoc(e.target.value)} className="font-mono" data-testid="item-correct-loc" /></Field>
            <Field label={t("common.reason")} htmlFor="c-r"><Textarea id="c-r" value={correctReason} onChange={(e) => setCorrectReason(e.target.value)} data-testid="item-correct-reason" /></Field>
            <div className="flex justify-end"><Button onClick={doCorrect} disabled={busy} data-testid="item-correct-save">{t("common.save")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ResolveAnomalyButton({ anomalyId, onDone }: { anomalyId: string; onDone: () => Promise<void> }) {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const apply = async () => {
    if (await run(() => call("resolveAnomaly", { anomalyId, action: "accept_move", reason: reason || "accepted" }), t("common.saved"))) {
      setOpen(false); setReason(""); await onDone();
    }
  };
  return <>
    <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid={`anomaly-resolve-${anomalyId}`}>{t("anomalies.resolveAcceptMove")}</Button>
    <Dialog open={open} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <DialogContent title={t("anomalies.resolveAcceptMove")} description={t("anomalies.resolveHint")}>
        <div className="space-y-3">
          <Field label={t("common.reason")} htmlFor="a-r"><Textarea id="a-r" value={reason} onChange={(e) => setReason(e.target.value)} data-testid="anomaly-resolve-reason" /></Field>
          <div className="flex justify-end"><Button onClick={apply} disabled={busy} data-testid="anomaly-resolve-save">{t("common.confirm")}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
