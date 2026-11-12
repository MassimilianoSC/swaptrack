import * as React from "react";
import { useSearchParams, useNavigate, Link } from "react-router";
import { useTranslation } from "react-i18next";
import { Flashlight, Sun, Undo2, Volume2, VolumeX, Camera, Check, AlertTriangle, Sparkles, ChevronDown } from "lucide-react";
import { useSession } from "@/app/session";
import { startScanner } from "@/lib/scanner/engine.js";
import { writeEvent, watchMyScansToday, isProductCode, cachedItemForCode, loadSorting, cachedBomForSite, cachedOpenDdtsForWarehouse, watchRejectedScans, type Category, type Source, type MyScan, type CachedDdt, type CachedBom, type RejectedScan } from "@/lib/data/events";
import { listModels, watchDoc, loadFieldLocations, type Row, type Model, type Location } from "@/lib/data/db";
import { enqueuePhoto, flushQueue, listLost, dropLost } from "@/lib/offline/photoQueue";
import { computeCodeId, normalizeBarcode } from "@/lib/codeId.js";
import { itemState, judge, type Judgement } from "@/lib/scan/rereading";
import { useScanLog } from "@/lib/scan/scanLog";
import { matchingDdts, ddtsToShow } from "@/lib/scan/ddtSearch";
import { suggestCategory, type SortingRule } from "@shared/sorting";
import { formatInstant, cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, Select, Checkbox, Field } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Empty } from "@/components/states";
import { BackButton } from "@/components/BackButton";
import { ExpectedChip, ExpectedSection, type ExpectedListProps } from "@/components/scan/ExpectedList";
import { watchLines, type ShipmentLine } from "@/lib/data/shipments";
import { toast } from "sonner";
import { useOnline } from "@/app/hooks";
import { compressImage } from "@/lib/imageCompress.js";
import { extractLabelCodes, type LabelCode } from "@/lib/documents/extract";

const MODES: Record<string, string[]> = {
  asp_technician: ["remove_at_site", "install_at_site"],
  asp_warehouse: ["arrive_at_warehouse", "classify", "return_ship", "transfer_out"],
  asp_admin: ["arrive_at_warehouse", "classify", "return_ship", "transfer_out"],
};
// P-134 (D-62 criterion 4): these work only inside a shipment, so they are offered only when the screen is opened from one.
const SHIPMENT_MODES = ["return_ship", "transfer_out"];
// The server sorts a piece as "defective" / "leftover" only if it is new material at the warehouse, or already defective /
// leftover (shared/stateMachine.ts, classify); a piece the phone does not know is offered both, as before.
const newClassAllowed = (it: Record<string, unknown> | null) =>
  !it || (it.status === "received_at_asp" && it.flow === "new") || it.status === "defective" || it.status === "leftover";
// P-98: how long the camera ignores the code it just read (the phone held still on the label).
const CAMERA_REPEAT_MS = 3000;
const BURST_KEY = "swaptrack.burst";
// P-155 (D-72): what stays under the video in the first screen: the "read the next" button and one row of commands.
const BELOW_VIDEO_PX = 164;
// P-155 (D-72): the longest a reading waits for the server before its outcome (the piece, then the sorting rules).
const READING_WAIT_MS = 2500;
// P-157 (D-73), P-165 (D-75): how long a message stays over the video. Green 0.9 s. Yellow and red stay 8 s, readable
// by someone who has never seen them; the camera reads again after 3 s (0.9 s after the two yellow messages that only
// say what comes next), and from then on the message is a band at the top of the video, the frame free.
const FLASH_MS = 900;
const MESSAGE_MS = 8000;
const CAMERA_AFTER_WARNING_MS = 3000;
// D-75 (g): the notices of this screen (top) stay 8 s too; the rest of the app keeps the default.
const TOAST_8S = { duration: 8000 };
// The camera reads again this long after a reading, and in any case this long after the message over the video has gone.
const CAMERA_AFTER_READING_MS = 950;
const CAMERA_AFTER_FLASH_MS = 50;
const VIDEO_MAX_SCREEN_SHARE = 0.58;
// P-108: the look of a scan button that cannot be used yet (photo before the first reading, undo with nothing to undo).
const OFF = "disabled:opacity-100 disabled:border-dashed disabled:bg-transparent disabled:text-muted";

