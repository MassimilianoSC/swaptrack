/**
 * Web barcode scanning engine.
 *
 * DO NOT REWRITE THE LOGIC. Copied from a system used in the field for months;
 * every guard below exists because its absence caused a real failure.
 *
 * This is the WEB implementation of the ScannerEngine interface (see
 * ./engine.js). A future native implementation (Capacitor + ML Kit / Apple
 * Vision) will implement the same interface, so screens never depend on this
 * file directly.
 *
 * Strategy:
 *   - NATIVE BarcodeDetector where it exists and supports formats
 *     (Android/Chrome via Google Play Services = ML Kit): the best engine on 1D
 *     codes, nothing to download.
 *   - zxing-wasm ponyfill where it is missing (iOS Safari and every iOS browser,
 *     Android without Play Services): the .wasm file is served from OUR domain
 *     (see scripts/copy-wasm.mjs) and precached, so scanning works offline.
 *
 * The fallback is NOT silent: onEngine reports which engine is running, at
 * START, not at the first decode. It matters most when reading FAILS: a test on
 * one phone must not hide that another model runs the weak engine.
 */

const FORMATS = [
  "code_128", "code_39", "code_93",
  "ean_13", "ean_8", "upc_a", "upc_e",
  "itf", "codabar",
  "qr_code", "data_matrix", "pdf417", "aztec",
];

// Identical consecutive decodes required to accept a reading.
// A code read WRONG is worse than a code not read: it creates a phantom item.
const REQUIRED_CONFIRMATIONS = 2;

const FPS = 10;

let detectorPromise = null;

async function createDetector() {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats();
      const usable = FORMATS.filter((f) => supported.includes(f));
      // Chrome desktop on Linux exposes the API with ZERO formats. Deciding on
      // the mere existence of window.BarcodeDetector (as the auto-polyfill does)
      // would pick a useless native detector: decide on the formats.
      if (usable.length > 0) {
        return { detector: new window.BarcodeDetector({ formats: usable }), engine: "native" };
      }
    } catch {
      // fall through to the ponyfill
    }
  }

  const { BarcodeDetector, prepareZXingModule } = await import("barcode-detector/ponyfill");
  // The wasm from our domain, not from the CDN: otherwise the scanner is dead on
  // first use offline, which is exactly the field situation.
  prepareZXingModule({
    overrides: {
      locateFile: (path, prefix) =>
        path.endsWith(".wasm") ? `${import.meta.env.BASE_URL}zxing_reader.wasm` : prefix + path,
    },
  });
  return { detector: new BarcodeDetector({ formats: FORMATS }), engine: "fallback" };
}

function sharedDetector() {
  if (!detectorPromise) {
    detectorPromise = createDetector();
    // Without this, a failure (chunk not downloadable on first use offline)
    // would stay cached as a rejected promise FOREVER: every later attempt would
    // reuse the failure even with the network back, until a reload.
    detectorPromise.catch(() => { detectorPromise = null; });
  }
  return detectorPromise;
}

/**
 * Picks the result closest to the centre of the frame.
 *
 *  - The aiming frame on screen says "aim here", but the detector reads the
 *    WHOLE frame. Without this choice the aiming frame would be a lie, and with
 *    two labels side by side the wrong piece would be recorded with full
 *    confidence.
 *  - It also makes the multi-frame confirmation stable (see below).
 */
function closestToCentre(results, videoEl) {
  const cx = (videoEl.videoWidth || 0) / 2;
  const cy = (videoEl.videoHeight || 0) / 2;
  let chosen = results[0];
  let minD = Infinity;
  for (const r of results) {
    const b = r.boundingBox;
    if (!b) continue;
    const dx = b.x + b.width / 2 - cx;
    const dy = b.y + b.height / 2 - cy;
    const d = dx * dx + dy * dy;
    if (d < minD) { minD = d; chosen = r; }
  }
  return chosen;
}

/**
 * Starts the camera and the scanning loop.
 *
 * SYNCHRONOUS on purpose: it returns the controller immediately and does the
 * async work inside. If it were async, the caller would get `stop` only after
 * resolution, and unmounting the screen while waiting for camera permission
 * would leave the camera on with nobody to stop it.
 *
 * Errors are reported as CODES (onError(code)); the screen translates them:
 *   "camera_denied"       camera permission denied or no camera
 *   "engine_unavailable"  the decoding engine could not be loaded
 *
 * @returns {{ stop, pause, resume, setTorch, setExposure, getEngine }}
 */
