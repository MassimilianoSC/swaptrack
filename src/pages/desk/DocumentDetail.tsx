import * as React from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Save, Check, Lock, Scale, Sparkles } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { loadDocument, type SwDocument } from "@/lib/data/documents";
import { listLocationsFor, watchDoc, type Row, type Location } from "@/lib/data/db";
import { extractLines } from "@/lib/documents/extract";
import { readTable, type Sheet } from "@/lib/import/readTable";
import { parseLines, linesToText, splitByDirection, carryModels, type DocLine } from "@/lib/documents/lines";
import { isClientRole } from "@shared/roles";
import { FilesPanel, type PendingFile } from "@/components/documents/FilesPanel";
import { ExcelMapping } from "@/components/documents/ExcelMapping";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Field } from "@/components/ui/form";
import { Loading } from "@/components/states";
import { formatInstant } from "@/lib/utils";
import { toast } from "sonner";

type Kind = SwDocument["kind"];
type Compare = { arrived: string[]; missing: string[]; unexpected: string[]; arrivedModelUnknown: string[]; quantities: Array<{ key: string; expected: number; counted: number }>; totals: { arrived: number; missing: number; unexpected: number; arrivedModelUnknown: number } };
const KINDS: Kind[] = ["ddt_in", "ddt_return", "bom"];

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(new Error("read_failed")); r.readAsDataURL(b); });

