// The only module that initialises Firebase (R2). Configuration only from VITE_FIREBASE_* (DECISIONS c7).
import { initializeApp } from "firebase/app";
import {
  initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator,
} from "firebase/auth";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager, terminate, clearIndexedDbPersistence,
} from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getStorage, connectStorageEmulator } from "firebase/storage";
import { initializeAppCheck, ReCaptchaEnterpriseProvider } from "firebase/app-check";

const env = import.meta.env;
const required = ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"] as const;
for (const k of required) {
  if (!env[`VITE_FIREBASE_${k}`]) throw new Error(`Missing VITE_FIREBASE_${k}: see .env.example`);
}

export const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
});

// Development only: emulators reached through the Vite dev server on the same origin (vite.config.ts proxy).
const useEmulators = env.DEV && env.VITE_USE_EMULATORS === "true";
const https = location.protocol === "https:";

// §4.17: App Check in monitoring mode, only when a site key is configured.
if (env.VITE_APPCHECK_SITE_KEY && !useEmulators) {
  initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(env.VITE_APPCHECK_SITE_KEY), isTokenAutoRefreshEnabled: true });
}

export const auth = initializeAuth(app, {
  persistence: [indexedDBLocalPersistence, browserLocalPersistence],
  popupRedirectResolver: browserPopupRedirectResolver,
});

// §16: persistent cache with the multi-tab manager. Events written offline are queued by Firestore.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  ...(useEmulators ? { host: location.host, ssl: https } : {}),
});

export const functions = useEmulators ? getFunctions(app, `${location.origin}/__functions`) : getFunctions(app, "europe-west1");
export const storage = getStorage(app);

if (useEmulators) {
  connectAuthEmulator(auth, location.origin, { disableWarnings: true });
  connectStorageEmulator(storage, location.hostname, Number(location.port || (https ? 443 : 80)));
  (storage as unknown as { _protocol: string })._protocol = https ? "https" : "http";
}

export const APP_VERSION: string = __APP_VERSION__;

// §4.12: clears the local Firestore cache. Fails if other tabs keep it open ("other_tabs": fail closed).
export async function clearFirestoreCache(): Promise<void> {
  await terminate(db);
  try {
    await clearIndexedDbPersistence(db);
  } catch (e) {
    if ((e as { code?: string }).code === "failed-precondition") throw new Error("other_tabs");
    throw e;
  }
}
