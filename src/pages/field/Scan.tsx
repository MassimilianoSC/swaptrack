import * as React from "react";
import { useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Flashlight, Sun, Undo2, Volume2, VolumeX, Camera, Check, AlertTriangle } from "lucide-react";
import { useSession } from "@/app/session";
import { startScanner } from "@/lib/scanner/engine.js";
import { writeEvent, watchMyScansToday, isProductCode, cachedItemForCode, primeFieldCache, loadSorting, cachedBomForSite, type Category, type Source } from "@/lib/data/events";
import { listModels, type Row, type Model } from "@/lib/data/db";
import { enqueuePhoto, flushQueue, listLost, dropLost } from "@/lib/offline/photoQueue";
import { computeCodeId } from "@/lib/codeId.js";
import { suggestCategory, type SortingRule } from "@shared/sorting";
import { formatInstant, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select, Checkbox, Field } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Empty } from "@/components/states";
import { toast } from "sonner";

const MODES: Record<string, string[]> = {
  asp_technician: ["remove_at_site", "install_at_site"],
  asp_warehouse: ["arrive_at_warehouse", "classify", "return_ship", "transfer_out"],
  asp_admin: ["arrive_at_warehouse", "classify", "return_ship", "transfer_out"],
};

function beep(muted: boolean) {
  if (muted) return;
  try { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 1200; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.12); } catch { /* no audio */ }
}

