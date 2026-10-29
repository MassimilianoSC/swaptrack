import * as React from "react";
import { useParams, useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Save, Check, Lock, Scale } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { loadDocument, type SwDocument } from "@/lib/data/documents";
import { listLocationsFor, type Row, type Location } from "@/lib/data/db";
import { isClientRole } from "@shared/roles";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/form";
import { Loading } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { toast } from "sonner";

type Line = { kind: "serial"; codeRaw: string; materialCode?: string | null; modelId?: string | null; direction?: "remove" | "install" } |
           { kind: "quantity"; materialCode?: string | null; modelId?: string | null; quantity: number; direction?: "remove" | "install" };
type Compare = { arrived: string[]; missing: string[]; unexpected: string[]; arrivedModelUnknown: string[]; quantities: Array<{ key: string; expected: number; counted: number }>; totals: { arrived: number; missing: number; unexpected: number; arrivedModelUnknown: number } };

// §11: new / edit document, mark checked, close, compare.
export default function DocumentDetail() {
  const { id } = useParams();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const isNew = id === "new";
  const [doc, setDoc] = React.useState<Row<SwDocument> | null>(null);
  const [locations, setLocations] = React.useState<Row<Location>[]>([]);
  const [kind, setKind] = React.useState<"ddt_in" | "ddt_return" | "bom">("ddt_in");
  const [number, setNumber] = React.useState("");
  const [locationId, setLocationId] = React.useState("");
  const [rawLines, setRawLines] = React.useState("");
  const [compare, setCompare] = React.useState<Compare | null>(null);

  React.useEffect(() => { if (claims?.orgId) void listLocationsFor({ role: claims.role!, orgId: claims.orgId }).then(setLocations).catch(() => undefined); }, [claims]);
  React.useEffect(() => {
    if (isNew || !id) return;
    void loadDocument(id).then((d) => {
      if (!d) return;
      setDoc(d); setKind(d.kind); setNumber(d.number); setLocationId(d.locationId);
      setRawLines((d.lines as Line[]).map((l) => l.kind === "serial" ? l.codeRaw : `#${l.quantity}${l.materialCode ? ` ${l.materialCode}` : ""}${l.direction ? ` [${l.direction}]` : ""}`).join("\n"));
    });
  }, [id, isNew]);

  const parseLines = (text: string): Line[] => text.split("\n").map((s) => s.trim()).filter(Boolean).map((s) => {
    const m = s.match(/^#(\d+)(?:\s+(\S+))?(?:\s+\[(remove|install)\])?/);
    if (m) return { kind: "quantity", quantity: Number(m[1]), materialCode: m[2] ?? null, direction: m[3] as "remove" | "install" | undefined };
    const direction = kind === "bom" ? (s.match(/\[(remove|install)\]$/)?.[1] as "remove" | "install" | undefined) : undefined;
    return { kind: "serial", codeRaw: s.replace(/\s*\[(remove|install)\]\s*$/, ""), direction };
  });

  const canWrite = isClientRole(claims?.role ?? "") || ["asp_admin", "asp_warehouse"].includes(claims?.role ?? "");
  const canCheck = canWrite;
  const canClose = ["client_admin", "asp_admin"].includes(claims?.role ?? "");

  const save = async () => {
    if (!number.trim() || !locationId) { toast.error(t("errors.invalid_data")); return; }
    const lines = parseLines(rawLines);
    const r = await run(() => call<{ documentId: string; duplicateOf: string | null }>("saveDocument", {
      documentId: isNew ? undefined : id, kind, number: number.trim(), locationId, linesSource: "manual", lines,
    }), t("common.saved"));
    if (r?.duplicateOf) toast.message(t("documents.duplicateWarning"));
    if (r?.documentId && isNew) nav(`/documents/${r.documentId}`);
  };
  const mark = async () => { await run(() => call("markDocumentChecked", { documentId: id }), t("documents.marked")); void doCompare(); };
  const close = async () => { if (!confirm(t("documents.closeConfirm"))) return; await run(() => call("closeDocument", { documentId: id }), t("documents.closed")); };
  const doCompare = async () => { const r = await run(() => call<Compare>("compareDocument", { documentId: id })); if (r) setCompare(r); };

  if (!isNew && !doc) return <Loading />;
  const siteOrWarehouse = (l: Row<Location>) =>
    kind === "bom" ? l.type === "site" : l.type === "asp_warehouse";
  return (
    <div className="space-y-6">
      <PageHeader title={isNew ? t("documents.new") : t("documents.title", { n: doc?.number })}
        subtitle={isNew ? t("documents.subtitle") : `${t(`documents.kinds.${doc!.kind}`)} · v${doc!.version} · ${t(`documents.statuses.${doc!.status}`)}`}
        actions={!isNew && <>
          {canWrite && doc!.status !== "closed" && <Button variant="secondary" onClick={save} disabled={busy} data-testid="document-save"><Save className="h-4 w-4" />{t("common.save")}</Button>}
          {canCheck && doc!.status === "open" && <Button variant="secondary" onClick={mark} disabled={busy} data-testid="document-mark"><Check className="h-4 w-4" />{t("documents.markChecked")}</Button>}
          <Button variant="ghost" onClick={doCompare} disabled={busy} data-testid="document-compare"><Scale className="h-4 w-4" />{t("documents.compare")}</Button>
          {canClose && doc!.status !== "closed" && <Button variant="danger" onClick={close} disabled={busy} data-testid="document-close"><Lock className="h-4 w-4" />{t("documents.close")}</Button>}
        </>}
      />
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t("documents.kind")} htmlFor="d-k"><Select id="d-k" value={kind} onChange={(e) => setKind(e.target.value as never)} disabled={!isNew} data-testid="document-kind">
            <option value="ddt_in">{t("documents.kinds.ddt_in")}</option><option value="ddt_return">{t("documents.kinds.ddt_return")}</option><option value="bom">{t("documents.kinds.bom")}</option>
          </Select></Field>
          <Field label={t("documents.number")} htmlFor="d-n"><Input id="d-n" value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono" data-testid="document-number" /></Field>
          <Field label={t("items.location")} htmlFor="d-l"><Select id="d-l" value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="document-location">
            <option value="">{t("common.choose")}</option>
            {locations.filter(siteOrWarehouse).map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
          </Select></Field>
        </div>
        <Field label={t("documents.lines")} htmlFor="d-lines"><Textarea id="d-lines" rows={10} value={rawLines} onChange={(e) => setRawLines(e.target.value)} className="font-mono text-xs" placeholder={t("documents.linesPlaceholder")} data-testid="document-lines" /></Field>
        {isNew && <div className="flex justify-end"><Button onClick={save} disabled={busy || !number.trim() || !locationId} data-testid="document-save-new">{t("common.save")}</Button></div>}
      </Card>
      {compare && (
        <Card>
          <h2 className="font-semibold mb-3">{t("documents.compareResult")}</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
            <div><Badge tone="success">{t("documents.arrived")}</Badge><p className="text-2xl font-bold tabular" data-testid="document-arrived">{compare.totals.arrived}</p></div>
            <div><Badge tone="warning">{t("documents.missing")}</Badge><p className="text-2xl font-bold tabular" data-testid="document-missing">{compare.totals.missing}</p></div>
            <div><Badge tone="warning">{t("documents.unexpected")}</Badge><p className="text-2xl font-bold tabular" data-testid="document-unexpected">{compare.totals.unexpected}</p></div>
            <div><Badge tone="warning">{t("documents.unknownModel")}</Badge><p className="text-2xl font-bold tabular" data-testid="document-unknown-model">{compare.totals.arrivedModelUnknown}</p></div>
          </div>
          {compare.quantities.length > 0 && <ul className="mt-3 text-sm" data-testid="document-quantities">{compare.quantities.map((q) => <li key={q.key}>{q.key}: {q.counted}/{q.expected}</li>)}</ul>}
        </Card>
      )}
      {!isNew && doc && (
        <Card>
          <p className="text-sm text-muted">{t("documents.updated")}: {formatInstant(doc.updatedAt?.toDate?.() ?? null, i18n.language)}</p>
          {doc.duplicateOf && <p className="text-sm text-warning">{t("documents.duplicateOf")}: <Link to={`/documents/${doc.duplicateOf}`} className="font-mono hover:underline">{doc.duplicateOf.slice(0, 8)}</Link></p>}
        </Card>
      )}
    </div>
  );
}
