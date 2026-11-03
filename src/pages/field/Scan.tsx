import * as React from "react";
import { useSearchParams, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Flashlight, Sun, Undo2, Volume2, VolumeX, Camera, Check, AlertTriangle } from "lucide-react";
import { useSession } from "@/app/session";
import { startScanner } from "@/lib/scanner/engine.js";
import { writeEvent, watchMyScansToday, isProductCode, cachedItemForCode, loadSorting, cachedBomForSite, cachedOpenDdtsForWarehouse, watchRejectedScans, type Category, type Source, type MyScan, type CachedDdt, type RejectedScan } from "@/lib/data/events";
import { listModels, watchDoc, loadFieldLocations, type Row, type Model } from "@/lib/data/db";
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
// P-98: how long the camera ignores the code it just read (the phone held still on the label).
const CAMERA_REPEAT_MS = 3000;
const BURST_KEY = "swaptrack.burst";
// P-108: the look of a scan button that cannot be used yet (photo before the first reading, undo with nothing to undo).
const OFF = "disabled:opacity-100 disabled:border-dashed disabled:bg-transparent disabled:text-muted";

function beep(muted: boolean) {
  if (muted) return;
  try { const c = new AudioContext(); const o = c.createOscillator(); o.frequency.value = 1200; o.connect(c.destination); o.start(); o.stop(c.currentTime + 0.12); } catch { /* no audio */ }
}