// §7.2 scanning screen: camera through engine.js only (R16), keyboard wedge, manual entry, burst, undo last,
// optional photo (offline queue, §7.3), model pick for unknown pieces (§6.4), shipment-draft burst mode (§9.3 / §9.4).
export default function Scan() {
  const { t, i18n } = useTranslation();
  const { claims, user, location, appSettings } = useSession();
  const [params, setParams] = useSearchParams();
  const role = claims?.role ?? "";
  const paramMode = params.get("mode");
  const shipmentId = params.get("shipmentId");
  const mode = paramMode ?? MODES[role]?.[0] ?? "";
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const ctrl = React.useRef<ReturnType<typeof startScanner> | null>(null);
  const [engine, setEngine] = React.useState<string | null>(null);
  const [camError, setCamError] = React.useState<string | null>(null);
  const [torch, setTorch] = React.useState<boolean | null>(null);
  const [exposure, setExposure] = React.useState<{ min: number; max: number; step: number } | null>(null);
  const [flash, setFlash] = React.useState<{ text: string; tone: "ok" | "warn" } | null>(null);
  const [muted, setMuted] = React.useState(() => localStorage.getItem("swaptrack.muted") === "1");
  const [askProduct, setAskProduct] = React.useState(false);
  const [pendingSerial, setPendingSerial] = React.useState<{ code: string; source: Source } | null>(null);
  const [wedge, setWedge] = React.useState("");
  const [manual, setManual] = React.useState("");
  const [flow, setFlow] = React.useState("removed");
  const [newClass, setNewClass] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [suggested, setSuggested] = React.useState<string | null>(null);
  const [sorting, setSorting] = React.useState<{ categories: Category[]; rules: SortingRule[] }>({ categories: [], rules: [] });
  const [materialCodes, setMaterialCodes] = React.useState<string[]>([]);
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  const [session, setSession] = React.useState<{ id: string; code: string }[]>([]);
  const [today, setToday] = React.useState<{ id: string; type: string; codeRaw?: string; at: Date; pending: boolean; voided?: boolean }[]>([]);
  const [modelPick, setModelPick] = React.useState<{ code: string; source: Source; second?: string } | null>(null);
  const [modelPickId, setModelPickId] = React.useState("");
  const [lastEventId, setLastEventId] = React.useState<string | null>(null);
  const [lostCount, setLostCount] = React.useState(0);
  const [lastPieceBadge, setLastPieceBadge] = React.useState<"previously_new" | null>(null);
  const photoInput = React.useRef<HTMLInputElement>(null);
  const [photoNum, setPhotoNum] = React.useState<Record<string, number>>({});
  const photoMandatoryDefective = (appSettings as unknown as { photos?: { mandatoryForDefective?: boolean } })?.photos?.mandatoryForDefective ?? false;

  // §12.1 point 4: BOM tick list for the technician scan screen. Direction derived from mode.
  const bomDirection: "remove" | "install" | null = mode === "remove_at_site" ? "remove" : mode === "install_at_site" ? "install" : null;
  const [bom, setBom] = React.useState<{ id: string; expected: Array<{ codeRaw: string; codeId: string }>; createdAtMs: number } | null>(null);
  const [bomTicks, setBomTicks] = React.useState<Set<string>>(new Set());
  const [bomUnexpected, setBomUnexpected] = React.useState<string[]>([]);

  React.useEffect(() => {
    void listModels().then((m) => { setMaterialCodes(m.map((x) => x.materialCode)); setModels(m); }).catch(() => undefined);
    void loadSorting().then((s) => setSorting(s as never)).catch(() => undefined);
    if (claims?.orgId) void primeFieldCache(claims.orgId);
    void listLost().then((l) => setLostCount(l.length));
    return user ? watchMyScansToday(user.uid, setToday) : undefined;
  }, [user, claims]);

  // §12.1: load the BOM of the current site (if any) from the ASP cache; direction filters the lines shown.
  React.useEffect(() => {
    if (!location || !bomDirection || location.type !== "site") { setBom(null); return; }
    void cachedBomForSite(location.id).then(async (b) => {
      if (!b) { setBom(null); return; }
      const expected: Array<{ codeRaw: string; codeId: string }> = [];
      for (const raw of b.lines) {
        const l = raw as { kind?: string; codeRaw?: string; codeId?: string; direction?: string };
        if (l.kind !== "serial" || l.direction !== bomDirection || !l.codeRaw) continue;
        const cid = l.codeId || (await computeCodeId(l.codeRaw));
        expected.push({ codeRaw: l.codeRaw, codeId: cid });
      }
      setBom({ id: b.id, expected, createdAtMs: b.createdAtMs });
    });
  }, [location, bomDirection]);

  // §12.1: ticks are computed on the device from the user's own events (local, including pending writes).
  // Joined with the BOM's expected codeIds; anything not expected goes to the unexpected list.
  React.useEffect(() => {
    if (!bom || !bomDirection || !location) { setBomTicks(new Set()); setBomUnexpected([]); return; }
    const relevant = today.filter((s) => !s.voided && s.type === mode && s.codeRaw);
    const expectedSet = new Set(bom.expected.map((e) => e.codeId));
    let aborted = false;
    (async () => {
      const ticks = new Set<string>();
      const unexpected: string[] = [];
      const seen = new Set<string>();
      for (const s of relevant) {
        const cid = await computeCodeId(s.codeRaw!);
        if (seen.has(cid)) continue; seen.add(cid);
        if (expectedSet.has(cid)) ticks.add(cid); else unexpected.push(s.codeRaw!);
      }
      if (aborted) return;
      setBomTicks(ticks); setBomUnexpected(unexpected);
    })();
    return () => { aborted = true; };
  }, [bom, bomDirection, mode, today, location]);

  const show = (text: string, tone: "ok" | "warn") => {
    setFlash({ text, tone });
    beep(muted);
    if (tone === "ok") navigator.vibrate?.(80); // no vibration API on iOS Safari: sound + flash
    setTimeout(() => { setFlash(null); ctrl.current?.resume(); }, 900);
  };

  const buildPayload = (): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    if (mode === "arrive_at_warehouse") { payload.flow = flow; if (category) payload.categoryId = category; if (shipmentId) payload.shipmentId = shipmentId; }
    if (mode === "classify") {
      if (newClass) payload.newClass = newClass; else payload.categoryId = category || suggested;
      if (suggested) payload.suggestedCategoryId = suggested;
    }
    if ((mode === "return_ship" || mode === "transfer_out") && shipmentId) payload.shipmentId = shipmentId;
    return payload;
  };
  const needsCategory = () => mode === "classify" && !newClass && !category && !suggested;

  const record = async (code: string, source: Source, second?: string, modelId?: string) => {
    if (!location || !user || !claims?.orgId) return;
    if (needsCategory()) { show(t("scan.chooseCategory"), "warn"); return; }
    const payload = buildPayload();
    if (modelId) payload.modelId = modelId;
    if (mode === "return_ship" || mode === "transfer_out") {
      if (!shipmentId) { toast.error(t("errors.shipment_not_found")); return; }
    }
    const id = await writeEvent({ type: mode, locationId: location.id, aspId: claims.orgId, userId: user.uid, orgId: claims.orgId, source, engine: source === "camera" ? engine : null, codeRaw: code, secondCodeRaw: second, payload });
    setSession((s) => [{ id, code }, ...s]);
    setLastEventId(id);
    show(code, "ok");
  };

  const onCode = async (raw: string, source: Source) => {
    const code = raw.trim();
    if (!code) return;
    if (pendingSerial) { const p = pendingSerial; setPendingSerial(null); return record(p.code, p.source, code); }
    if (isProductCode(code, materialCodes)) { show(t("scan.productCode"), "warn"); return; } // §6.3: no event
    if (mode === "classify") {
      const it = await cachedItemForCode(code);
      const s = it ? suggestCategory(sorting.rules, { siteId: it.siteOfOrigin as string, modelId: it.modelId as string, equipmentType: it.equipmentType as string }) : null;
      setSuggested(s);
      setLastPieceBadge(it?.previousFlow === "new" ? "previously_new" : null);
    }
    if (askProduct) { setPendingSerial({ code, source }); show(t("scan.nowProductCode"), "warn"); return; }
    // §6.4 model pick for unknown pieces: if unknown + warehouse/technician, ask for model (skip is allowed).
    if ((mode === "remove_at_site" || mode === "arrive_at_warehouse") && !await cachedItemForCode(code)) {
      setModelPick({ code, source }); setModelPickId(""); return;
    }
    await record(code, source);
  };
  const onCodeRef = React.useRef(onCode);
  onCodeRef.current = onCode;

  React.useEffect(() => {
    if (!videoRef.current || !location) return;
    const c = startScanner({
      videoEl: videoRef.current,
      onDecode: (text: string) => void onCodeRef.current(text, "camera"),
      onError: (code: string) => setCamError(code),
      onTorch: (a: boolean) => setTorch(a ? false : null),
      onEngine: (n: string) => setEngine(n),
      onExposure: (r: { min: number; max: number; step: number }) => setExposure(r),
    });
    ctrl.current = c;
    return () => c.stop();
  }, [location]);

  const undo = async () => {
    const last = session[0];
    if (!last || !location || !user || !claims?.orgId) return;
    await writeEvent({ type: "void", locationId: location.id, aspId: claims.orgId, userId: user.uid, orgId: claims.orgId, source: "manual", engine: null, payload: { targetEventId: last.id } });
    setSession((s) => s.slice(1));
    show(t("scan.undone"), "warn");
  };

  const siteDone = () => user && location && claims?.orgId && writeEvent({ type: "site_done", locationId: location.id, aspId: claims.orgId, userId: user.uid, orgId: claims.orgId, source: "manual", engine: null }).then(() => show(t("scan.siteDone"), "ok"));

  const takePhoto = () => photoInput.current?.click();
  const onPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !lastEventId || !claims?.orgId) return;
    const n = (photoNum[lastEventId] ?? 0) + 1;
    setPhotoNum((m) => ({ ...m, [lastEventId]: n }));
    try {
      await enqueuePhoto(lastEventId, claims.orgId, file, n);
      toast.success(t("scan.photoQueued"));
      void flushQueue();
    } catch {
      toast.error(t("scan.photoFailed"));
    }
  };
  const confirmModelPick = async () => {
    if (!modelPick) return;
    await record(modelPick.code, modelPick.source, modelPick.second, modelPickId || undefined);
    setModelPick(null); setModelPickId("");
  };
  const skipModelPick = async () => {
    if (!modelPick) return;
    await record(modelPick.code, modelPick.source, modelPick.second);
    setModelPick(null); setModelPickId("");
  };
  const clearLost = async () => { await dropLost(); setLostCount(0); toast.success(t("scan.lostCleared")); };

  if (!location) return <Empty title={t("location.choose")} action={<Button asChild><Link to="/" data-testid="scan-choose-location">{t("location.choose")}</Link></Button>} />;
  const catLabel = (id: string | null) => sorting.categories.find((c) => c.id === id)?.labels[i18n.language as "it" | "en"] ?? "";
  const needPhotoForDefective = photoMandatoryDefective && mode === "classify" && newClass === "defective";

  return (
    <div className="space-y-4 max-w-3xl" data-testid="scan-screen">
      {shipmentId && <p className="text-xs text-primary font-mono" data-testid="scan-shipment-id">{t("scan.shipmentLabel")}: {shipmentId.slice(0, 8)}</p>}
      <div className="flex flex-wrap gap-2">
        {(MODES[role] ?? []).map((m) => (
          <Button key={m} variant={m === mode ? "primary" : "secondary"} size="lg" onClick={() => setParams((p) => { p.set("mode", m); return p; })} data-testid={`scan-mode-${m}`}>{t(`scan.modes.${m}`)}</Button>
        ))}
        {role === "asp_technician" && <Button variant="outline" size="lg" onClick={siteDone} data-testid="scan-site-done">{t("scan.siteDoneButton")}</Button>}
      </div>
      {mode === "arrive_at_warehouse" && (
        <Select aria-label={t("scan.flow")} value={flow} onChange={(e) => setFlow(e.target.value)} data-testid="scan-flow-select">
          <option value="removed">{t("scan.flowRemoved")}</option><option value="new">{t("scan.flowNew")}</option>
        </Select>
      )}
      {(mode === "classify" || (mode === "arrive_at_warehouse" && flow === "removed")) && (
        <div className="space-y-2">
          {mode === "classify" && suggested && (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-3xl font-bold text-primary" data-testid="scan-suggested-category">{t("scan.suggested")}: {catLabel(suggested)}</p>
              {/* §10: for previousFlow=new pieces, also say "installed new material". */}
              {lastPieceBadge === "previously_new" && <span className="rounded bg-warning/15 text-warning text-xs font-semibold px-2 py-1" data-testid="scan-installed-new-material">{t("scan.installedNewMaterial")}</span>}
            </div>
          )}
          <Select aria-label={t("scan.category")} value={category} onChange={(e) => { setCategory(e.target.value); setNewClass(""); }} data-testid="scan-category-select">
            <option value="">{mode === "classify" ? t("scan.useSuggested") : t("scan.sortLater")}</option>
            {sorting.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.labels[i18n.language as "it" | "en"]}</option>)}
          </Select>
          {mode === "classify" && (
            <Select aria-label={t("scan.newClass")} value={newClass} onChange={(e) => { setNewClass(e.target.value); setCategory(""); }} data-testid="scan-newclass-select">
              <option value="">{t("scan.removedMaterial")}</option><option value="defective">{t("scan.defective")}</option><option value="leftover">{t("scan.leftover")}</option>
            </Select>
          )}
          {needPhotoForDefective && <p className="text-xs text-warning" data-testid="scan-defective-photo-hint">{t("scan.defectivePhotoRequired")}</p>}
        </div>
      )}
      <div className="relative overflow-hidden rounded-lg border border-border bg-black aspect-video">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted data-testid="scan-video" />
        <div className="pointer-events-none absolute inset-x-[15%] inset-y-[30%] border-4 border-primary rounded" aria-hidden />
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white" data-testid="scan-engine">{engine ? t(`scan.engine.${engine}`) : t("common.loading")}</span>
        <p className="absolute bottom-2 left-2 right-2 text-center text-xs text-white bg-black/60 rounded px-2 py-1">{t("scan.photoReminder")}</p>
        {flash && <div className={cn("absolute inset-0 flex items-center justify-center text-2xl font-mono font-bold p-4 text-center", flash.tone === "ok" ? "bg-success text-black" : "bg-warning text-black")} role="status" data-testid="scan-flash">{flash.tone === "ok" ? "✓ " : "! "}{flash.text}</div>}
      </div>
      {camError && <p role="alert" className="text-danger text-sm" data-testid="scan-camera-error">{t(`scan.errors.${camError}`)}</p>}
      <div className="flex flex-wrap gap-2 items-center">
        {torch !== null && <Button variant="secondary" onClick={async () => { if (await ctrl.current?.setTorch(!torch)) setTorch(!torch); }} data-testid="scan-torch"><Flashlight className="h-5 w-5" /> {t("scan.torch")}</Button>}
        {exposure && <label className="flex items-center gap-2 text-sm"><Sun className="h-5 w-5" aria-hidden />{t("scan.exposure")}
          <input type="range" min={exposure.min} max={0} step={exposure.step || 0.1} defaultValue={0} onChange={(e) => void ctrl.current?.setExposure(Number(e.target.value))} data-testid="scan-exposure" /></label>}
        <Button variant="secondary" onClick={() => { localStorage.setItem("swaptrack.muted", muted ? "0" : "1"); setMuted(!muted); }} aria-label={t("scan.sound")} data-testid="scan-mute">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</Button>
        <Button variant="secondary" disabled={!session.length} onClick={undo} data-testid="scan-undo"><Undo2 className="h-5 w-5" /> {t("scan.undo")}</Button>
        <Button variant="secondary" disabled={!lastEventId} onClick={takePhoto} data-testid="scan-photo-button"><Camera className="h-5 w-5" /> {t("scan.photo")}</Button>
        <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoFile} data-testid="scan-photo-input" />
        <Checkbox id="scan-product" label={t("scan.askProduct")} checked={askProduct} onChange={setAskProduct} testId="scan-ask-product" />
      </div>
      {lostCount > 0 && <div className="rounded bg-warning/15 text-warning text-xs p-2 flex gap-2 items-center" data-testid="scan-lost-photos">{t("scan.photosLost", { count: lostCount })} <Button size="sm" variant="ghost" onClick={clearLost} data-testid="scan-lost-clear">{t("common.close")}</Button></div>}
      <form onSubmit={(e) => { e.preventDefault(); void onCode(wedge, "wedge"); setWedge(""); }}>
        <Input inputMode="none" autoFocus aria-label={t("scan.wedge")} placeholder={t("scan.wedge")} value={wedge} onChange={(e) => setWedge(e.target.value)} data-testid="scan-wedge-input" className="font-mono" />
      </form>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void onCode(manual, "manual"); setManual(""); }}>
        <Input inputMode="text" aria-label={t("scan.manual")} placeholder={t("scan.manual")} value={manual} onChange={(e) => setManual(e.target.value)} data-testid="scan-manual-input" className="font-mono" />
        <Button type="submit" data-testid="scan-manual-submit">{t("common.confirm")}</Button>
      </form>
      <section>
        <h2 className="font-semibold mb-2">{t("scan.today")}</h2>
        {today.length === 0 ? <p className="text-sm text-muted">{t("scan.todayEmpty")}</p> : (
          <ul className="space-y-1 text-sm" data-testid="scan-today-list">
            {today.map((s) => (
              <li key={s.id} className="flex gap-3 border-b border-border py-1">
                <span className="tabular text-muted">{formatInstant(s.at, i18n.language)}</span>
                <span>{t(`scan.modes.${s.type}`, { defaultValue: s.type })}</span>
                <span className="font-mono truncate">{s.codeRaw ?? ""}</span>
                <span className="ml-auto">{s.pending ? t("scan.waiting") : t("scan.sent")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {bom && bomDirection && (
        <section data-testid="scan-bom-section" className="rounded border border-border p-3">
          <h2 className="font-semibold mb-1 flex items-center gap-2">
            {t("scan.bom.title")}
            <span className="text-xs text-muted font-mono">{bom.id.slice(0, 8)}</span>
            <span className="ml-auto text-sm tabular" data-testid="scan-bom-count">{bomTicks.size}/{bom.expected.length}</span>
          </h2>
          <p className="text-xs text-muted mb-2">{t(`scan.bom.direction.${bomDirection}`)}</p>
          {bom.expected.length === 0 ? (
            <p className="text-sm text-muted">{t("scan.bom.noLines")}</p>
          ) : (
            <ul className="space-y-1 text-sm" data-testid="scan-bom-lines">
              {bom.expected.map((line) => {
                const done = bomTicks.has(line.codeId);
                return (
                  <li key={line.codeId} className={cn("flex items-center gap-2 border-b border-border py-1 font-mono text-xs", done && "text-success")} data-testid={`scan-bom-line-${done ? "done" : "todo"}`}>
                    <Check className={cn("h-4 w-4", done ? "" : "opacity-30")} aria-hidden />
                    <span className="truncate">{line.codeRaw}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {bomUnexpected.length > 0 && (
            <>
              <p className="text-xs text-warning font-semibold mt-3 flex items-center gap-2" data-testid="scan-bom-unexpected-title">
                <AlertTriangle className="h-4 w-4" aria-hidden />
                {t("scan.bom.unexpectedTitle", { count: bomUnexpected.length })}
              </p>
              <ul className="space-y-1 text-xs font-mono mt-1 text-warning" data-testid="scan-bom-unexpected-list">
                {bomUnexpected.map((c) => <li key={c} className="truncate">{c}</li>)}
              </ul>
            </>
          )}
        </section>
      )}

      <Dialog open={!!modelPick} onOpenChange={(o) => { if (!o) setModelPick(null); }}>
        <DialogContent title={t("scan.unknownPieceTitle")} description={t("scan.unknownPieceHint", { code: modelPick?.code })}>
          <div className="space-y-3">
            <Field label={t("items.model")} htmlFor="mp"><Select id="mp" value={modelPickId} onChange={(e) => setModelPickId(e.target.value)} data-testid="scan-modelpick-select">
              <option value="">{t("scan.skipModel")}</option>
              {models.map((m) => <option key={m.id} value={m.id}>{m.model} · {m.materialCode}</option>)}
            </Select></Field>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={skipModelPick} data-testid="scan-modelpick-skip">{t("scan.skipModel")}</Button>
              <Button onClick={confirmModelPick} disabled={!modelPickId} data-testid="scan-modelpick-save">{t("common.confirm")}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