// P-155: one audio context for the screen, woken by the worker's touches (iOS keeps silent a context no touch started,
// and a new one per reading was never released). "first": the code was seen; "ok": recorded, when nothing was heard for
// it yet; "warn": look at the screen (two low tones, told apart without looking).
let audio: AudioContext | null = null;
function audioContext(): AudioContext | null {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
    return audio;
  } catch { return null; }
}
function closeAudio() {
  try { void audio?.close(); } catch { /* already closed */ }
  audio = null;
}
function tone(c: AudioContext, frequency: number, at: number, length: number) {
  const o = c.createOscillator();
  o.frequency.value = frequency;
  o.connect(c.destination);
  o.start(c.currentTime + at);
  o.stop(c.currentTime + at + length);
}
// P-183: "alarm" (red): three falling notes, told apart from the two equal low tones of yellow (they sounded the same).
function beep(kind: "first" | "ok" | "warn" | "alarm", muted: boolean) {
  if (muted) return;
  const c = audioContext();
  if (!c) return;
  try {
    if (kind === "first") tone(c, 1200, 0, 0.08);
    else if (kind === "ok") tone(c, 1200, 0, 0.12);
    else if (kind === "alarm") { tone(c, 880, 0, 0.1); tone(c, 660, 0.13, 0.1); tone(c, 440, 0.26, 0.2); }
    else { tone(c, 440, 0, 0.12); tone(c, 440, 0.18, 0.12); }
  } catch { /* no audio */ }
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
  const mode = paramMode && (shipmentId || !SHIPMENT_MODES.includes(paramMode)) ? paramMode : MODES[role]?.[0] ?? "";
  const modes = (MODES[role] ?? []).filter((m) => shipmentId || !SHIPMENT_MODES.includes(m));
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const ctrl = React.useRef<ReturnType<typeof startScanner> | null>(null);
  const [engine, setEngine] = React.useState<string | null>(null);
  const [camError, setCamError] = React.useState<string | null>(null);
  const [torch, setTorch] = React.useState<boolean | null>(null);
  const [exposure, setExposure] = React.useState<{ min: number; max: number; step: number } | null>(null);
  // P-165: phase "full" over the whole video, then "band" at its top; hold: until the serial waiting for its product
  // code is dealt with; seq: one more at every message (the tests wait for the message of their reading by it).
  const [flash, setFlash] = React.useState<{ text: string; tone: "ok" | "warn" | "danger"; phase: "full" | "band"; hold: boolean; seq: number } | null>(null);
  // P-157 (D-73): one timer for the message over the video (a new message cancels the old one's); P-165: one for its
  // band, and when the camera may read again (no longer when the message ends).
  const flashTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const bandTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cameraFreeAt = React.useRef(0);
  const flashSeq = React.useRef(0);
  const [muted, setMuted] = React.useState(() => localStorage.getItem("swaptrack.muted") === "1");
  // P-155 (D-72): the code was seen, the phone is still checking it. White, never green: green says "recorded".
  const [decoded, setDecoded] = React.useState<string | null>(null);
  const firstSignalled = React.useRef(false);
  const log = useScanLog(params.get("scanlog") === "1");
  // P-155 (D-72): on a phone held upright the video takes the free height of the first screen (the camera's image is
  // upright too), never less than the 16:9 used elsewhere; the commands stay under it, in the first screen (P-134).
  const videoBox = React.useRef<HTMLDivElement>(null);
  const [videoHeight, setVideoHeight] = React.useState<number | null>(null);
  const [resized, onResize] = React.useReducer((x: number) => x + 1, 0);
  React.useEffect(() => {
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  React.useLayoutEffect(() => {
    const box = videoBox.current;
    if (!box) return;
    if (!window.matchMedia("(orientation: portrait) and (max-width: 767px)").matches) { setVideoHeight(null); return; }
    const free = window.innerHeight - (box.getBoundingClientRect().top + window.scrollY) - BELOW_VIDEO_PX;
    setVideoHeight(Math.round(Math.min(Math.max(free, (box.clientWidth * 9) / 16), window.innerHeight * VIDEO_MAX_SCREEN_SHARE)));
  }); // every render: what sits above the video changes with the mode and the choices (`resized` re-renders on rotation)
  void resized;
  React.useEffect(() => {
    audioContext();
    const wake = () => { audioContext(); };
    document.addEventListener("click", wake);
    document.addEventListener("touchend", wake);
    return () => { document.removeEventListener("click", wake); document.removeEventListener("touchend", wake); closeAudio(); };
  }, []);
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
  const [sorting, setSorting] = React.useState<{ categories: Category[]; rules: SortingRule[]; fromCache?: boolean }>({ categories: [], rules: [] });
  // The sorting rules as loaded: a reading made right after the screen opens waits for them, so its suggestion is
  // never computed on an empty list (P-25).
  const sortingLoad = React.useRef<Promise<{ categories: Category[]; rules: SortingRule[]; fromCache?: boolean }> | null>(null);
  const sortingReady = React.useRef(false);
  // P-98: the last code the camera read (or recorded) and when.
  // P-109: told shows that the user has been told once that this code was already read.
  const cameraLast = React.useRef<{ code: string; at: number; told?: boolean } | null>(null);
  const [materialCodes, setMaterialCodes] = React.useState<string[]>([]);
  const [catalogKnown, setCatalogKnown] = React.useState(false);
  const [models, setModels] = React.useState<Row<Model>[]>([]);
  // P-20 (D-11): readings since this screen was opened (newest first); the mode does not reset it.
  // D-68: key = the same piece read for the same thing (operation, place, shipment, DDT); here = already there, not counted.
  const [session, setSession] = React.useState<{ id: string; code: string; type: string; key: string; at: number; here?: boolean }[]>([]);
  const sessionRef = React.useRef(session);
  sessionRef.current = session;
  // D-68: the judgement of the reading being recorded (set before the windows of model and category, read by record).
  const rereadRef = React.useRef<{ kind: Exclude<Judgement, null>; text: string } | null>(null);
  // Names of the ASP's places and the shipment the screen was opened from, for the judgement and its messages.
  const [places, setPlaces] = React.useState<Row<Location>[]>([]);
  const [shipmentDoc, setShipmentDoc] = React.useState<Record<string, unknown> | null>(null);
  const [today, setToday] = React.useState<MyScan[]>([]);
  // §12.2 / P-24 (D-15): the DDT chosen for an arrival of new material (never pre-selected) and the live comparison.
  const [ddts, setDdts] = React.useState<CachedDdt[]>([]);
  const [ddtId, setDdtId] = React.useState("");
  // P-164: the search in the DDT menu.
  const [ddtQuery, setDdtQuery] = React.useState("");
  const [ddtExpected, setDdtExpected] = React.useState<Array<{ codeRaw: string; codeId: string }>>([]);
  const [ddtTicks, setDdtTicks] = React.useState<Set<string>>(new Set());
  const [ddtUnexpected, setDdtUnexpected] = React.useState<string[]>([]);
  const [modelPick, setModelPick] = React.useState<{ code: string; source: Source; second?: string } | null>(null);
  const [modelPickId, setModelPickId] = React.useState("");
  const [pendingSort, setPendingSort] = React.useState<{ code: string; source: Source; second?: string; suggested: string | null; newOk: boolean } | null>(null);
  // D-66 (P-136c): a reading taken as a new piece while the window of the previous one is open: handled when it closes.
  const afterDialog = React.useRef<{ code: string; source: Source } | null>(null);
  // D-71: the windows open now and the piece of the last reading, read by the late answer of the server (onLateItem).
  const pendingSortRef = React.useRef(pendingSort);
  pendingSortRef.current = pendingSort;
  const modelPickRef = React.useRef(modelPick);
  modelPickRef.current = modelPick;
  const knownFor = React.useRef<{ code: string; it: Record<string, unknown> | null } | null>(null);
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
  // D-49: the photo of a damaged label read by the automatic reading. The codes are proposed, checked, corrected and
  // confirmed by the worker; only then the reading starts, as if typed (source "manual", payload.aiAssisted), and the
  // same photo goes to the photo queue with it.
  const online = useOnline();
  const [aiOn, setAiOn] = React.useState(false);
  React.useEffect(() => watchDoc<{ aiDocumentExtraction?: boolean }>("settings/features", (v) => setAiOn(!!v?.aiDocumentExtraction)), []);
  const labelInput = React.useRef<HTMLInputElement>(null);
  const manualInput = React.useRef<HTMLInputElement>(null);
  const [labelBusy, setLabelBusy] = React.useState(false);
  const [label, setLabel] = React.useState<{ codes: Array<LabelCode & { value: string }>; warnings: string[]; blob: Blob } | null>(null);
  const aiAssist = React.useRef<{ blob: Blob } | null>(null);
  const [photoNum, setPhotoNum] = React.useState<Record<string, number>>({});
  // P-115 (n.5): the setting is settings/photos, where the Settings page saves it (readable by every role).
  const [photoMandatoryDefective, setPhotoMandatoryDefective] = React.useState(false);
  React.useEffect(() => watchDoc<{ mandatoryForDefective?: boolean }>("settings/photos", (v) => setPhotoMandatoryDefective(!!v?.mandatoryForDefective)), []);
  // P-115 (n.23): readings the server refused, shown on their row and said once.
  const [defectivePhotoFor, setDefectivePhotoFor] = React.useState<string | null>(null);
  // P-115 (n.28): opened from a shipment, the screen works at the shipment's place (given in the address), never at
  // the place left in the session.
  React.useEffect(() => { if (claims?.orgId) void loadFieldLocations(claims.orgId).then(({ list }) => setPlaces(list)).catch(() => undefined); }, [claims?.orgId]);
  React.useEffect(() => (shipmentId ? watchDoc<Record<string, unknown>>(`shipments/${shipmentId}`, setShipmentDoc, () => setShipmentDoc(null)) : setShipmentDoc(null)), [shipmentId]);
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
      toast.error(t("scan.refusedToast", { code: r.codeRaw ?? "" }), { ...TOAST_8S, description: t(r.reason === "permission-denied" ? "scan.refusedPermission" : "scan.refusedOther") });
    }
  }), [t]);

  // §12.1 point 4: BOM tick list for the technician scan screen. Direction derived from mode.
  const bomDirection: "remove" | "install" | null = mode === "remove_at_site" ? "remove" : mode === "install_at_site" ? "install" : null;
  const [bom, setBom] = React.useState<{ id: string; number: string | null; expected: Array<{ codeRaw: string; codeId: string }>; createdAtMs: number } | null>(null);
  const [bomLines, setBomLines] = React.useState<Array<Record<string, unknown>> | null>(null);
  const [bomTicks, setBomTicks] = React.useState<Set<string>>(new Set());
  const [bomUnexpected, setBomUnexpected] = React.useState<string[]>([]);

  // P-189: the arrival of a transfer opened from it: its pieces, ticked as they arrive here (this phone's readings at
  // once, offline too; the colleagues' through the server's arrivedAt). Lines from the phone's copy when offline.
  const transferArrival = mode === "arrive_at_warehouse" && !!shipmentId && shipmentDoc?.kind === "transfer";
  const [transferLines, setTransferLines] = React.useState<Array<{ codeRaw: string; codeId: string; arrived: boolean }>>([]);
  React.useEffect(() => {
    if (!transferArrival || !shipmentId) { setTransferLines([]); return; }
    let aborted = false;
    const take = async (rows: Array<Row<ShipmentLine>>) => {
      const out: Array<{ codeRaw: string; codeId: string; arrived: boolean }> = [];
      for (const l of rows) if (l.codeRaw) out.push({ codeRaw: l.codeRaw, codeId: await computeCodeId(l.codeRaw), arrived: !!l.arrivedAt });
      if (!aborted) setTransferLines(out);
    };
    const stop = watchLines(shipmentId, (rows) => void take(rows));
    return () => { aborted = true; stop(); };
  }, [transferArrival, shipmentId]);
  const [transferRead, setTransferRead] = React.useState<{ codeIds: Set<string>; unexpected: string[] }>({ codeIds: new Set(), unexpected: [] });
  React.useEffect(() => {
    if (!transferArrival || !location) { setTransferRead({ codeIds: new Set(), unexpected: [] }); return; }
    const expected = new Set(transferLines.map((l) => l.codeId));
    const relevant = today.filter((s) => !s.voided && s.type === "arrive_at_warehouse" && s.codeRaw && s.locationId === location.id);
    let aborted = false;
    (async () => {
      const codeIds = new Set<string>();
      const unexpected: string[] = [];
      for (const s of relevant) {
        const cid = await computeCodeId(s.codeRaw!);
        if (expected.has(cid)) codeIds.add(cid); else if (s.shipmentId === shipmentId && !unexpected.includes(s.codeRaw!)) unexpected.push(s.codeRaw!);
      }
      if (!aborted) setTransferRead({ codeIds, unexpected });
    })();
    return () => { aborted = true; };
  }, [transferArrival, transferLines, today, location, shipmentId]);

  React.useEffect(() => {
    void listModels().then((m) => { setMaterialCodes(m.map((x) => x.materialCode)); setModels(m); }).catch(() => undefined).finally(() => setCatalogKnown(true));
    const load = loadSorting() as Promise<{ categories: Category[]; rules: SortingRule[]; fromCache?: boolean }>;
    sortingLoad.current = load;
    void load.then((v) => { sortingReady.current = true; setSorting(v); }).catch(() => undefined);
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
    // D-58 A3: a late answer of the server replaces the cache's list.
    const take = (list: CachedDdt[]) => { if (!aborted) setDdts(list); };
    void cachedOpenDdtsForWarehouse(location.id, claims.orgId, take).then(take);
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

  // The serials of the saved documents this screen knows whose line gives the model (modelId or material code), by
  // codeId: every open DDT of the warehouse in "Arrival", the site's BOM lines to remove in "Remove" (the same documents
  // the DDT choice and "BOM list" show; the phone's copy offline). A line without a model still lets the worker pick one.
  const [documentCodeIds, setDocumentCodeIds] = React.useState<Set<string>>(new Set());
  React.useEffect(() => {
    let aborted = false;
    (async () => {
      const ids = new Set<string>();
      type Line = { kind?: string; codeRaw?: string; codeId?: string; direction?: string; modelId?: string | null; materialCode?: string | null };
      const take = async (l: Line) => { if (l.kind === "serial" && l.codeRaw && (l.modelId || l.materialCode)) ids.add(l.codeId || (await computeCodeId(l.codeRaw))); };
      if (mode === "arrive_at_warehouse") for (const d of ddts) for (const raw of d.lines) await take(raw as Line);
      if (mode === "remove_at_site" && bomLines) for (const raw of bomLines) if ((raw as Line).direction === "remove") await take(raw as Line);
      if (!aborted) setDocumentCodeIds(ids);
    })();
    return () => { aborted = true; };
  }, [mode, ddts, bomLines]);

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
    if (!location || !bomDirection || location.type !== "site" || !claims?.orgId) { setBom(null); setBomLines(null); return; }
    let aborted = false;
    // D-58 A3: the server's answer, when it comes after the cache's, replaces it.
    const take = async (b: CachedBom | null) => {
      if (aborted) return;
      setBomLines(b ? b.lines : null);
      if (!b) { setBom(null); return; }
      const expected: Array<{ codeRaw: string; codeId: string }> = [];
      for (const raw of b.lines) {
        const l = raw as { kind?: string; codeRaw?: string; codeId?: string; direction?: string };
        if (l.kind !== "serial" || l.direction !== bomDirection || !l.codeRaw) continue;
        const cid = l.codeId || (await computeCodeId(l.codeRaw));
        expected.push({ codeRaw: l.codeRaw, codeId: cid });
      }
      if (!aborted) setBom({ id: b.id, number: b.number, expected, createdAtMs: b.createdAtMs });
    };
    void cachedBomForSite(location.id, claims.orgId, (b) => void take(b)).then(take);
    return () => { aborted = true; };
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

  // full: how long the message covers the video (the camera reads again then); total: how long it stays, null = until the
  // serial waiting for its product code is dealt with.
  const show = (text: string, tone: "ok" | "warn" | "danger", full: number = tone === "ok" ? FLASH_MS : CAMERA_AFTER_WARNING_MS, total: number | null = tone === "ok" ? FLASH_MS : MESSAGE_MS) => {
    const seq = ++flashSeq.current;
    setFlash({ text, tone, phase: "full", hold: total === null, seq });
    setDecoded(null);
    log.end(tone === "ok" ? "green" : tone === "warn" ? "yellow" : "red");
    // P-155: a reading already signalled when it was seen is not signalled again when it goes well.
    if (tone !== "ok") beep(tone === "danger" ? "alarm" : "warn", muted);
    else if (!firstSignalled.current) {
      beep("ok", muted);
      navigator.vibrate?.(80); // no vibration API on iOS Safari: sound + flash
    }
    // P-157: a warning has said it: the quiet "already read" does not follow it for the same label.
    if (full > FLASH_MS && cameraLast.current) cameraLast.current.told = true;
    clearTimeout(flashTimer.current);
    clearTimeout(bandTimer.current);
    cameraFreeAt.current = Date.now() + full;
    if (total === null || total > full) bandTimer.current = setTimeout(() => setFlash((f) => (f?.seq === seq ? { ...f, phase: "band" } : f)), full);
    if (total !== null) flashTimer.current = setTimeout(() => setFlash((f) => (f?.seq === seq ? null : f)), total);
  };
  const clearFlash = () => { clearTimeout(flashTimer.current); clearTimeout(bandTimer.current); setFlash(null); };
  // P-155 (D-72): as soon as the code is seen, before asking the server about the piece. Only for readings the phone
  // cannot already tell will not be recorded; the outcome (green, yellow, red or a window) comes after.
  const firstSignal = (code: string) => {
    firstSignalled.current = true;
    clearFlash(); // P-165: a new reading takes the band of the one before away
    setDecoded(code);
    beep("first", muted);
    navigator.vibrate?.(40);
    log.mark("first");
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
  // P-170: burst turned on while the camera waits for "Read the next" (which burst hides): the camera reads again at
  // once; before, it stayed paused with no way to restart it but leaving the screen.
  const changeBurst = (on: boolean) => { setBurst(on); if (on && awaitingNext) readNext(); };

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
  // D-66: without the model catalog on the phone a product code cannot be told from a serial: the option is off. While
  // the catalog is still loading the option can be ticked (a reading meanwhile is never taken as a product code).
  const noCatalog = catalogKnown && materialCodes.length === 0;
  const productOn = askProduct && !noCatalog;
  // D-68 case 1: the same piece read for the same thing in this session (until "Undo last" takes it away).
  const readingKey = (code: string) => [normalizeBarcode(code), mode, location?.id ?? "", shipmentId ?? "", ddtApplies ? ddtId : ""].join("|");
  // The place of the screen is always known; the others come from the ASP's list (loaded in the background).
  const placeName = (id: string | null) => { const l = id && id === location?.id ? location : places.find((x) => x.id === id); return l ? `${l.code} · ${l.name}` : t("scan.otherPlace"); };
  // The lists of the pieces this screen expects (ExpectedList): the site's BOM (§12.1, P-175) and the incoming transfer
  // (P-189).
  const bomList: ExpectedListProps | null = bom && bomDirection ? {
    testId: "scan-bom", chip: t("scan.bom.chip", { done: bomTicks.size, total: bom.expected.length }), title: t("scan.bom.title"),
    name: bom.number, subtitle: t(`scan.bom.direction.${bomDirection}`), noLines: t("scan.bom.noLines"),
    lines: bom.expected.map((l) => ({ key: l.codeId, codeRaw: l.codeRaw, done: bomTicks.has(l.codeId) })),
    unexpected: bomUnexpected, unexpectedTitle: t("scan.bom.unexpectedTitle", { count: bomUnexpected.length }),
  } : null;
  const transferDone = transferLines.filter((l) => l.arrived || transferRead.codeIds.has(l.codeId)).length;
  const transferList: ExpectedListProps | null = transferArrival && shipmentDoc ? {
    testId: "scan-transfer", chip: t("scan.transfer.chip", { done: transferDone, total: transferLines.length }), title: t("scan.transfer.title"),
    name: t("scan.transfer.from", { place: placeName((shipmentDoc.fromLocationId as string | undefined) ?? null) }), subtitle: t("scan.transfer.subtitle"),
    noLines: t("scan.transfer.noLines"),
    lines: transferLines.map((l) => ({ key: l.codeId, codeRaw: l.codeRaw, done: l.arrived || transferRead.codeIds.has(l.codeId) })),
    unexpected: transferRead.unexpected, unexpectedTitle: t("scan.transfer.unexpectedTitle", { count: transferRead.unexpected.length }),
  } : null;
  // One list on the video: a site has no transfer arrival.
  const expectedList = bomList ?? transferList;
  // D-68 cases 2 and 3: the reading as the server's state machine would see it, on the piece as the phone knows it.
  const judgeReading = (code: string, it: Record<string, unknown> | null) => {
    rereadRef.current = null;
    const prev = itemState(it);
    if (!prev || !location || !claims?.orgId) return;
    const payload = buildPayload();
    // "Sort" one piece at a time with nothing chosen yet: the category is decided in the window, nothing to judge now.
    if (mode === "classify" && !payload.categoryId && !payload.newClass) return;
    const sh = shipmentDoc;
    if ((mode === "return_ship" || mode === "transfer_out" || shipmentId) && !sh) return; // shipment unknown (no network)
    const shipment = sh ? { id: shipmentId!, kind: sh.kind as "transfer" | "return", fromAspId: sh.fromAspId as string, toAspId: (sh.toAspId as string | null) ?? null, toLocationId: sh.toLocationId as string } : null;
    const kind = judge(prev, { id: "local", type: mode, source: "camera", at: Date.now(), locationId: location.id, locationType: location.type, locationAspId: claims.orgId, aspId: claims.orgId, payload, shipment });
    if (kind === "here") rereadRef.current = { kind, text: t("scan.alreadyHere", { code, place: placeName(prev.currentLocationId), date: formatInstant(new Date(prev.statusSince), i18n.language) }) };
    if (kind === "conflict") rereadRef.current = { kind, text: t("scan.rereadConflict", { code, status: t(`items.statuses.${prev.status}`), place: placeName(prev.currentLocationId) }) };
  };
  const needsCategory = () => mode === "classify" && !newClass && !category && !suggestedRef.current;

  const record = async (code: string, source: Source, second?: string, modelId?: string, choice?: SortChoice) => {
    if (!location || !user || !claims?.orgId) return;
    if (!choice && needsCategory()) { show(t("scan.chooseCategory"), "warn"); return; }
    const payload = buildPayload(choice);
    if (modelId) payload.modelId = modelId;
    if (mode === "return_ship" || mode === "transfer_out") {
      if (!shipmentId) { toast.error(t("errors.shipment_not_found"), TOAST_8S); return; }
    }
    const assisted = source === "manual" ? aiAssist.current : null;
    aiAssist.current = null;
    if (assisted) payload.aiAssisted = true;
    const id = await writeEvent({ type: mode, locationId: location.id, aspId: claims.orgId, userId: user.uid, orgId: claims.orgId, source, engine: source === "camera" ? engine : null, codeRaw: code, secondCodeRaw: second, payload });
    if (assisted) {
      setPhotoNum((m) => ({ ...m, [id]: 1 }));
      void enqueuePhoto(id, claims.orgId, assisted.blob, 1).then(() => { void flushQueue(); }, () => toast.error(t("scan.photoFailed"), TOAST_8S));
    }
    const reread = rereadRef.current;
    rereadRef.current = null;
    setSession((s) => [{ id, code, type: mode, key: readingKey(code), at: Date.now(), here: reread?.kind === "here" }, ...s]);
    setLastEventId(id);
    // §12.2 / P-115 (n.5): a new defective with the setting on asks for its photo until one is queued.
    if (mode === "classify" && payload.newClass === "defective" && photoMandatoryDefective) setDefectivePhotoFor(id);
    if (source === "camera") cameraLast.current = { code, at: Date.now() };
    if (reread) show(reread.text, reread.kind === "here" ? "warn" : "danger");
    else if (sortsOnArrival && !payload.categoryId) show(t("scan.toSortLater", { code }), "warn", FLASH_MS, MESSAGE_MS); else show(code, "ok");
  };

  // P-112: the camera pauses at every decode (webEngine.js) and restarts with the flash of the reading (show). Whatever
  // way a camera reading ends (an error, a refused shipment, a message), it restarts here too; only while the model of
  // an unknown piece is asked it stays paused, and closing that window records the reading (skipModelPick).
  const onCode = async (raw: string, source: Source, again = false) => {
    let r: "asked" | "continue" | void;
    try { r = await handleCode(raw, source, again); }
    catch { cameraLast.current = null; show(t("scan.readingFailed"), "danger"); } // P-155: never a beep and then silence with nothing recorded; P-157: it says "try again", so the label is not "already read"
    finally {
      setDecoded(null);
      firstSignalled.current = false;
      // The second code of a reading (the product code after the serial) is read at once, also without burst mode.
      if (source === "camera" && r! !== "asked") restartCamera(r! === "continue" ? () => ctrl.current?.resume() : afterCameraReading, CAMERA_AFTER_READING_MS);
    }
  };
  const handleCode = async (raw: string, source: Source, again = false): Promise<"asked" | "continue" | void> => {
    const code = raw.trim();
    if (!code) return;
    if (source === "camera" && !again) {
      // P-98: the camera restarts 0.9 s after a reading (burst) and forgets what it read (webEngine.js, frozen). The
      // same code is ignored while it stays in view and for CAMERA_REPEAT_MS after it was last seen or recorded.
      const last = cameraLast.current, now = Date.now();
      const repeat = !!last && last.code === code && now - last.at < CAMERA_REPEAT_MS;
      cameraLast.current = { code, at: now, told: repeat && last!.told };
      if (repeat) {
        // P-109: said once, quietly (no beep, no vibration), not at every frame while the phone stays on the label.
        if (!last!.told) { toast.message(t("scan.alreadyRead"), { ...TOAST_8S, id: "scan-already-read" }); cameraLast.current.told = true; }
        restartCamera(() => ctrl.current?.resume(), 300);
        return;
      }
    }
    log.start(code);
    if (!location || !user || !claims?.orgId) { cameraLast.current = null; show(t("scan.notReady"), "warn"); return; }
    if (pendingSerial) {
      const p = pendingSerial;
      setPendingSerial(null);
      // D-66 (P-136c): the reading after a serial is its product code only if it is a material code of the catalog.
      // Otherwise it is another piece: the serial is recorded without a product code and the new reading starts over
      // (before, a second serial was taken as the product code and that piece was never recorded).
      if (isProductCode(code, materialCodes)) return proceed(p.code, p.source, code);
      toast.warning(t("scan.notProductCode", { code }), { ...TOAST_8S, id: "scan-not-product-code" });
      const r = await proceed(p.code, p.source);
      if (r === "asked") { afterDialog.current = { code, source }; return "asked"; }
      return handleCode(code, source, true);
    }
    if (isProductCode(code, materialCodes)) { show(t("scan.productCode"), "warn"); return; } // §6.3: no event
    // D-68 case 1: certain (this phone, this session): not recorded again, the counter does not move.
    const earlier = sessionRef.current.find((r) => r.key === readingKey(code));
    if (earlier) { show(t("scan.readAgain", { code, time: formatInstant(new Date(earlier.at), i18n.language) }), "warn"); return; }
    if (SHIPMENT_MODES.includes(mode) && !shipmentId) { toast.error(t("errors.shipment_not_found"), TOAST_8S); return; }
    firstSignal(code);
    const waitingSince = Date.now();
    const known = await cachedItemForCode(code, (it) => void onLateItem(code, it), log.usedCopy);
    log.mark("piece");
    knownFor.current = { code, it: known };
    if (suggests) {
      const s = await suggestionFor(known, Math.max(0, READING_WAIT_MS - (Date.now() - waitingSince)));
      log.mark("rules");
      // P-155: the rules came too late for this reading: the open window gets its suggestion when they arrive (D-71).
      if (known && !sortingReady.current) void sortingLoad.current?.then(() => onLateItem(code, known), () => undefined);
      suggestedRef.current = s;
      setSuggested(s);
      setLastPieceBadge(known?.previousFlow === "new" ? "previously_new" : null);
    }
    judgeReading(code, known);
    if (productOn) { setPendingSerial({ code, source }); show(t("scan.nowProductCode"), "warn", FLASH_MS, null); return "continue"; }
    return proceed(code, source);
  };
  // The suggested category of a piece (§10), on the rules as loaded (a reading waits for them, P-25, but not forever:
  // P-155, the wait had no limit and the rules are asked to the server with no limit of their own).
  const suggestionFor = async (it: Record<string, unknown> | null, waitMs = READING_WAIT_MS): Promise<string | null> => {
    if (!it) return null;
    const timeUp = new Promise<null>((ok) => setTimeout(() => ok(null), waitMs));
    const loaded = (await Promise.race([sortingLoad.current?.catch(() => null) ?? null, timeUp])) ?? sorting;
    // Censimento n.24: a rule leading to a category no longer active is skipped (the next rule applies).
    const active = new Set(loaded.categories.filter((c) => c.active).map((c) => c.id));
    return suggestCategory(loaded.rules, { siteId: it.siteOfOrigin as string, modelId: it.modelId as string, equipmentType: it.equipmentType as string }, active);
  };
  // The piece of the last reading as the phone knows it (read once per reading; a late answer replaces it).
  const itemOf = async (code: string) => (knownFor.current?.code === code ? knownFor.current.it : cachedItemForCode(code));
  // D-71 (P-149b): the server's answer that came after the 2 s, while the window of that piece is still open and the
  // worker has not chosen yet. The category window gets its suggestion and the right "Defective / Leftover"; the model
  // window closes if the server knows the piece with its model (recorded without a model picked by hand, and said).
  // Nothing changes once the worker has chosen, nor for a reading already recorded (no late D-68 warning).
  const onLateItem = async (code: string, it: Record<string, unknown> | null) => {
    if (knownFor.current?.code === code) knownFor.current = { code, it };
    const p = pendingSortRef.current;
    if (p && p.code === code) {
      const s = suggests ? await suggestionFor(it) : p.suggested;
      if (pendingSortRef.current !== p) return; // the worker chose meanwhile
      suggestedRef.current = s;
      setSuggested(s);
      setPendingSort({ ...p, suggested: s, newOk: newClassAllowed(it) });
      return;
    }
    const m = modelPickRef.current;
    if (m && m.code === code && it?.modelId) {
      modelPickRef.current = null;
      setModelPick(null); setModelPickId("");
      await record(m.code, m.source, m.second);
      toast.message(t("scan.pieceRecognized"), { ...TOAST_8S, id: "scan-piece-recognized" });
      if (takeNext()) return;
      if (m.source === "camera") restartCamera(afterCameraReading, CAMERA_AFTER_READING_MS);
    }
  };
  // D-66 (P-136c): what every piece goes through once its codes are known, with or without a product code.
  const proceed = async (code: string, source: Source, second?: string): Promise<"asked" | void> => {
    // §10 / P-102: in "Sort" without a fixed category the suggestion is confirmed with one tap, or another one chosen;
    // nothing is recorded until then (the camera waits, as for the model). A fixed category records at once.
    // "Defective" / "Leftover" only where the server accepts them (newClassAllowed): offered in the window, and a fixed
    // "Defective" / "Leftover" on a removed piece records nothing and says why (the server would open an anomaly).
    const newOk = mode === "classify" ? newClassAllowed(await itemOf(code)) : true;
    if (mode === "classify" && !category && !newClass) { log.end("window"); setPendingSort({ code, source, second, suggested: suggestedRef.current, newOk }); return "asked"; }
    if (mode === "classify" && newClass && !newOk) { rereadRef.current = null; show(t("scan.newClassNotForRemoved", { code }), "danger"); return; }
    // §6.4 model pick for unknown pieces: if unknown + warehouse/technician, ask for model (skip is allowed).
    // P-104: a serial line of the chosen DDT is never asked: the server takes its model from the line (expectedCodes);
    // a line without a model leaves the piece "to complete", filled in when the document gets it (§6.4).
    // Extended: neither is a serial whose line in another saved document the phone knows gives the model (any open DDT
    // of this warehouse in "Arrival", the site's BOM in "Remove").
    const asks = mode === "remove_at_site" || mode === "arrive_at_warehouse";
    const cid = asks ? await computeCodeId(code) : null;
    const inDocuments = !!cid && ((ddtApplies && !!ddtId && ddtExpected.some((e) => e.codeId === cid)) || documentCodeIds.has(cid));
    // A product code of the catalog gives the model (the server's findModel): nothing to ask.
    if (asks && !inDocuments && !second && !await itemOf(code)) {
      log.end("window"); setModelPick({ code, source, second }); setModelPickId(""); setModelQuery(""); return "asked";
    }
    await record(code, source, second);
  };
  // The reading waiting behind a window (D-66) goes on when the window closes; it then drives the camera itself.
  const takeNext = () => {
    const n = afterDialog.current;
    afterDialog.current = null;
    if (n) void onCode(n.code, n.source, true);
    return !!n;
  };
  const onCodeRef = React.useRef(onCode);
  onCodeRef.current = onCode;

  // P-157 (D-73): the only way the camera restarts after a reading. One timer at a time, gone with the screen; never
  // under the message over the video (it covers the whole video), and never while a window is open: it waits for it.
  const cameraTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cameraDeferred = React.useRef<(() => void) | null>(null);
  const windowOpen = !!label || !!pendingSort || !!modelPick;
  const windowOpenRef = React.useRef(windowOpen);
  windowOpenRef.current = windowOpen;
  const clearCameraRestart = () => { clearTimeout(cameraTimer.current); cameraDeferred.current = null; };
  const restartCamera = (go: () => void, minMs: number) => {
    clearCameraRestart();
    const afterFlash = cameraFreeAt.current - Date.now() + CAMERA_AFTER_FLASH_MS;
    const longWait = afterFlash > minMs;
    cameraTimer.current = setTimeout(() => {
      // The wait outlasts CAMERA_REPEAT_MS: the label still in view is the same reading, not one more warning.
      if (longWait && cameraLast.current) cameraLast.current.at = Date.now();
      if (windowOpenRef.current) cameraDeferred.current = go; else go();
    }, longWait ? afterFlash : minMs);
  };
  React.useEffect(() => {
    if (!windowOpen && cameraDeferred.current) restartCamera(cameraDeferred.current, CAMERA_AFTER_READING_MS);
  }, [windowOpen]);
  // P-165: "Now read the product code" stays while the serial waits for it, and goes with it.
  React.useEffect(() => { if (!pendingSerial) setFlash((f) => (f?.hold ? null : f)); }, [pendingSerial]);

  // P-163: the back key of the phone (Android) or of the browser, while a window is open or a serial waits for its
  // product code, does what the window's X does (an unknown piece is recorded without a model, "Sort" is cancelled and
  // says so, the serial goes on its way as when another serial comes, D-66) instead of leaving the screen: the reading
  // was lost. While something is open the history has one more step, with the same address; Back takes it away and the
  // screen closes what is open. Closed in another way, the step is taken away by the screen itself. Before the screen is
  // drawn (layout effect): a window is never seen without its step, or a quick Back would be undone by the step.
  // The step and the back key are read from the browser itself (history.state, popstate): React Router hands a change of
  // address to React inside a transition, so the step and a quick Back could reach the screen as no change at all, and
  // the window stayed open with its step gone (seen in the run of lot 11).
  const holding = windowOpen || !!pendingSerial;
  const holdingRef = React.useRef(holding);
  holdingRef.current = holding;
  const navigate = useNavigate();
  const navigateRef = React.useRef(navigate);
  navigateRef.current = navigate;
  const held = React.useRef(false);
  const popping = React.useRef(false);
  const onHoldStep = () => !!(window.history.state as { usr?: { scanHold?: boolean } } | null)?.usr?.scanHold;
  const addHoldStep = () => {
    if (window.location.pathname !== "/scan") return; // the screen is being left: no step on another page
    held.current = true;
    if (!onHoldStep()) navigateRef.current(window.location.pathname + window.location.search, { state: { scanHold: true } });
  };
  const releaseByBack = React.useRef<() => void>(() => undefined);
  releaseByBack.current = () => {
    if (modelPickRef.current) { void skipModelPick(); return; }
    if (pendingSortRef.current) { cancelSort(); return; }
    if (label) { setLabel(null); return; }
    const p = pendingSerial;
    if (p) { setPendingSerial(null); void proceed(p.code, p.source); }
  };
  React.useLayoutEffect(() => {
    if (popping.current) return; // the step is being taken away: the popstate below goes on from there
    if (holding && !held.current) addHoldStep();
    else if (!holding && held.current) {
      held.current = false;
      if (onHoldStep()) { popping.current = true; navigateRef.current(-1); }
    }
  }, [holding]); // eslint-disable-line react-hooks/exhaustive-deps
  React.useEffect(() => {
    const onPop = () => {
      if (popping.current) {
        if (onHoldStep()) return;
        popping.current = false;
        if (holdingRef.current) addHoldStep(); // something was opened while the step was being taken away
        return;
      }
      if (held.current && !onHoldStep()) { held.current = false; releaseByBack.current(); }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    return () => { clearCameraRestart(); c.stop(); };
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
  const readLabel = () => {
    if (!online) { toast.message(t("scan.aiLabelOffline"), { ...TOAST_8S, id: "scan-ai-label-offline" }); manualInput.current?.focus(); return; }
    labelInput.current?.click();
  };
  const onLabelFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setLabelBusy(true);
    try {
      const blob = await compressImage(file).catch(() => { throw Object.assign(new Error("image_unreadable"), { code: "image_unreadable" }); });
      const base64 = await new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(",")[1] ?? ""); r.onerror = () => rej(new Error("read_failed")); r.readAsDataURL(blob); });
      const r = await extractLabelCodes(base64);
      if (!r.codes.length) toast.message(t("scan.aiLabelNone"), TOAST_8S);
      else setLabel({ codes: r.codes.map((c) => ({ ...c, value: c.code })), warnings: r.warnings, blob });
    } catch (err) {
      const code = (err as { code?: string }).code ?? (err as Error).message;
      toast.error(t(`errors.${code}`, { defaultValue: t("errors.unexpected") }), TOAST_8S);
    } finally { setLabelBusy(false); }
  };
  const useLabelCode = (value: string) => {
    const code = value.trim();
    if (!code || !label) return;
    aiAssist.current = { blob: label.blob };
    setLabel(null);
    void onCode(code, "manual");
  };
  const onPhotoFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !lastEventId || !claims?.orgId) return;
    const n = (photoNum[lastEventId] ?? 0) + 1;
    setPhotoNum((m) => ({ ...m, [lastEventId]: n }));
    try {
      await enqueuePhoto(lastEventId, claims.orgId, file, n);
      if (defectivePhotoFor === lastEventId) setDefectivePhotoFor(null);
      toast.success(t("scan.photoQueued"), TOAST_8S);
      void flushQueue();
    } catch {
      toast.error(t("scan.photoFailed"), TOAST_8S);
    }
  };
  // P-102: the tap records the reading with the chosen sorting; cancelling (button, X, a tap outside, the back key)
  // records nothing, says so and lets the camera read again (P-112).
  const confirmSort = async (choice: SortChoice) => {
    const p = pendingSort;
    if (!p) return;
    pendingSortRef.current = null;
    setPendingSort(null);
    await record(p.code, p.source, p.second, undefined, choice);
    if (takeNext()) return;
    if (p.source === "camera") restartCamera(afterCameraReading, CAMERA_AFTER_READING_MS);
  };
  const cancelSort = () => {
    const p = pendingSort;
    if (!p) return;
    pendingSortRef.current = null;
    setPendingSort(null);
    aiAssist.current = null;
    rereadRef.current = null;
    toast.message(t("scan.notSorted", { code: p.code }), { ...TOAST_8S, id: "scan-not-sorted" });
    if (takeNext()) return;
    if (p.source === "camera") restartCamera(afterCameraReading, 300);
  };
  // The piece waiting for its model is taken first, so a double tap (or "Save" and then the X) records it once.
  const confirmModelPick = async () => {
    const p = modelPick;
    if (!p) return;
    modelPickRef.current = null;
    setModelPick(null); setModelPickId("");
    await record(p.code, p.source, p.second, modelPickId || undefined);
    if (takeNext()) return;
    if (p.source === "camera") restartCamera(afterCameraReading, CAMERA_AFTER_READING_MS);
  };
  // D-50 (P-112): closing the window (X, a tap outside, the back key) is "Skip": the reading is recorded without a model
  // (needsModel, "To complete", §6.4) and the camera reads again. A wrong reading has "Undo last".
  const skipModelPick = async () => {
    const p = modelPick;
    if (!p) return;
    modelPickRef.current = null;
    setModelPick(null); setModelPickId("");
    await record(p.code, p.source, p.second);
    if (takeNext()) return;
    if (p.source === "camera") restartCamera(afterCameraReading, CAMERA_AFTER_READING_MS);
  };
  const clearLost = async () => { await dropLost(); setLostCount(0); toast.success(t("scan.lostCleared"), TOAST_8S); };

  if (!location) return <Empty title={t("location.choose")} action={<Button asChild><Link to="/" data-testid="scan-choose-location">{t("location.choose")}</Link></Button>} />;
  const catLabel = (id: string | null) => sorting.categories.find((c) => c.id === id)?.labels[i18n.language as "it" | "en"] ?? "";
  const needPhotoForDefective = photoMandatoryDefective && mode === "classify" && newClass === "defective";
  // "My scans of today": a void is shown on the reading it undid, not as a row of its own.
  const todayRows = today.filter((s) => s.type !== "void");
  const counted = session.filter((s) => !s.here).length;
  const selectedDdt = ddtApplies ? ddts.find((d) => d.id === ddtId) ?? null : null;

  return (
    <div className="space-y-4 max-w-3xl" data-testid="scan-screen">
      {shipmentId && <p className="text-xs text-primary font-mono" data-testid="scan-shipment-id">{t("scan.shipmentLabel")}: {shipmentId.slice(0, 8)}</p>}
      <div className="flex flex-wrap gap-2">
        {/* P-163: back where the user came from (from a direct link: the shipment, or Home). A serial waiting for its product
            code goes on its way first, as when another serial comes (D-66); if that opens a window, the user stays. In the
            row of the operations, not above it: a row more would take its height from the video (P-155). */}
        <BackButton iconOnly className="-ml-2 self-center" fallback={shipmentId ? `/shipments/${shipmentId}` : "/"} onBefore={async () => {
          const p = pendingSerial;
          if (!p) return true;
          setPendingSerial(null);
          return (await proceed(p.code, p.source)) !== "asked";
        }} />
        {modes.map((m) => (
          <Button key={m} variant={m === mode ? "primary" : "secondary"} size="lg" onClick={() => setParams((p) => { p.set("mode", m); return p; }, { replace: true, state: held.current ? { scanHold: true } : null })} data-testid={`scan-mode-${m}`}>{t(`scan.modes.${m}`)}</Button>
        ))}
        {role === "asp_technician" && <Button variant="outline" size="lg" onClick={siteDone} data-testid="scan-site-done">{t("scan.siteDoneButton")}</Button>}
      </div>
      {mode === "arrive_at_warehouse" && (
        <Select aria-label={t("scan.flow")} value={flow} onChange={(e) => changeFlow(e.target.value)} data-testid="scan-flow-select">
          <option value="removed">{t("scan.flowRemoved")}</option><option value="new">{t("scan.flowNew")}</option>
        </Select>
      )}
      {ddtOffered && (
        <div className="space-y-1">
        {/* P-164: the search sits in the row of the menu: a row more would take its height from the video (P-155). */}
        <div className="flex items-center gap-2">
          <Input aria-label={t("scan.ddt.search")} placeholder={t("scan.ddt.search")} value={ddtQuery} onChange={(e) => setDdtQuery(e.target.value)} className="min-w-0 flex-1" data-testid="scan-ddt-search" />
          <Select aria-label={t("scan.ddt.label")} value={ddtId} onChange={(e) => { const v = e.target.value; if (v && flow !== "new") changeFlow("new"); setDdtId(v); }} className="min-w-0 flex-1" data-testid="scan-ddt-select">
            <option value="">{t("scan.ddt.none")}</option>
            {ddtsToShow(ddts, ddtQuery, ddtId).map((d) => <option key={d.id} value={d.id}>{t("scan.ddt.option", { number: d.number, date: d.createdAtMs ? new Date(d.createdAtMs).toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—" })}</option>)}
          </Select>
          {/* §12.2 / P-105: the DDT can also be uploaded from here, as a file or a photo of the paper. */}
          <Link to={`/documents/new?kind=ddt_in&location=${location!.id}`} className="shrink-0 text-sm text-primary hover:underline" data-testid="scan-ddt-upload">{t("scan.ddt.upload")}</Link>
        </div>
        {ddtQuery.trim() && !matchingDdts(ddts, ddtQuery).length && <p className="text-sm text-muted" data-testid="scan-ddt-nomatch">{t("scan.ddt.noMatch", { query: ddtQuery.trim() })}</p>}
        </div>
      )}
      {(mode === "classify" || (mode === "arrive_at_warehouse" && flow === "removed")) && (
        <div className="space-y-2">
          {/* D-58: no categories on this phone yet (never downloaded and no network): said, never an empty list. */}
          {sorting.fromCache && sorting.categories.length === 0 && <p className="text-sm text-warning" data-testid="scan-sorting-missing">{t("scan.sortingMissing")}</p>}
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
      {log.on && (
        <div className="rounded border border-border p-2 text-xs font-mono space-y-1" data-testid="scan-log">
          <p>{t("scan.log.video")}: {videoRef.current?.videoWidth ?? 0}×{videoRef.current?.videoHeight ?? 0} · ms</p>
          {log.rows.map((r) => (
            <p key={r.id} data-testid="scan-log-row">
              {r.code.slice(-8)} · {t("scan.log.first")} {r.first ?? "-"} · {t("scan.log.piece")} {r.piece ?? "-"}{r.copy ? ` (${t("scan.log.copy")})` : ""} · {t("scan.log.rules")} {r.rules ?? "-"} · {r.endKind ? t(`scan.log.${r.endKind}`) : "…"} {r.end ?? ""}
            </p>
          ))}
        </div>
      )}
      <div ref={videoBox} className={cn("relative overflow-hidden rounded-lg border border-border bg-black", videoHeight === null && "aspect-video")} style={videoHeight === null ? undefined : { height: videoHeight }} data-testid="scan-video-box">
        <video ref={videoRef} className="h-full w-full object-cover" playsInline muted data-testid="scan-video" />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
          <div className={cn("w-[80%] h-44 max-h-[60%] border-4 rounded", decoded ? "border-white" : "border-primary")} data-testid="scan-aim" />
        </div>
        {decoded && <p role="status" className="absolute inset-x-[12%] top-1/2 -translate-y-1/2 truncate rounded bg-black/70 px-2 py-1 text-center font-mono font-bold text-white" data-testid="scan-decoded">{t("scan.decoded", { code: decoded })}</p>}
        <span className="absolute left-2 top-2 rounded bg-black/70 px-2 py-0.5 text-xs text-white" data-testid="scan-engine">{engine ? t(`scan.engine.${engine}`) : t("common.loading")}</span>
        {/* P-175: the BOM of the site at the top, on the video (no height taken from it, P-155): a summary that opens the
            list over the video. Hidden while a warning is a band at the top; the message over the whole video covers it.
            P-189: the same for the pieces of an incoming transfer. */}
        {expectedList && <ExpectedChip key={expectedList.testId} p={expectedList} hidden={flash?.phase === "band"} />}
        <p className="absolute bottom-2 left-2 right-2 text-center text-xs text-white bg-black/60 rounded px-2 py-1">{t("scan.photoReminder")}</p>
        {flash && <div className={cn(flash.phase === "full" ? "absolute inset-0 flex items-center justify-center text-2xl p-4" : "absolute inset-x-0 top-0 px-3 py-1 text-sm leading-tight",
          "font-mono font-bold text-center", flash.tone === "ok" ? "bg-success text-black" : flash.tone === "danger" ? "bg-danger text-white" : "bg-warning text-black")}
          role="status" data-testid="scan-flash" data-tone={flash.tone} data-phase={flash.phase} data-seq={flash.seq}>{flash.tone === "ok" ? "✓ " : "! "}{flash.text}</div>}
      </div>
      {/* D-55 / P-121: single reading: the camera waits until the worker asks for the next piece. */}
      {awaitingNext && !burst && <Button size="lg" className="w-full" onClick={readNext} data-testid="scan-next"><Camera className="h-5 w-5" />{t("scan.readNext")}</Button>}
      {/* P-134 (D-62 criterion 6): the commands of every piece right under the camera, in the first screen. */}
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
        <Checkbox id="scan-burst" label={t("scan.burst")} checked={burst} onChange={changeBurst} testId="scan-burst" />
        <div className="basis-full">
          <Checkbox id="scan-product" label={t("scan.askProduct")} checked={productOn} onChange={setAskProduct} disabled={noCatalog} testId="scan-ask-product" />
          {noCatalog
            ? <p className="text-xs text-warning" data-testid="scan-ask-product-nocatalog">{t("scan.askProductNoCatalog")}</p>
            : <p className="text-xs text-muted" data-testid="scan-ask-product-hint">{t("scan.askProductHint")}</p>}
        </div>
      </div>
      {lostCount > 0 && <div className="rounded bg-warning/15 text-warning text-xs p-2 flex gap-2 items-center" data-testid="scan-lost-photos">{t("scan.photosLost", { count: lostCount })} <Button size="sm" variant="ghost" onClick={clearLost} data-testid="scan-lost-clear">{t("common.close")}</Button></div>}
      {/* §7.2 burst mode, P-20 (D-11): counter and running list of this session's readings, below the camera, never over it. */}
      <section className="rounded border border-border p-3" data-testid="scan-session">
        <p className="flex items-baseline gap-2">
          <span className="text-3xl font-bold tabular" data-testid="scan-session-count">{counted}</span>
          <span className="text-sm text-muted">{t("scan.sessionCount", { count: counted })}</span>
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
                  {s.here && <span className="text-warning" data-testid="scan-session-here">{t("scan.alreadyHereRow")}</span>}
                  <span className={cn("ml-auto shrink-0", refused && "text-danger font-semibold")} data-testid={refused ? "scan-session-refused" : undefined}>{refused ? t("scan.refused") : sent ? t("scan.sent") : t("scan.waiting")}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      {selectedDdt && (
        <details className="rounded border border-border px-3" data-testid="scan-ddt-section">
          <summary className="flex cursor-pointer list-none items-center gap-2 min-h-touch font-semibold [&::-webkit-details-marker]:hidden" data-testid="scan-ddt-toggle">{t("scan.ddt.title", { number: selectedDdt.number })} · <span className="tabular" data-testid="scan-ddt-progress">{ddtTicks.size}/{ddtExpected.length}</span><ChevronDown className="ml-auto h-5 w-5" aria-hidden /></summary>
          <div className="pb-3">
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
          </div>
        </details>
      )}
      {camError && <p role="alert" className="text-danger text-sm" data-testid="scan-camera-error">{t(`scan.errors.${camError}`)}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void onCode(wedge, "wedge"); setWedge(""); }}>
        <Input inputMode="none" autoFocus aria-label={t("scan.wedge")} placeholder={t("scan.wedge")} value={wedge} onChange={(e) => setWedge(e.target.value)} data-testid="scan-wedge-input" className="font-mono" />
      </form>
      {/* P-134 (D-62 criteria 8, 9): one place when the code cannot be read. Without network the label photo is not
          offered (D-49): the digits remain. */}
      <section className="space-y-2" data-testid="scan-cannot-read">
        <h2 className="text-sm font-semibold">{t("scan.cannotRead")}</h2>
        {aiOn && online && (
          <>
            <Button variant="secondary" className="w-full" onClick={readLabel} disabled={labelBusy} data-testid="scan-ai-label"><Sparkles className="h-5 w-5" /> {labelBusy ? t("scan.aiLabelReading") : t("scan.aiLabel")}</Button>
            <input ref={labelInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onLabelFile(e)} data-testid="scan-ai-label-input" />
            <p className="text-center text-sm text-muted" data-testid="scan-cannot-read-or">{t("scan.cannotReadOr")}</p>
          </>
        )}
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void onCode(manual, "manual"); setManual(""); }}>
          <Input ref={manualInput} inputMode="text" aria-label={t("scan.manual")} placeholder={t("scan.manual")} value={manual} onChange={(e) => setManual(e.target.value)} data-testid="scan-manual-input" className="font-mono" />
          <Button type="submit" data-testid="scan-manual-submit">{t("common.confirm")}</Button>
        </form>
      </section>
      <details className="rounded border border-border px-3" data-testid="scan-today-section">
        <summary className="flex cursor-pointer list-none items-center gap-2 min-h-touch font-semibold [&::-webkit-details-marker]:hidden" data-testid="scan-today-toggle">{t("scan.today")} · <span className="tabular" data-testid="scan-today-count">{todayRows.length}</span><ChevronDown className="ml-auto h-5 w-5" aria-hidden /></summary>
        <div className="pb-3">
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
        </div>
      </details>

      {/* P-185: the BOM is called by its number (it showed the document id). */}
      {bomList && <ExpectedSection p={bomList} />}
      {transferList && <ExpectedSection p={transferList} />}

      <Dialog open={!!label} onOpenChange={(o) => { if (!o) setLabel(null); }}>
        <DialogContent title={t("scan.aiLabelTitle")} description={t("scan.aiLabelHint")}>
          <ul className="space-y-3" data-testid="scan-ai-label-codes">
            {label?.codes.map((c, i) => (
              <li key={i} className="space-y-1">
                {/* The doubtful characters are underlined and coloured: nothing to translate. */}
                <p className="font-mono text-lg" data-testid={`scan-ai-label-code-${i}`}>
                  {[...c.code].map((ch, k) => <span key={k} className={c.uncertainAt.includes(k) ? "text-warning underline decoration-2 font-bold" : undefined} data-uncertain={c.uncertainAt.includes(k) || undefined}>{ch}</span>)}
                </p>
                <div className="flex gap-2">
                  <Input value={c.value} onChange={(e) => setLabel((l) => l && { ...l, codes: l.codes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) })} className="font-mono" aria-label={t("scan.manual")} data-testid={`scan-ai-label-input-${i}`} />
                  <Button onClick={() => useLabelCode(c.value)} disabled={!c.value.trim()} data-testid={`scan-ai-label-use-${i}`}>{t("common.confirm")}</Button>
                </div>
              </li>
            ))}
          </ul>
          {label && label.warnings.length > 0 && <ul className="text-sm text-warning list-disc pl-5">{label.warnings.map((w) => <li key={w}>{t(`scan.aiLabelWarn.${w}`, { defaultValue: t("documents.aiWarnings") })}</li>)}</ul>}
          <div className="flex justify-end"><Button variant="ghost" onClick={() => setLabel(null)} data-testid="scan-ai-label-cancel">{t("common.cancel")}</Button></div>
        </DialogContent>
      </Dialog>

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
              {pendingSort?.newOk && (
                <>
                  <li><Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => void confirmSort({ newClass: "defective" })} data-testid="scan-sort-defective">{t("scan.defective")}</Button></li>
                  <li><Button type="button" variant="secondary" size="lg" className="w-full" onClick={() => void confirmSort({ newClass: "leftover" })} data-testid="scan-sort-leftover">{t("scan.leftover")}</Button></li>
                </>
              )}
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