// §7.2 scanning screen: camera through engine.js only (R16), keyboard wedge, manual entry, burst, undo last,
// optional photo (offline queue, §7.3), model pick for unknown pieces (§6.4), shipment-draft burst mode (§9.3 / §9.4).
export default function Scan() {
  const { t, i18n } = useTranslation();
  const { claims, user, location, setLocation, fieldCacheAt } = useSession();
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
  // §12.2 / P-25 (D-27): arrival of removed material can sort in the same pass; off by default (arrival only).
  const [sortNow, setSortNow] = React.useState(false);
  const sortsOnArrival = mode === "arrive_at_warehouse" && flow === "removed" && sortNow;
  const suggests = mode === "classify" || sortsOnArrival;
  const [newClass, setNewClass] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [suggested, setSuggested] = React.useState<string | null>(null);
  // The suggestion of the piece being recorded: the state only shows it; the payload reads the ref, set before
  // recording (the state seen by onCode is the one of the previous reading).
  const suggestedRef = React.useRef<string | null>(null);
  const [sorting, setSorting] = React.useState<{ categories: Category[]; rules: SortingRule[] }>({ categories: [], rules: [] });
  // The sorting rules as loaded: a reading made right after the screen opens waits for them, so its suggestion is
  // never computed on an empty list (P-25).
  const sortingLoad = React.useRef<Promise<{ categories: Category[]; rules: SortingRule[] }> | null>(null);
  // P-98: the last code the camera read (or recorded) and when.
  // P-109: told shows that the user has been told once that this code was already read.
  const cameraLast = React.useRef<{ code: string; at: number; told?: boolean } | null>(null);
  const [materialCodes, setMaterialCodes] = React.useState<string[]>([]);
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  // P-20 (D-11): readings since this screen was opened (newest first); the mode does not reset it.
  const [session, setSession] = React.useState<{ id: string; code: string; type: string }[]>([]);
  const [today, setToday] = React.useState<MyScan[]>([]);
  // §12.2 / P-24 (D-15): the DDT chosen for an arrival of new material (never pre-selected) and the live comparison.
  const [ddts, setDdts] = React.useState<CachedDdt[]>([]);
  const [ddtId, setDdtId] = React.useState("");
  const [ddtExpected, setDdtExpected] = React.useState<Array<{ codeRaw: string; codeId: string }>>([]);
  const [ddtTicks, setDdtTicks] = React.useState<Set<string>>(new Set());
  const [ddtUnexpected, setDdtUnexpected] = React.useState<string[]>([]);
  const [modelPick, setModelPick] = React.useState<{ code: string; source: Source; second?: string } | null>(null);
  const [modelPickId, setModelPickId] = React.useState("");
  const [pendingSort, setPendingSort] = React.useState<{ code: string; source: Source; suggested: string | null } | null>(null);
  // P-113: the model search of the unknown-piece window (model, material code, manufacturer; case and accents ignored).
  const [modelQuery, setModelQuery] = React.useState("");
  const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const modelMatches = modelQuery.trim()
    ? models.filter((m) => fold(`${m.model} ${m.materialCode} ${m.manufacturer ?? ""}`).includes(fold(modelQuery.trim()))).slice(0, 8)
    : [];
  const [lastEventId, setLastEventId] = React.useState<string | null>(null);
  const [lostCount, setLostCount] = React.useState(0);
  const [lastPieceBadge, setLastPieceBadge] = React.useState<"previously_new" | null>(null);
  const photoInput = React.useRef<HTMLInputElement>(null);
  const [photoNum, setPhotoNum] = React.useState<Record<string, number>>({});
  // P-115 (n.5): the setting is settings/photos, where the Settings page saves it (readable by every role).
  const [photoMandatoryDefective, setPhotoMandatoryDefective] = React.useState(false);
  React.useEffect(() => watchDoc<{ mandatoryForDefective?: boolean }>("settings/photos", (v) => setPhotoMandatoryDefective(!!v?.mandatoryForDefective)), []);
  // P-115 (n.23): readings the server refused, shown on their row and said once.
  const [defectivePhotoFor, setDefectivePhotoFor] = React.useState<string | null>(null);
  // P-115 (n.28): opened from a shipment, the screen works at the shipment's place (given in the address), never at
  // the place left in the session.
  const paramLocation = params.get("location");
  React.useEffect(() => {
    if (!paramLocation || !claims?.orgId || location?.id === paramLocation) return;
    void loadFieldLocations(claims.orgId).then(({ list }) => {
      const l = list.find((x) => x.id === paramLocation);
      if (l) setLocation({ id: l.id, code: l.code, name: l.name, type: l.type });
    }).catch(() => undefined);
  }, [paramLocation, claims?.orgId, location?.id, setLocation]);
  const [rejectedScans, setRejectedScans] = React.useState<RejectedScan[]>([]);
  const toldRejected = React.useRef(new Set<string>());
  React.useEffect(() => watchRejectedScans((all) => {
    setRejectedScans(all);
    for (const r of all) {
      if (toldRejected.current.has(r.id)) continue;
      toldRejected.current.add(r.id);
      toast.error(t("scan.refusedToast", { code: r.codeRaw ?? "" }), { description: t(r.reason === "permission-denied" ? "scan.refusedPermission" : "scan.refusedOther") });
    }
  }), [t]);

  // §12.1 point 4: BOM tick list for the technician scan screen. Direction derived from mode.
  const bomDirection: "remove" | "install" | null = mode === "remove_at_site" ? "remove" : mode === "install_at_site" ? "install" : null;
  const [bom, setBom] = React.useState<{ id: string; expected: Array<{ codeRaw: string; codeId: string }>; createdAtMs: number } | null>(null);
  const [bomTicks, setBomTicks] = React.useState<Set<string>>(new Set());
  const [bomUnexpected, setBomUnexpected] = React.useState<string[]>([]);

  React.useEffect(() => {
    void listModels().then((m) => { setMaterialCodes(m.map((x) => x.materialCode)); setModels(m); }).catch(() => undefined);
    const load = loadSorting() as Promise<{ categories: Category[]; rules: SortingRule[] }>;
    sortingLoad.current = load;
    void load.then(setSorting).catch(() => undefined);
    void listLost().then((l) => setLostCount(l.length));
    return user ? watchMyScansToday(user.uid, setToday) : undefined;
  }, [user, claims]);

  // P-24: the open DDTs of this warehouse; the choice is the user's. P-104: offered at every arrival in an ASP warehouse,
  // also before choosing "new": choosing a DDT sets the flow to new material.
  const ddtOffered = mode === "arrive_at_warehouse" && location?.type === "asp_warehouse";
  const ddtApplies = ddtOffered && flow === "new";
  // The list comes from the cache the session loads at sign-in (P-73); it is read again when that load completes.
  React.useEffect(() => { setDdtId(""); }, [ddtOffered, location]);
  React.useEffect(() => {
    if (!ddtOffered || !location || !claims?.orgId) { setDdts([]); return; }
    let aborted = false;
    void cachedOpenDdtsForWarehouse(location.id, claims.orgId).then((list) => { if (!aborted) setDdts(list); });
    return () => { aborted = true; };
  }, [ddtOffered, location, fieldCacheAt, claims?.orgId]);

  // The serial lines of the chosen DDT, by codeId (the same identity the trigger uses, R8).
  React.useEffect(() => {
    const d = ddts.find((x) => x.id === ddtId);
    if (!d) { setDdtExpected([]); return; }
    let aborted = false;
    (async () => {
      const expected: Array<{ codeRaw: string; codeId: string }> = [];
      for (const raw of d.lines) {
        const l = raw as { kind?: string; codeRaw?: string; codeId?: string };
        if (l.kind !== "serial" || !l.codeRaw) continue;
        expected.push({ codeRaw: l.codeRaw, codeId: l.codeId || (await computeCodeId(l.codeRaw)) });
      }
      if (!aborted) setDdtExpected(expected);
    })();
    return () => { aborted = true; };
  }, [ddts, ddtId]);

  // Live arrived / missing / unexpected, computed on the device from the user's own arrivals of today at this
  // warehouse joined with the DDT lines, with the server's rule (§11.3): an arrival counts for the DDT if it carries
  // its ddtId or its code is one of its serial lines; unexpected = carries the ddtId but is not a line.
  React.useEffect(() => {
    if (!ddtId || !location) { setDdtTicks(new Set()); setDdtUnexpected([]); return; }
    const expectedSet = new Set(ddtExpected.map((e) => e.codeId));
    const relevant = today.filter((s) => !s.voided && s.type === "arrive_at_warehouse" && s.codeRaw && s.locationId === location.id);
    let aborted = false;
    (async () => {
      const ticks = new Set<string>();
      const unexpected: string[] = [];
      const seen = new Set<string>();
      for (const s of relevant) {
        const cid = await computeCodeId(s.codeRaw!);
        if (seen.has(cid)) continue; seen.add(cid);
        if (expectedSet.has(cid)) ticks.add(cid); else if (s.ddtId === ddtId) unexpected.push(s.codeRaw!);
      }
      if (aborted) return;
      setDdtTicks(ticks); setDdtUnexpected(unexpected);
    })();
    return () => { aborted = true; };
  }, [ddtId, ddtExpected, today, location]);

  // §12.1: load the BOM of the current site (if any) from the ASP cache; direction filters the lines shown.
  React.useEffect(() => {
    if (!location || !bomDirection || location.type !== "site" || !claims?.orgId) { setBom(null); return; }
    void cachedBomForSite(location.id, claims.orgId).then(async (b) => {
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
  }, [location, bomDirection, fieldCacheAt, claims?.orgId]);

  // §12.1: ticks are computed on the device from the user's own events (local, including pending writes).
  // Joined with the BOM's expected codeIds; anything not expected goes to the unexpected list.
  React.useEffect(() => {
    if (!bom || !bomDirection || !location) { setBomTicks(new Set()); setBomUnexpected([]); return; }
    // P-115 (n.4): only the readings at this site since the BOM exists, like the server's check (bomCheck.ts).
    const relevant = today.filter((s) => !s.voided && s.type === mode && s.codeRaw && s.locationId === location.id && s.at.getTime() >= bom.createdAtMs);
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
    setTimeout(() => setFlash(null), 900);
  };
  // D-55 / P-121: after a camera reading the camera reads again by itself only in burst mode; otherwise it waits for
  // "Read the next". The choice is kept on this phone (off when nothing is saved).
  const [burst, setBurstState] = React.useState(() => { try { return localStorage.getItem(BURST_KEY) === "1"; } catch { return false; } });
  const burstRef = React.useRef(burst);
  burstRef.current = burst;
  const setBurst = (on: boolean) => { setBurstState(on); try { localStorage.setItem(BURST_KEY, on ? "1" : "0"); } catch { /* storage unavailable */ } };
  const [awaitingNext, setAwaitingNext] = React.useState(false);
  const afterCameraReading = () => { if (burstRef.current) ctrl.current?.resume(); else setAwaitingNext(true); };
  const readNext = () => { setAwaitingNext(false); ctrl.current?.resume(); };

  // P-102: a sorting chosen in the confirmation window (one tap) wins over the screen's choices.
  type SortChoice = { categoryId?: string; newClass?: string };
  const buildPayload = (choice?: SortChoice): Record<string, unknown> => {
    const payload: Record<string, unknown> = {};
    if (mode === "arrive_at_warehouse") {
      payload.flow = flow; if (shipmentId) payload.shipmentId = shipmentId; if (ddtApplies && ddtId) payload.ddtId = ddtId;
      // Sorting in the same pass: the category chosen in the list, otherwise the piece's suggestion; none = arrival only.
      // D-39: only removed material is sorted; an arrival of new material never carries a category.
      if (flow === "removed") {
        const sug = sortsOnArrival ? suggestedRef.current : null;
        if (category || sug) payload.categoryId = category || sug;
        if (sug) payload.suggestedCategoryId = sug;
      }
    }
    if (mode === "classify") {
      const sug = suggestedRef.current;
      const nc = choice ? choice.newClass : newClass;
      if (nc) payload.newClass = nc; else payload.categoryId = choice?.categoryId || category || sug;
      if (sug) payload.suggestedCategoryId = sug;
    }
    if ((mode === "return_ship" || mode === "transfer_out") && shipmentId) payload.shipmentId = shipmentId;
    return payload;
  };
  // D-39: a category chosen (or suggested) for removed material never stays behind when the flow changes.
  const changeFlow = (v: string) => { setFlow(v); setCategory(""); suggestedRef.current = null; setSuggested(null); if (v !== "new") setDdtId(""); };
  const needsCategory = () => mode === "classify" && !newClass && !category && !suggestedRef.current;

  const record = async (code: string, source: Source, second?: string, modelId?: string, choice?: SortChoice) => {
    if (!location || !user || !claims?.orgId) return;
    if (!choice && needsCategory()) { show(t("scan.chooseCategory"), "warn"); return; }
    const payload = buildPayload(choice);
    if (modelId) payload.modelId = modelId;
    if (mode === "return_ship" || mode === "transfer_out") {
      if (!shipmentId) { toast.error(t("errors.shipment_not_found")); return; }
    }
    const id = await writeEvent({ type: mode, locationId: location.id, aspId: claims.orgId, userId: user.uid, orgId: claims.orgId, source, engine: source === "camera" ? engine : null, codeRaw: code, secondCodeRaw: second, payload });
    setSession((s) => [{ id, code, type: mode }, ...s]);
    setLastEventId(id);
    // §12.2 / P-115 (n.5): a new defective with the setting on asks for its photo until one is queued.
    if (mode === "classify" && payload.newClass === "defective" && photoMandatoryDefective) setDefectivePhotoFor(id);
    if (source === "camera") cameraLast.current = { code, at: Date.now() };
    if (sortsOnArrival && !payload.categoryId) show(t("scan.toSortLater", { code }), "warn"); else show(code, "ok");
  };

  // P-112: the camera pauses at every decode (webEngine.js) and restarts with the flash of the reading (show). Whatever
  // way a camera reading ends (an error, a refused shipment, a message), it restarts here too; only while the model of
  // an unknown piece is asked it stays paused, and closing that window records the reading (skipModelPick).
  const onCode = async (raw: string, source: Source) => {
    let r: "asked" | "continue" | void;
    try { r = await handleCode(raw, source); }
    finally {
      // The second code of a reading (the product code after the serial) is read at once, also without burst mode.
      if (source === "camera" && r! !== "asked") setTimeout(() => (r === "continue" ? ctrl.current?.resume() : afterCameraReading()), 950);
    }
  };
  const handleCode = async (raw: string, source: Source): Promise<"asked" | "continue" | void> => {
    const code = raw.trim();
    if (!code) return;
    if (source === "camera") {
      // P-98: the camera restarts 0.9 s after a reading (burst) and forgets what it read (webEngine.js, frozen). The
      // same code is ignored while it stays in view and for CAMERA_REPEAT_MS after it was last seen or recorded.
      const last = cameraLast.current, now = Date.now();
      const repeat = !!last && last.code === code && now - last.at < CAMERA_REPEAT_MS;
      cameraLast.current = { code, at: now, told: repeat && last!.told };
      if (repeat) {
        // P-109: said once, quietly (no beep, no vibration), not at every frame while the phone stays on the label.
        if (!last!.told) { toast.message(t("scan.alreadyRead"), { id: "scan-already-read" }); cameraLast.current.told = true; }
        setTimeout(() => ctrl.current?.resume(), 300);
        return;
      }
    }
    if (pendingSerial) { const p = pendingSerial; setPendingSerial(null); return record(p.code, p.source, code); }
    if (isProductCode(code, materialCodes)) { show(t("scan.productCode"), "warn"); return; } // §6.3: no event
    if (suggests) {
      const it = await cachedItemForCode(code);
      const loaded = (await sortingLoad.current?.catch(() => null)) ?? sorting;
      // Censimento n.24: a rule leading to a category no longer active is skipped (the next rule applies).
      const active = new Set(loaded.categories.filter((c) => c.active).map((c) => c.id));
      const s = it ? suggestCategory(loaded.rules, { siteId: it.siteOfOrigin as string, modelId: it.modelId as string, equipmentType: it.equipmentType as string }, active) : null;
      suggestedRef.current = s;
      setSuggested(s);
      setLastPieceBadge(it?.previousFlow === "new" ? "previously_new" : null);
    }
    if (askProduct) { setPendingSerial({ code, source }); show(t("scan.nowProductCode"), "warn"); return "continue"; }
    // §10 / P-102: in "Sort" without a fixed category the suggestion is confirmed with one tap, or another one chosen;
    // nothing is recorded until then (the camera waits, as for the model). A fixed category records at once.
    if (mode === "classify" && !category && !newClass) { setPendingSort({ code, source, suggested: suggestedRef.current }); return "asked"; }
    // §6.4 model pick for unknown pieces: if unknown + warehouse/technician, ask for model (skip is allowed).
    // P-104: a serial line of the chosen DDT is never asked: the server takes its model from the line (expectedCodes);
    // a line without a model leaves the piece "to complete", filled in when the document gets it (§6.4).
    const cid = ddtApplies && ddtId ? await computeCodeId(code) : null;
    const inChosenDdt = !!cid && ddtExpected.some((e) => e.codeId === cid);
    if ((mode === "remove_at_site" || mode === "arrive_at_warehouse") && !inChosenDdt && !await cachedItemForCode(code)) {
      setModelPick({ code, source }); setModelPickId(""); setModelQuery(""); return "asked";
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
    // P-115 (n.21): the photo goes with the reading before the undone one, or with none.
    setLastEventId(session[1]?.id ?? null);
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
      if (defectivePhotoFor === lastEventId) setDefectivePhotoFor(null);
      toast.success(t("scan.photoQueued"));
      void flushQueue();
    } catch {
      toast.error(t("scan.photoFailed"));
    }
  };
  // P-102: the tap records the reading with the chosen sorting; cancelling (button, X, a tap outside, the back key)
  // records nothing, says so and lets the camera read again (P-112).
  const confirmSort = async (choice: SortChoice) => {
    const p = pendingSort;
    if (!p) return;
    setPendingSort(null);
    await record(p.code, p.source, undefined, undefined, choice);
    if (p.source === "camera") setTimeout(afterCameraReading, 950);
  };
  const cancelSort = () => {
    const p = pendingSort;
    if (!p) return;
    setPendingSort(null);
    toast.message(t("scan.notSorted", { code: p.code }), { id: "scan-not-sorted" });
    if (p.source === "camera") setTimeout(afterCameraReading, 300);
  };
  // The piece waiting for its model is taken first, so a double tap (or "Save" and then the X) records it once.
  const confirmModelPick = async () => {
    const p = modelPick;
    if (!p) return;
    setModelPick(null); setModelPickId("");
    await record(p.code, p.source, p.second, modelPickId || undefined);
    if (p.source === "camera") setTimeout(afterCameraReading, 950);
  };
  // D-50 (P-112): closing the window (X, a tap outside, the back key) is "Skip": the reading is recorded without a model
  // (needsModel, "To complete", §6.4) and the camera reads again. A wrong reading has "Undo last".
  const skipModelPick = async () => {
    const p = modelPick;
    if (!p) return;
    setModelPick(null); setModelPickId("");
    await record(p.code, p.source, p.second);
    if (p.source === "camera") setTimeout(afterCameraReading, 950);
  };
  const clearLost = async () => { await dropLost(); setLostCount(0); toast.success(t("scan.lostCleared")); };

  if (!location) return <Empty title={t("location.choose")} action={<Button asChild><Link to="/" data-testid="scan-choose-location">{t("location.choose")}</Link></Button>} />;
  const catLabel = (id: string | null) => sorting.categories.find((c) => c.id === id)?.labels[i18n.language as "it" | "en"] ?? "";
  const needPhotoForDefective = photoMandatoryDefective && mode === "classify" && newClass === "defective";
  // "My scans of today": a void is shown on the reading it undid, not as a row of its own.
  const todayRows = today.filter((s) => s.type !== "void");
  const selectedDdt = ddtApplies ? ddts.find((d) => d.id === ddtId) ?? null : null;

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
        <Select aria-label={t("scan.flow")} value={flow} onChange={(e) => changeFlow(e.target.value)} data-testid="scan-flow-select">
          <option value="removed">{t("scan.flowRemoved")}</option><option value="new">{t("scan.flowNew")}</option>
        </Select>
      )}
      {ddtOffered && (
        <div className="flex items-center gap-2">
          <Select aria-label={t("scan.ddt.label")} value={ddtId} onChange={(e) => { const v = e.target.value; if (v && flow !== "new") changeFlow("new"); setDdtId(v); }} data-testid="scan-ddt-select">
            <option value="">{t("scan.ddt.none")}</option>
            {ddts.map((d) => <option key={d.id} value={d.id}>{t("scan.ddt.option", { number: d.number })}</option>)}
          </Select>
          {/* §12.2 / P-105: the DDT can also be uploaded from here, as a file or a photo of the paper. */}
          <Link to={`/documents/new?kind=ddt_in&location=${location!.id}`} className="shrink-0 text-sm text-primary hover:underline" data-testid="scan-ddt-upload">{t("scan.ddt.upload")}</Link>
        </div>
      )}
      {(mode === "classify" || (mode === "arrive_at_warehouse" && flow === "removed")) && (
        <div className="space-y-2">
          {mode === "arrive_at_warehouse" && <Checkbox id="scan-sort-now" label={t("scan.sortNow")} checked={sortNow} onChange={setSortNow} testId="scan-sort-now" />}
          {suggests && suggested && (
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-3xl font-bold text-primary" data-testid="scan-suggested-category">{t("scan.suggested")}: {catLabel(suggested)}</p>
              {/* §10: for previousFlow=new pieces, also say "installed new material". */}
              {lastPieceBadge === "previously_new" && <span className="rounded bg-warning/15 text-warning text-xs font-semibold px-2 py-1" data-testid="scan-installed-new-material">{t("scan.installedNewMaterial")}</span>}
            </div>
          )}
          <Select aria-label={t("scan.category")} value={category} onChange={(e) => { setCategory(e.target.value); setNewClass(""); }} data-testid="scan-category-select">
            <option value="">{mode === "classify" ? t("scan.confirmEachPiece") : suggests ? t("scan.useSuggested") : t("scan.sortLater")}</option>
            {sorting.categories.filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.labels[i18n.language as "it" | "en"]}</option>)}
          </Select>
          {mode === "classify" && (
            <Select aria-label={t("scan.newClass")} value={newClass} onChange={(e) => { setNewClass(e.target.value); setCategory(""); }} data-testid="scan-newclass-select">
              <option value="">{t("scan.removedMaterial")}</option><option value="defective">{t("scan.defective")}</option><option value="leftover">{t("scan.leftover")}</option>
            </Select>
          )}
          {needPhotoForDefective && !defectivePhotoFor && <p className="text-xs text-warning" data-testid="scan-defective-photo-hint">{t("scan.defectivePhotoRequired")}</p>}
          {defectivePhotoFor && defectivePhotoFor === lastEventId && (
            <div className="flex items-center gap-2 rounded border border-warning p-2 text-sm text-warning" data-testid="scan-defective-photo-needed">
              <span>{t("scan.defectivePhotoNow")}</span>
              <Button size="sm" onClick={takePhoto} className="ml-auto" data-testid="scan-defective-photo-take"><Camera className="h-4 w-4" />{t("scan.photo")}</Button>
            </div>
          )}
        </div>
      )}
      <div className="relative overflow-hidden rounded-lg border border-border bg-black aspect-video">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted data-testid="scan-video" />
        <div className="pointer-events-none absolute inset-x-[15%] inset-y-[30%] border-4 border-primary rounded" aria-hidden />
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white" data-testid="scan-engine">{engine ? t(`scan.engine.${engine}`) : t("common.loading")}</span>
        <p className="absolute bottom-2 left-2 right-2 text-center text-xs text-white bg-black/60 rounded px-2 py-1">{t("scan.photoReminder")}</p>
        {flash && <div className={cn("absolute inset-0 flex items-center justify-center text-2xl font-mono font-bold p-4 text-center", flash.tone === "ok" ? "bg-success text-black" : "bg-warning text-black")} role="status" data-testid="scan-flash">{flash.tone === "ok" ? "✓ " : "! "}{flash.text}</div>}
      </div>
      {/* D-55 / P-121: single reading: the camera waits until the worker asks for the next piece. */}
      {awaitingNext && !burst && <Button size="lg" className="w-full" onClick={readNext} data-testid="scan-next"><Camera className="h-5 w-5" />{t("scan.readNext")}</Button>}
      {/* §7.2 burst mode, P-20 (D-11): counter and running list of this session's readings, below the camera, never over it. */}
      <section className="rounded border border-border p-3" data-testid="scan-session">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular" data-testid="scan-session-count">{session.length}</span>
          <span className="text-sm text-muted">{t("scan.sessionCount", { count: session.length })}</span>
        </p>
        {session.length > 0 && (
          <ul className="mt-2 max-h-36 overflow-y-auto text-sm" data-testid="scan-session-list">
            {session.map((s) => {
              const sent = today.some((r) => r.id === s.id && !r.pending);
              const refused = rejectedScans.find((r) => r.id === s.id);
              return (
                <li key={s.id} className="flex gap-3 border-b border-border py-1" data-testid="scan-session-row">
                  <span className="font-mono truncate">{s.code}</span>
                  <span className="text-muted">{t(`scan.modes.${s.type}`, { defaultValue: s.type })}</span>
                  <span className={cn("ml-auto shrink-0", refused && "text-danger font-semibold")} data-testid={refused ? "scan-session-refused" : undefined}>{refused ? t("scan.refused") : sent ? t("scan.sent") : t("scan.waiting")}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {selectedDdt && (
        <section className="rounded border border-border p-3" data-testid="scan-ddt-section">
          <h2 className="font-semibold mb-1">{t("scan.ddt.title", { number: selectedDdt.number })}</h2>
          <p className="flex flex-wrap gap-4 text-sm tabular">
            <span><span className="text-xl font-bold" data-testid="scan-ddt-arrived">{ddtTicks.size}</span> {t("scan.ddt.arrived")}</span>
            <span><span className="text-xl font-bold" data-testid="scan-ddt-missing">{ddtExpected.length - ddtTicks.size}</span> {t("scan.ddt.missing")}</span>
            <span><span className="text-xl font-bold" data-testid="scan-ddt-unexpected">{ddtUnexpected.length}</span> {t("scan.ddt.unexpected")}</span>
          </p>
          {ddtExpected.length === 0 ? (
            <p className="text-sm text-muted mt-2">{t("scan.ddt.noLines")}</p>
          ) : (
            <ul className="mt-2 max-h-36 overflow-y-auto space-y-1 text-xs font-mono" data-testid="scan-ddt-lines">
              {ddtExpected.map((line) => {
                const done = ddtTicks.has(line.codeId);
                return (
                  <li key={line.codeId} className={cn("flex items-center gap-2 border-b border-border py-1", done && "text-success")} data-testid={`scan-ddt-line-${done ? "done" : "todo"}`}>
                    <Check className={cn("h-4 w-4", done ? "" : "opacity-30")} aria-hidden />
                    <span className="truncate">{line.codeRaw}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {ddtUnexpected.length > 0 && (
            <ul className="mt-2 space-y-1 text-xs font-mono text-warning" data-testid="scan-ddt-unexpected-list">
              {ddtUnexpected.map((c) => <li key={c} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" aria-hidden /><span className="truncate">{c}</span> {t("scan.ddt.unexpected")}</li>)}
            </ul>
          )}
        </section>
      )}
      {camError && <p role="alert" className="text-danger text-sm" data-testid="scan-camera-error">{t(`scan.errors.${camError}`)}</p>}
      <div className="flex flex-wrap gap-2 items-center">
        {torch !== null && <Button variant="secondary" onClick={async () => { if (await ctrl.current?.setTorch(!torch)) setTorch(!torch); }} data-testid="scan-torch"><Flashlight className="h-5 w-5" /> {t("scan.torch")}</Button>}
        {exposure && <label className="flex items-center gap-2 text-sm"><Sun className="h-5 w-5" aria-hidden />{t("scan.exposure")}
          <input type="range" min={exposure.min} max={0} step={exposure.step || 0.1} defaultValue={0} onChange={(e) => void ctrl.current?.setExposure(Number(e.target.value))} data-testid="scan-exposure" /></label>}
        <Button variant="secondary" onClick={() => { localStorage.setItem("swaptrack.muted", muted ? "0" : "1"); setMuted(!muted); }} aria-label={t("scan.sound")} data-testid="scan-mute">{muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}</Button>
        {/* P-108: a button that cannot be used yet looks like one (dashed border, grey), and says why. */}
        <Button variant="secondary" disabled={!session.length} onClick={undo} className={OFF} data-testid="scan-undo"><Undo2 className="h-5 w-5" /> {t("scan.undo")}</Button>
        <Button variant="secondary" disabled={!lastEventId} onClick={takePhoto} className={OFF} data-testid="scan-photo-button"><Camera className="h-5 w-5" /> {t("scan.photo")}</Button>
        {!lastEventId && <p className="basis-full text-xs text-muted" data-testid="scan-photo-hint">{t("scan.photoHint")}</p>}
        <input ref={photoInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onPhotoFile} data-testid="scan-photo-input" />
        <Checkbox id="scan-burst" label={t("scan.burst")} checked={burst} onChange={setBurst} testId="scan-burst" />
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
        {todayRows.length === 0 ? <p className="text-sm text-muted">{t("scan.todayEmpty")}</p> : (
          <ul className="space-y-1 text-sm" data-testid="scan-today-list">
            {todayRows.map((s) => (
              <li key={s.id} className={cn("flex gap-3 border-b border-border py-1", s.voided && "text-muted")} data-testid="scan-today-row">
                <span className="tabular text-muted">{formatInstant(s.at, i18n.language)}</span>
                <span>{t(`scan.modes.${s.type}`, { defaultValue: s.type })}</span>
                <span className={cn("font-mono truncate", s.voided && "line-through")}>{s.codeRaw ?? ""}</span>
                <span className="ml-auto shrink-0">{s.voided ? <span data-testid="scan-today-voided">{t("scan.voided")}</span> : s.pending ? t("scan.waiting") : t("scan.sent")}</span>
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

      <Dialog open={!!pendingSort} onOpenChange={(o) => { if (!o) cancelSort(); }}>
        <DialogContent title={t("scan.sortTitle", { code: pendingSort?.code ?? "" })} description={t("scan.sortHint")}>
          <div className="space-y-3" data-testid="scan-sort">
            {pendingSort?.suggested && (
              <div className="space-y-2">
                <p className="text-2xl font-bold text-primary" data-testid="scan-sort-suggested">{t("scan.suggested")}: {catLabel(pendingSort.suggested)}</p>
                <Button size="lg" className="w-full" onClick={() => void confirmSort({ categoryId: pendingSort.suggested! })} data-testid="scan-sort-confirm"><Check className="h-5 w-5" />{t("common.confirm")}</Button>
              </div>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {sorting.categories.filter((c) => c.active && c.id !== pendingSort?.suggested).map((c) => (
                <li key={c.id}><Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => void confirmSort({ categoryId: c.id })} data-testid={`scan-sort-option-${c.id}`}>{c.labels[i18n.language as "it" | "en"]}</Button></li>
              ))}
              <li><Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => void confirmSort({ newClass: "defective" })} data-testid="scan-sort-defective">{t("scan.defective")}</Button></li>
              <li><Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => void confirmSort({ newClass: "leftover" })} data-testid="scan-sort-leftover">{t("scan.leftover")}</Button></li>
            </ul>
            <div className="flex justify-end"><Button variant="ghost" onClick={cancelSort} data-testid="scan-sort-cancel">{t("common.cancel")}</Button></div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!modelPick} onOpenChange={(o) => { if (!o) void skipModelPick(); }}>
        <DialogContent title={t("scan.unknownPieceTitle")} description={t("scan.unknownPieceHint", { code: modelPick?.code })}>
          <div className="space-y-3">
            {/* §6.4 / P-113: search by code or name; the matches are big buttons, to tap with gloves. */}
            <Input value={modelQuery} onChange={(e) => setModelQuery(e.target.value)} placeholder={t("scan.modelSearch")} aria-label={t("scan.modelSearch")} data-testid="scan-modelpick-search" />
            {modelQuery.trim() && (modelMatches.length === 0 ? <p className="text-sm text-muted" data-testid="scan-modelpick-none">{t("scan.modelSearchNone")}</p> : (
              <ul className="grid gap-2">
                {modelMatches.map((m) => (
                  <li key={m.id}><Button type="button" size="lg" variant={modelPickId === m.id ? "primary" : "secondary"} className="w-full justify-start" onClick={() => setModelPickId(m.id)} data-testid="scan-modelpick-result">{m.model} · {m.materialCode}</Button></li>
                ))}
              </ul>
            ))}
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