// §11: new / edit document (lines typed, pasted or read from an Excel; files and their preview, P-105), mark checked,
// close, compare.
export default function DocumentDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const isNew = id === "new";
  const [doc, setDoc] = React.useState<Row<SwDocument> | null>(null);
  const [locations, setLocations] = React.useState<Row<Location>[]>([]);
  // A new document can arrive with its kind and place (the arrival screen opens "new DDT" for its warehouse).
  const [kind, setKind] = React.useState<Kind>(() => (isNew && KINDS.includes(params.get("kind") as Kind) ? params.get("kind") as Kind : "ddt_in"));
  const [number, setNumber] = React.useState("");
  const [locationId, setLocationId] = React.useState(() => (isNew ? params.get("location") ?? "" : ""));
  const [rawLines, setRawLines] = React.useState("");
  // §11.2 / P-92: the lines of a BOM in two boxes, to remove and to install; every line takes its box's direction.
  // A BOM saved before has lines without direction: they wait in a third box until moved (the server refuses them).
  const [bomLines, setBomLines] = React.useState<{ remove: string; install: string; none: string }>({ remove: "", install: "", none: "" });
  // P-105: files added and not saved yet, saved files taken out of the next version (D-47), the Excel being mapped,
  // and lines read from a file: they wait in the same boxes for the user's check and "Save", like typed lines.
  const [pending, setPending] = React.useState<PendingFile[]>([]);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [sheet, setSheet] = React.useState<Sheet | null>(null);
  const [linesSource, setLinesSource] = React.useState<"manual" | "excel">("manual");
  const [toConfirm, setToConfirm] = React.useState<{ from: "excel" | "ai"; count: number; skipped: number; warnings: string[] } | null>(null);
  // D-45: the automatic reading, when the client admin has turned it on (settings/features, readable by every role).
  const [aiOn, setAiOn] = React.useState(false);
  React.useEffect(() => watchDoc<{ aiDocumentExtraction?: boolean }>("settings/features", (v) => setAiOn(!!v?.aiDocumentExtraction)), []);
  const [compare, setCompare] = React.useState<Compare | null>(null);
  // Bumped after every write, so status and lines on screen follow the server (the button "mark checked" disappears).
  const [reloadKey, setReloadKey] = React.useState(0);

  React.useEffect(() => { if (claims?.orgId) void listLocationsFor({ role: claims.role!, orgId: claims.orgId }).then(setLocations).catch(() => undefined); }, [claims]);
  React.useEffect(() => {
    if (isNew || !id) return;
    void loadDocument(id).then((d) => {
      if (!d) return;
      setDoc(d); setKind(d.kind); setNumber(d.number); setLocationId(d.locationId);
      const lines = d.lines as DocLine[];
      // A line keeps its direction (P-74): saving again never drops it.
      if (d.kind === "bom") setBomLines(splitByDirection(lines)); else setRawLines(linesToText(lines));
      setLinesSource(d.linesSource ?? "manual");
    });
  }, [id, isNew, reloadKey]);

  // P-103: only the buttons the server accepts (saveDocument, markDocumentChecked); the client office and the client
  // warehouse read and compare. The ASP warehouse never writes a BOM (§3.3, P-62).
  const writerRole = ["client_admin", "asp_admin", "asp_warehouse"].includes(claims?.role ?? "");
  const canWrite = writerRole && !(claims?.role === "asp_warehouse" && doc?.kind === "bom");
  const canCheck = writerRole;
  const canClose = ["client_admin", "asp_admin"].includes(claims?.role ?? "");
  // §3.3 (P-65): a BOM is uploaded only by client_admin and asp_admin; the server refuses it to the others.
  const canUploadBom = ["client_admin", "asp_admin"].includes(claims?.role ?? "");
  const editable = isNew ? writerRole : canWrite && doc!.status !== "closed";
  // §11.2: an ASP reads and saves its own column mappings; client_admin the client's default.
  const mappingScope = isClientRole(claims?.role ?? "") ? "client" : claims?.orgId ?? "";

  const onExcel = (f: File) => { void readTable(f).then((s) => setSheet(s.headers.length ? s : null)).catch(() => toast.error(t("errors.unsupported_file_type"))); };
  // Lines read from an Excel or proposed by the automatic reading join the boxes (never replacing what is typed) and
  // wait for "Save".
  const applyLines = (lines: DocLine[], to: { from: "excel" | "ai"; skipped: number; warnings: string[] }) => {
    const join = (a: string, b: string) => [a.trim(), b].filter(Boolean).join("\n");
    if (kind === "bom") {
      const split = splitByDirection(lines);
      setBomLines((b) => ({ remove: join(b.remove, split.remove), install: join(b.install, split.install), none: join(b.none, split.none) }));
    } else setRawLines((x) => join(x, linesToText(lines)));
    if (to.from === "excel") setLinesSource("excel");
    setToConfirm({ ...to, count: lines.length });
  };
  const applyExcel = (r: { lines: DocLine[]; skipped: number }) => { applyLines(r.lines, { from: "excel", skipped: r.skipped, warnings: [] }); setSheet(null); };
  const readAutomatically = async () => {
    const r = await run(() => extractLines(id!));
    if (r) applyLines(r.lines, { from: "ai", skipped: 0, warnings: r.warnings });
  };
  // The reading works on the saved photos and PDFs of the document.
  const readable = (doc?.files ?? []).some((f) => /\.(pdf|jpe?g|png|webp)$/i.test(f));

  const save = async () => {
    if (!number.trim() || !locationId) { toast.error(t("errors.invalid_data")); return; }
    if (kind === "bom" && bomLines.none.trim()) { toast.error(t("errors.bom_direction_required")); return; }
    const typed = kind === "bom" ? [...parseLines(bomLines.remove, "remove"), ...parseLines(bomLines.install, "install")] : parseLines(rawLines);
    const lines = carryModels(typed, (doc?.lines ?? []) as DocLine[]);
    const r = await run(async () => {
      const files = await Promise.all(pending.map(async (p) => ({ base64: await toBase64(p.blob), contentType: p.contentType })));
      return call<{ documentId: string; duplicateOf: string | null }>("saveDocument", {
        documentId: isNew ? undefined : id, kind, number: number.trim(), locationId, linesSource, lines,
        files: files.length ? files : undefined,
        // D-47: without keepFiles the server keeps every saved file; with it, only those listed.
        keepFiles: !isNew && removed.length ? doc!.files.filter((f) => !removed.includes(f)) : undefined,
      });
    }, t("common.saved"));
    if (!r) return;
    pending.forEach((p) => URL.revokeObjectURL(p.url));
    setPending([]); setRemoved([]); setToConfirm(null);
    if (r.duplicateOf) toast.message(t("documents.duplicateWarning"));
    if (r.documentId && isNew) nav(`/documents/${r.documentId}`);
    else setReloadKey((k) => k + 1);
  };
  const mark = async () => {
    if (await run(() => call("markDocumentChecked", { documentId: id }), t("documents.marked")) !== undefined) setReloadKey((k) => k + 1);
    void doCompare();
  };
  const close = async () => {
    if (!confirm(t("documents.closeConfirm"))) return;
    if (await run(() => call("closeDocument", { documentId: id }), t("documents.closed")) !== undefined) setReloadKey((k) => k + 1);
  };
  const doCompare = async () => { const r = await run(() => call<Compare>("compareDocument", { documentId: id })); if (r) setCompare(r); };

  if (!isNew && !doc) return <Loading />;
  const siteOrWarehouse = (l: Row<Location>) =>
    kind === "bom" ? l.type === "site" : l.type === "asp_warehouse";
  const box = (label: string, value: string, onChange: (v: string) => void, testId: string, extra = "") => (
    <Field label={label} htmlFor={testId}><Textarea id={testId} rows={10} value={value} onChange={(e) => onChange(e.target.value)} readOnly={!editable} className={`font-mono text-xs ${extra}`} placeholder={t("documents.linesPlaceholder")} data-testid={testId} /></Field>
  );
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
          <Field label={t("documents.kind")} htmlFor="d-k"><Select id="d-k" value={kind} onChange={(e) => setKind(e.target.value as Kind)} disabled={!isNew} data-testid="document-kind">
            <option value="ddt_in">{t("documents.kinds.ddt_in")}</option><option value="ddt_return">{t("documents.kinds.ddt_return")}</option>{(canUploadBom || !isNew) && <option value="bom">{t("documents.kinds.bom")}</option>}
          </Select></Field>
          <Field label={t("documents.number")} htmlFor="d-n"><Input id="d-n" value={number} onChange={(e) => setNumber(e.target.value)} className="font-mono" data-testid="document-number" /></Field>
          <Field label={t("items.location")} htmlFor="d-l"><Select id="d-l" value={locationId} onChange={(e) => setLocationId(e.target.value)} data-testid="document-location">
            <option value="">{t("common.choose")}</option>
            {locations.filter(siteOrWarehouse).map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
          </Select></Field>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <FilesPanel existing={doc?.files ?? []} removed={removed} onRemoved={setRemoved} pending={pending} onPending={setPending} onExcel={onExcel} canAdd={editable} />
          {sheet && editable && <ExcelMapping sheet={sheet} kind={kind} scope={mappingScope} onApply={applyExcel} onCancel={() => setSheet(null)} />}
          {aiOn && editable && !isNew && readable && (
            <div className="space-y-1">
              <Button type="button" variant="secondary" onClick={() => void readAutomatically()} disabled={busy || pending.length > 0} data-testid="document-ai-read"><Sparkles className="h-4 w-4" />{t("documents.aiRead")}</Button>
              {pending.length > 0 && <p className="text-xs text-muted">{t("documents.aiSaveFirst")}</p>}
            </div>
          )}
        </Card>
        <Card className="space-y-3">
          {toConfirm && (
            <div className="rounded border border-warning p-2 text-sm text-warning" data-testid="document-lines-to-confirm">
              <p>{toConfirm.from === "ai" ? t("documents.aiToConfirm", { count: toConfirm.count }) : t("documents.linesToConfirm", { count: toConfirm.count, skipped: toConfirm.skipped })}</p>
              {toConfirm.warnings.length > 0 && (
                <ul className="list-disc pl-5" data-testid="document-ai-warnings">
                  {toConfirm.warnings.map((w) => <li key={w}>{t(`documents.aiWarn.${w}`, { defaultValue: t("documents.aiWarnings") })}</li>)}
                </ul>
              )}
            </div>
          )}
          {kind === "bom" ? (
            <>
              {box(t("documents.linesRemove"), bomLines.remove, (v) => setBomLines((b) => ({ ...b, remove: v })), "document-lines-remove")}
              {box(t("documents.linesInstall"), bomLines.install, (v) => setBomLines((b) => ({ ...b, install: v })), "document-lines-install")}
              {bomLines.none && box(t("documents.linesNoDirection"), bomLines.none, (v) => setBomLines((b) => ({ ...b, none: v })), "document-lines-none", "border-warning")}
            </>
          ) : box(t("documents.lines"), rawLines, setRawLines, "document-lines")}
          {isNew && <div className="flex justify-end"><Button onClick={save} disabled={busy || !number.trim() || !locationId} data-testid="document-save-new">{t("common.save")}</Button></div>}
        </Card>
      </div>
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