export function startWebScanner({ videoEl, onDecode, onError, onTorch, onEngine, onExposure }) {
  let stream = null;
  let track = null;
  let timer = null;
  let stopped = false;
  let engine = null;
  let lastText = null;
  let confirmations = 0;
  let inDetect = false;
  let started = false;
  let detector = null;
  let tick = () => {};

  // PAUSE is not STOP: pause stops only the reading loop and keeps the camera
  // alive, so burst scanning does not reopen the camera for every piece.
  const pause = () => {
    if (timer) { clearInterval(timer); timer = null; }
  };

  const resume = () => {
    if (stopped || timer || !started) return;
    lastText = null;
    confirmations = 0;
    timer = setInterval(tick, Math.round(1000 / FPS));
  };

  const stop = () => {
    stopped = true;
    pause();
    try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
    try { if (videoEl) { videoEl.srcObject = null; videoEl.pause(); } } catch {}
  };

  const setTorch = async (on) => {
    if (!track) return false;
    try { await track.applyConstraints({ advanced: [{ torch: on }] }); return true; }
    catch { return false; }
  };

  // The opposite problem of the torch: in direct sun a glossy label reflects and
  // auto-exposure AVERAGES on the bright scene. A NEGATIVE compensation recovers
  // contrast in the highlights. Spotty support: gated on getCapabilities, never
  // a blocker.
  const setExposure = async (value) => {
    if (!track) return false;
    try { await track.applyConstraints({ advanced: [{ exposureCompensation: value }] }); return true; }
    catch { return false; }
  };

  (async () => {
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          // High resolution: a dense 1D code does not lock on a grainy frame, and
          // some phones default low. These are `ideal`, never fatal.
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: "continuous",
        },
        audio: false,
      });
    } catch {
      onError?.("camera_denied");
      return;
    }

    if (stopped) { stop(); return; }

    videoEl.srcObject = stream;
    videoEl.setAttribute("playsinline", "true"); // iOS: without it, video goes full screen
    videoEl.muted = true;
    try { await videoEl.play(); } catch {}

    try {
      ({ detector, engine } = await sharedDetector());
    } catch {
      // Without this catch the function would reject with the stream ALREADY
      // open: camera on, no decoding, no error, and manual entry, which exists
      // exactly for this case, never offered.
      stop();
      onError?.("engine_unavailable");
      return;
    }

    if (stopped) { stop(); return; }

    onEngine?.(engine);

    track = stream.getVideoTracks()[0];

    // Capabilities are populated LATE on many Android phones: reading them
    // immediately hides the torch button on devices where it works.
    const checkCapabilities = () => {
      if (stopped) return;
      const caps = track?.getCapabilities?.() || {};
      if ("torch" in caps) onTorch?.(true);
      if (caps.exposureCompensation) onExposure?.(caps.exposureCompensation);
    };
    checkCapabilities();
    setTimeout(checkCapabilities, 600);

    tick = async () => {
      // setInterval does not wait for an async callback: without this guard, on
      // a slow phone with the fallback (detect at 1080p = 100-300 ms) 2-3
      // concurrent detects would pile up on the same frame.
      if (stopped || inDetect || videoEl.readyState < 2) return;
      inDetect = true;
      try {
        const results = await detector.detect(videoEl);
        if (stopped || !results?.length) return;

        // If one result confirms the current candidate, it wins: with two labels
        // in the frame the order can alternate at every tick, resetting the
        // counter forever without ever locking.
        const confirming = lastText && results.find((r) => r.rawValue === lastText);
        const chosen = confirming || closestToCentre(results, videoEl);
        const text = chosen?.rawValue;
        if (!text) return;

        if (text === lastText) confirmations += 1;
        else { lastText = text; confirmations = 1; }
        if (confirmations < REQUIRED_CONFIRMATIONS) return;

        // PAUSE, not stop: the caller decides whether to resume (burst mode) or
        // leave the scanner.
        pause();
        onDecode?.(text, engine);
      } catch {
        // frame not decodable: normal, try again
      } finally {
        inDetect = false;
      }
    };

    started = true;
    timer = setInterval(tick, Math.round(1000 / FPS));
  })();

  return { stop, pause, resume, setTorch, setExposure, getEngine: () => engine };
}
