import * as React from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Save, Check, Lock, Scale, Sparkles } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { loadDocument, type SwDocument } from "@/lib/data/documents";
import { watchDoc, listModels, type Row, type Location } from "@/lib/data/db";
import { normalizeBarcode } from "@/lib/codeId.js";
import { useLocationsFor } from "@/lib/data/useLocations";
import { extractLines } from "@/lib/documents/extract";
import { readTable, TableReadError, type Sheet } from "@/lib/import/readTable";
import { carryModels, fillCodesFromModels, newRow, rowFromLine, rowError, rowIsEmpty, linesFromRows, type DocLine, type LineRow, type Direction } from "@/lib/documents/lines";
import { LinesTable } from "@/components/documents/LinesTable";
import { quantityLabel, catalogIndex } from "@/lib/documents/quantityLabel";
import { isClientRole } from "@shared/roles";
import { FilesPanel, type PendingFile } from "@/components/documents/FilesPanel";
import { ExcelMapping } from "@/components/documents/ExcelMapping";
import { PageHeader, Card, Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Field } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/dialogs";
import { Loading, ErrorState } from "@/components/states";
import { BackButton } from "@/components/BackButton";
import { formatInstant } from "@/lib/utils";
import { toast } from "sonner";

type Kind = SwDocument["kind"];
type Compare = { arrived: string[]; missing: string[]; unexpected: string[]; arrivedModelUnknown: string[]; quantities: Array<{ key: string; expected: number; counted: number }>; totals: { arrived: number; missing: number; unexpected: number; arrivedModelUnknown: number } };
const KINDS: Kind[] = ["ddt_in", "ddt_return", "bom"];

const toBase64 = (b: Blob) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(new Error("read_failed")); r.readAsDataURL(b); });

// §11: new / edit document (lines typed, pasted or read from an Excel; files and their preview, P-105), mark checked,
// close, compare.
const splitRows = (rs: LineRow[]) => ({
  install: rs.filter((r) => r.direction === "install"),
  remove: rs.filter((r) => r.direction === "remove"),
  none: rs.filter((r) => !r.direction),
});

