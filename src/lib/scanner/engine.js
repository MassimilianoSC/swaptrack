/**
 * ScannerEngine: the only entry point screens use to read barcodes with the camera.
 *
 * Today there is one implementation, the web engine (./webEngine.js). When the
 * app is wrapped as a native store app (Capacitor), a native implementation
 * (ML Kit on Android, ML Kit or Apple Vision on iOS) will be added here, chosen
 * at runtime, with the SAME contract. Screens must never import webEngine.js
 * directly.
 *
 * Contract:
 *   startScanner({ videoEl, onDecode(text, engine), onError(code),
 *                  onTorch(available), onEngine(name), onExposure(range) })
 *   returns { stop(), pause(), resume(), setTorch(on), setExposure(value), getEngine() }
 *
 *   engine names: "native" | "fallback" (web), later "native-app".
 *   error codes:  "camera_denied" | "engine_unavailable".
 *
 * Keyboard-wedge readers (handheld guns, Bluetooth ring scanners, rugged phones
 * with a built-in reader) do NOT go through this engine: they type the code
 * followed by Enter into a focused input, available on every scanning screen.
 */
import { startWebScanner } from "./webEngine.js";

export function startScanner(options) {
  return startWebScanner(options);
}
