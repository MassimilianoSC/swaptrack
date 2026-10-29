import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import { getStorage } from "firebase-admin/storage";

if (!getApps().length) initializeApp();

export const db = getFirestore();
export const auth = getAuth();
export const bucket = () => getStorage().bucket();
export const REGION = "europe-west1";
export const isEmulator = process.env.FUNCTIONS_EMULATOR === "true";
