import * as React from "react";
import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Eye, Lock } from "lucide-react";
import { useSession } from "@/app/session";
import { useRowAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchAlerts, type Alert } from "@/lib/data/documents";
import { hasNoDifferenceNow, isAlertToWatch } from "@/lib/alertState";
import type { Row } from "@/lib/data/db";
import { PageHeader, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { Loading, Empty } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { ConfirmDialog } from "@/components/dialogs";
import { Input, Field } from "@/components/ui/form";
import { useNames } from "@/lib/names";

// P-100 (n.11, P-95): the codes listed in a document alert (missing, unexpected, unknown model), the first few of each.
function AlertCodes({ detail, testId }: { detail: Record<string, unknown>; testId: string }) {
  const { t } = useTranslation();
  const lists: Array<[string, string[]]> = [["missing", detail?.missingCodes as string[]], ["unexpected", detail?.unexpectedCodes as string[]], ["unknownModel", detail?.modelUnknownCodes as string[]]]
    .filter((x): x is [string, string[]] => Array.isArray(x[1]) && x[1].length > 0);
  if (!lists.length) return null;
  return (
    <ul className="space-y-0.5 text-xs" data-testid={testId}>
      {lists.map(([k, codes]) => (
        <li key={k}><span className="text-muted">{t(`documents.${k}`)}:</span> <span className="font-mono">{codes.slice(0, 3).join(", ")}</span>{codes.length > 3 && ` ${t("alerts.more", { n: codes.length - 3 })}`}</li>
      ))}
    </ul>
  );
}

// §11.4 Alerts inbox.
export default function Alerts() {
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const names = useNames();
  // P-127: only the row being marked or closed waits (a hook: before any early return).
  const { pending, runFor } = useRowAction();
  // P-100: the object of an alert by kind and place, never by id.
  const objectLabel = (a: Row<Alert>) => `${t(a.shipmentId ? "alerts.objects.shipment" : a.documentId ? "alerts.objects.document" : "alerts.objects.place")} · ${names.place(a.locationId)}`;
  const [all, setAll] = React.useState<Row<Alert>[] | null>(null);
  const [showClosed, setShowClosed] = React.useState(false);
  // P-151: the alert being closed and its note (before the early return: hooks, React's rule).
  const [closing, setClosing] = React.useState<string | null>(null);
  const [note, setNote] = React.useState("");
  React.useEffect(() => claims?.orgId ? watchAlerts({ role: claims.role!, orgId: claims.orgId }, setAll) : undefined, [claims]);
  if (!all) return <Loading />;
  const list = showClosed ? all : all.filter((a) => !a.closedAt);
  const canClose = ["client_admin", "asp_admin", "client_warehouse"].includes(claims?.role ?? "");
  // P-103: the alert of a shipment (return, transfer) opens the shipment, also when a DDT is attached to it.
  const link = (a: Row<Alert>) => a.shipmentId ? `/shipments/${a.shipmentId}` : a.documentId ? `/documents/${a.documentId}` : a.locationId ? `/items?locationId=${a.locationId}` : "#";
  const seen = (id: string) => runFor(`seen-${id}`, () => call("markAlertSeen", { alertId: id }));
  // P-116 (n.20): cancelling the note (X, Esc, «Annulla») does not close the alert. P-151: the app's window with the
  // optional note, never the browser's prompt.
  const close = (id: string) => { setNote(""); setClosing(id); };
  const doClose = async () => {
    const id = closing;
    setClosing(null);
    if (!id || !canClose) return;
    await runFor(`close-${id}`, () => call("closeAlert", { alertId: id, note: note.trim() }), t("alerts.closed"));
  };
  return (
    <div className="space-y-6">
      <ConfirmDialog open={!!closing} title={t("alerts.closeTitle")} body={t("alerts.closeBody")} confirmLabel={t("common.close")} onConfirm={() => void doClose()} onClose={() => setClosing(null)}>
        <Field label={t("alerts.closeNote")} htmlFor="alert-note"><Input id="alert-note" value={note} onChange={(e) => setNote(e.target.value)} data-testid="alerts-close-note" /></Field>
      </ConfirmDialog>
      <PageHeader title={t("nav.alerts")} subtitle={t("alerts.subtitle")}
        actions={<Button variant="ghost" onClick={() => setShowClosed(!showClosed)} data-testid="alerts-toggle-closed">{showClosed ? t("alerts.hideClosed") : t("alerts.showClosed")}</Button>} />
      {list.length === 0 ? <Empty title={t("alerts.empty")} /> : (
        <DataTable testId="alerts-table" rows={list} rowHref={(a) => (link(a) === "#" ? null : link(a))} columns={[
          { key: "kind", header: t("alerts.kind"), render: (a) => <Badge tone={isAlertToWatch(a) ? "warning" : "neutral"}>{t(`alerts.kinds.${a.kind}`, { defaultValue: a.kind })}</Badge> },
          { key: "n", header: t("alerts.count"), value: (a) => hasNoDifferenceNow(a) ? t("alerts.noDifferenceNow") : a.count, className: "tabular",
            render: (a) => hasNoDifferenceNow(a) ? <span className="text-muted" data-testid={`alerts-no-difference-${a.id}`}>{t("alerts.noDifferenceNow")}</span> : <>{a.count}</> },
          { key: "obj", header: t("alerts.object"), render: (a) => <Link to={link(a)} className="text-primary hover:underline font-mono text-xs" data-testid={`alerts-row-link-${a.id}`}>{objectLabel(a)}</Link> },
          { key: "codes", header: t("alerts.codes"), render: (a) => <AlertCodes detail={a.detail} testId={`alerts-codes-${a.id}`} /> },
          { key: "at", header: t("alerts.updated"), value: (a) => formatInstant(a.updatedAt?.toDate?.() ?? null, i18n.language) },
          { key: "seen", header: "", render: (a) => <Button size="sm" variant="ghost" onClick={() => seen(a.id)} disabled={pending.has(`seen-${a.id}`) || !!a.seenAt} aria-busy={pending.has(`seen-${a.id}`) || undefined} data-testid={`alerts-seen-${a.id}`}><Eye className="h-4 w-4" />{a.seenAt ? t("alerts.seen") : t("alerts.markSeen")}</Button> },
          { key: "close", header: "", render: (a) => canClose && !a.closedAt ? <Button size="sm" variant="ghost" onClick={() => close(a.id)} disabled={pending.has(`close-${a.id}`)} aria-busy={pending.has(`close-${a.id}`) || undefined} data-testid={`alerts-close-${a.id}`}><Lock className="h-4 w-4" />{t("common.close")}</Button> : null },
        ]} />
      )}
    </div>
  );
}