export default function DocumentDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const { t, i18n } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const isNew = id === "new";
  const [doc, setDoc] = React.useState<Row<SwDocument> | null>(null);
  // P-166: never an empty menu with a weak signal (the device's copy after a few seconds, asked again).
  const locations = useLocationsFor(claims?.orgId ? { role: claims.role!, orgId: claims.orgId } : null);
  // A new document can arrive with its kind and place (the arrival screen opens "new DDT" for its warehouse).
  const [kind, setKind] = React.useState<Kind>(() => (isNew && KINDS.includes(params.get("kind") as Kind) ? params.get("kind") as Kind : "ddt_in"));
  const [number, setNumber] = React.useState("");
  const [locationId, setLocationId] = React.useState(() => (isNew ? params.get("location") ?? "" : ""));
  // P-223: the lines as rows of a table (a new document starts with one row ready to be filled).
  const [rows, setRows] = React.useState<LineRow[]>(() => (isNew ? [newRow()] : []));
  // The errors under the rows are said once "Save" was pressed.
  const [showErrors, setShowErrors] = React.useState(false);
  // P-169: the material codes of the catalog (normalized): "#1 CODE" is a serial when CODE is not one of them.
  const [materialCodes, setMaterialCodes] = React.useState<Set<string> | undefined>(undefined);
  // P-192: the same catalog names the quantity lines of «Compare».
  const [catalog, setCatalog] = React.useState(() => catalogIndex([]));
  React.useEffect(() => {
    void listModels().then((ms) => {
      setMaterialCodes(new Set(ms.map((m) => normalizeBarcode(m.materialCode ?? "")).filter(Boolean)));
      setCatalog(catalogIndex(ms));
    }).catch(() => undefined);
  }, []);
  // P-224: a saved quantity line with only its model shows the model's article code, once catalog and lines are there.
  React.useEffect(() => {
    const fill = (rs: LineRow[]) => fillCodesFromModels(rs, (id) => catalog.byId.get(id)?.materialCode ?? undefined);
    setRows(fill);
    setBomRows((b) => ({ install: fill(b.install), remove: fill(b.remove), none: fill(b.none) }));
  }, [catalog, doc]);
  // §11.2 / P-92 / P-223: the lines of a BOM in two tables, to install and to remove; every line takes its table's
  // direction. Lines without direction (a BOM saved before P-92, or the automatic reading that could not tell) wait in a
  // third table until each is given one (the server refuses them).
  const [bomRows, setBomRows] = React.useState<{ install: LineRow[]; remove: LineRow[]; none: LineRow[] }>(() => ({ install: isNew ? [newRow("install")] : [], remove: isNew ? [newRow("remove")] : [], none: [] }));
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
  // D-58 B3: a document that cannot be read says why (no network, does not exist, refused), never "Loading" for ever.
  const [unavailable, setUnavailable] = React.useState<"offline" | "missing" | "error" | null>(null);

  React.useEffect(() => {
    if (isNew || !id) return;
    setUnavailable(null);
    void loadDocument(id).then((d) => {
      if (!d) { setUnavailable("missing"); return; }
      setDoc(d); setKind(d.kind); setNumber(d.number); setLocationId(d.locationId);
      const lines = d.lines as DocLine[];
      // A line keeps its direction (P-74): saving again never drops it.
      if (d.kind === "bom") setBomRows(splitRows(lines.map(rowFromLine))); else setRows(lines.map(rowFromLine));
      setShowErrors(false);
      setLinesSource(d.linesSource ?? "manual");
    }, (e: { code?: string }) => setUnavailable(!navigator.onLine || e?.code === "unavailable" ? "offline"
      // A document that does not exist (or of another ASP) is refused by the rules: "not found", never revealed.
      : e?.code === "permission-denied" ? "missing" : "error"));
  }, [id, isNew, reloadKey]);

  // P-103: only the buttons the server accepts (saveDocument, markDocumentChecked); the client office and the client
  // warehouse read and compare. The ASP warehouse never writes a BOM (§3.3, P-62).
  const writerRole = ["client_admin", "asp_admin", "asp_warehouse"].includes(claims?.role ?? "");
  const canWrite = writerRole && !(claims?.role === "asp_warehouse" && doc?.kind === "bom");
  const canCheck = writerRole;
  const canClose = ["client_admin", "asp_admin"].includes(claims?.role ?? "");
  // §3.3 (P-65): a BOM is uploaded only by client_admin and asp_admin; the server refuses it to the others.
  const canUploadBom = ["client_admin", "asp_admin"].includes(claims?.role ?? "");
  // doc is still null at the first render of a saved document (the page shows Loading then): never dereference it here.
  const editable = isNew ? writerRole : !!doc && canWrite && doc.status !== "closed";
  // §11.2: an ASP reads and saves its own column mappings; client_admin the client's default.
  const mappingScope = isClientRole(claims?.role ?? "") ? "client" : claims?.orgId ?? "";

  // P-171: the file is kept; when its lines cannot be read the message says why (it said "unsupported file type").
  const onExcel = (f: File) => { void readTable(f).then((s) => setSheet(s.headers.length ? s : null)).catch((e) => toast.error(t(e instanceof TableReadError && e.kind === "load" ? "documents.excelLoadFailed" : "documents.excelUnreadable"))); };
  // Lines read from an Excel or proposed by the automatic reading join the boxes (never replacing what is typed) and
  // wait for "Save".
  // P-223: they join the same tables, after the rows already there (the empty ones give them their place).
  const applyLines = (lines: DocLine[], to: { from: "excel" | "ai"; skipped: number; warnings: string[] }) => {
    const keep = (rs: LineRow[]) => rs.filter((r) => !rowIsEmpty(r));
    const added = lines.map(rowFromLine);
    if (kind === "bom") {
      const split = splitRows(added);
      setBomRows((b) => ({ install: [...keep(b.install), ...split.install], remove: [...keep(b.remove), ...split.remove], none: [...b.none, ...split.none] }));
    } else setRows((x) => [...keep(x), ...added]);
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
    if (kind === "bom" && bomRows.none.some((r) => !rowIsEmpty(r))) { toast.error(t("errors.bom_direction_required")); return; }
    // P-223: a row that breaks a rule stops the save and says why under it.
    const all = kind === "bom" ? [...bomRows.install, ...bomRows.remove] : rows;
    if (all.some((r) => rowError(r))) { setShowErrors(true); toast.error(t("documents.rowsInvalid")); return; }
    const typed = kind === "bom" ? [...linesFromRows(bomRows.install, "install"), ...linesFromRows(bomRows.remove, "remove")] : linesFromRows(rows);
    const lines = carryModels(typed, (doc?.lines ?? []) as DocLine[]);
    const r = await run(async () => {
      const files = await Promise.all(pending.map(async (p) => ({ base64: await toBase64(p.blob), contentType: p.contentType, name: p.name })));
      return call<{ documentId: string; duplicateOf: string | null }>("saveDocument", {
        documentId: isNew ? undefined : id, kind, number: number.trim(), locationId, linesSource, lines,
        files: files.length ? files : undefined,
        // D-47: without keepFiles the server keeps every saved file; with it, only those listed.
        keepFiles: !isNew && removed.length ? doc!.files.filter((f) => !removed.includes(f)) : undefined,
      });
    }, t("common.saved"));
    if (!r) return;
    pending.forEach((p) => URL.revokeObjectURL(p.url));
    setPending([]); setRemoved([]); setToConfirm(null); setShowErrors(false);
    if (r.duplicateOf) toast.message(t("documents.duplicateWarning"));
    if (r.documentId && isNew) nav(`/documents/${r.documentId}`, { replace: true }); // P-163: "Back" skips the empty form
    else setReloadKey((k) => k + 1);
  };
  const mark = async () => {
    if (await run(() => call("markDocumentChecked", { documentId: id }), t("documents.marked")) !== undefined) setReloadKey((k) => k + 1);
    void doCompare();
  };
  // P-151: the app's window, never the browser's confirm.
  const [closing, setClosing] = React.useState(false);
  const close = async () => {
    setClosing(false);
    if (await run(() => call("closeDocument", { documentId: id }), t("documents.closed")) !== undefined) setReloadKey((k) => k + 1);
  };
  const doCompare = async () => { const r = await run(() => call<Compare>("compareDocument", { documentId: id })); if (r) setCompare(r); };

  // P-163: "Back" also when the document cannot be shown.
  const back = <BackButton fallback="/documents" />;
  if (!isNew && !doc && unavailable === "offline") return <>{back}<ErrorState message={t("errors.offlineUnavailable")} onRetry={() => setReloadKey((k) => k + 1)} /></>;
  if (!isNew && !doc && unavailable === "missing") return <>{back}<ErrorState message={t("errors.document_not_found")} /></>;
  if (!isNew && !doc && unavailable === "error") return <>{back}<ErrorState message={t("errors.load_failed")} onRetry={() => setReloadKey((k) => k + 1)} /></>;
  if (!isNew && !doc) return <Loading />;
  const siteOrWarehouse = (l: Row<Location>) =>
    kind === "bom" ? l.type === "site" : l.type === "asp_warehouse";
  // P-172 (SPEC §11.2): a saved document stays in its ASP; its place is changed only for another place of that ASP (the
  // client roles saw every ASP's places and the server refused the save). A new document, or one saved before P-49
  // without an ASP, any place.
  const ownAsp = !isNew && doc?.aspId ? doc.aspId : null;
  const placeAllowed = (l: Row<Location>) => siteOrWarehouse(l) && (!ownAsp || l.aspId === ownAsp);
  // P-208: a BOM goes on a site, a DDT on a warehouse. Changing «Type» after choosing the place left a place that the
  // list no longer showed (and saving put the document on it): the place is cleared when it does not fit the new type.
  const changeKind = (k: Kind) => {
    setKind(k);
    const l = locations.find((x) => x.id === locationId);
    if (l && (k === "bom" ? l.type !== "site" : l.type !== "asp_warehouse")) setLocationId("");
  };
  const table = (testId: string, title: string, rs: LineRow[], onChange: (r: LineRow[]) => void, direction?: Direction) => (
    <LinesTable testId={testId} title={title} rows={rs} onChange={onChange} readOnly={!editable} showErrors={showErrors} direction={direction} materialCodes={materialCodes} />
  );
  // A BOM line without direction gets one, and goes to its table.
  const assign = (r: LineRow, d: Direction) => setBomRows((b) => ({ ...b, none: b.none.filter((x) => x.id !== r.id), [d]: [...b[d].filter((x) => !rowIsEmpty(x)), { ...r, direction: d }] }));
  return (
    <div className="space-y-6">
      <PageHeader back="/documents" title={isNew ? t("documents.new") : t("documents.title", { n: doc?.number })}
        subtitle={isNew ? t("documents.subtitle") : `${t(`documents.kinds.${doc!.kind}`)} · v${doc!.version} · ${t(`documents.statuses.${doc!.status}`)}`}
        actions={!isNew && <>
          {canWrite && doc!.status !== "closed" && <Button variant="secondary" onClick={save} disabled={busy} data-testid="document-save"><Save className="h-4 w-4" />{t("common.save")}</Button>}
          {canCheck && doc!.status === "open" && <Button variant="secondary" onClick={mark} disabled={busy} data-testid="document-mark"><Check className="h-4 w-4" />{t("documents.markChecked")}</Button>}
          <Button variant="ghost" onClick={doCompare} disabled={busy} data-testid="document-compare"><Scale className="h-4 w-4" />{t("documents.compare")}</Button>
          {canClose && doc!.status !== "closed" && <Button variant="danger" onClick={() => setClosing(true)} disabled={busy} data-testid="document-close"><Lock className="h-4 w-4" />{t("documents.close")}</Button>}
          <ConfirmDialog open={closing} danger busy={busy} title={t("documents.closeTitle")} body={t("documents.closeConfirm")} confirmLabel={t("documents.close")} onConfirm={() => void close()} onClose={() => setClosing(false)} />
        </>}
      />
      <Card>
        <div className="grid gap-3 md:grid-cols-3">
          <Field label={t("documents.kind")} htmlFor="d-k"><Select id="d-k" value={kind} onChange={(e) => changeKind(e.target.value as Kind)} disabled={!isNew} data-testid="document-kind">
            <option value="ddt_in">{t("documents.kinds.ddt_in")}</option><option value="ddt_return">{t("documents.kinds.ddt_return")}</option>{(canUploadBom || !isNew) && <option value="bom">{t("documents.kinds.bom")}</option>}
          </Select></Field>
          <Field label={t("documents.number")} htmlFor="d-n"><Input id="d-n" value={number} onChange={(e) => setNumber(e.target.value)} readOnly={!editable} className="font-mono" data-testid="document-number" /></Field>
          <Field label={t("items.location")} htmlFor="d-l"><Select id="d-l" value={locationId} onChange={(e) => setLocationId(e.target.value)} disabled={!editable} data-testid="document-location">
            <option value="">{t("common.choose")}</option>
            {locations.filter(placeAllowed).map((l) => <option key={l.id} value={l.id}>{l.code} · {l.name}</option>)}
          </Select>
          {ownAsp && editable && isClientRole(claims?.role ?? "") && <p className="mt-1 text-xs text-muted" data-testid="document-location-same-asp">{t("documents.locationSameAsp")}</p>}
          </Field>
        </div>
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="space-y-3">
          <FilesPanel existing={doc?.files ?? []} names={Object.fromEntries((doc?.fileNames ?? []).map((f) => [f.path, f.name]))} removed={removed} onRemoved={setRemoved} pending={pending} onPending={setPending} onExcel={onExcel} canAdd={editable} />
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
              {table("document-lines-install", t("documents.linesInstall"), bomRows.install, (r) => setBomRows((b) => ({ ...b, install: r })), "install")}
              {table("document-lines-remove", t("documents.linesRemove"), bomRows.remove, (r) => setBomRows((b) => ({ ...b, remove: r })), "remove")}
              {bomRows.none.length > 0 && <LinesTable testId="document-lines-none" title={t("documents.linesNoDirection")} rows={bomRows.none} onChange={(r) => setBomRows((b) => ({ ...b, none: r }))} readOnly={!editable} showErrors={showErrors} onAssign={assign} warning />}
            </>
          ) : table("document-lines", t("documents.lines"), rows, setRows)}
          {/* P-116 (censimento n.6): a new document is saved only by the roles the server accepts. */}
          {isNew && editable && <div className="flex justify-end"><Button onClick={save} disabled={busy || !number.trim() || !locationId} data-testid="document-save-new">{t("common.save")}</Button></div>}
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
          {/* P-100 (n.11): which codes, not only how many. */}
          <div className="mt-3 grid gap-3 md:grid-cols-2 text-sm">
            {([["arrived", compare.arrived], ["missing", compare.missing], ["unexpected", compare.unexpected], ["unknownModel", compare.arrivedModelUnknown]] as Array<[string, string[]]>)
              .filter(([, codes]) => codes.length > 0).map(([k, codes]) => (
                <div key={k} data-testid={`document-list-${k}`}>
                  <p className="text-muted">{t(`documents.${k}`)}</p>
                  <p className="font-mono text-xs break-words">{codes.join(", ")}</p>
                </div>
              ))}
          </div>
          {compare.quantities.length > 0 && <ul className="mt-3 text-sm" data-testid="document-quantities">{compare.quantities.map((q) => <li key={q.key} data-testid="document-quantity">{quantityLabel(q, t, catalog)}</li>)}</ul>}
        </Card>
      )}
      {!isNew && doc && (
        <Card>
          <p className="text-sm text-muted">{t("documents.updated")}: {formatInstant(doc.updatedAt?.toDate?.() ?? null, i18n.language)}</p>
          {doc.duplicateOf && <p className="text-sm text-warning">{t("documents.duplicateOf")}: <Link to={`/documents/${doc.duplicateOf}`} className="hover:underline" data-testid="document-duplicate-of">{t("documents.duplicateOpen", { number: doc.number })}</Link></p>}
        </Card>
      )}
    </div>
  );
}
