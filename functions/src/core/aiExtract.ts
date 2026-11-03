// D-45 / D-46 / D-49: automatic reading of documents and labels with Gemini on Vertex AI.
// - Only the EU multi-region endpoint (R12, D-46: data processed in EU member states only), never "global".
// - Behind settings/features.aiDocumentExtraction (off by default) and a daily limit per user (aiDailyLimit).
// - The service account of the functions authenticates: no API key, no secret.
// - On the emulators and in the tests (demo-* projects) a fixed fake answer is used: no network, no Gemini.
// - Logs never contain the content of a document or a label.
import { GoogleGenAI, ThinkingLevel, type Part } from "@google/genai";
import { FieldValue } from "firebase-admin/firestore";
import { db } from "./admin";
import { fail } from "./errors";
import { getSettings } from "./settings";
import { logger } from "firebase-functions/v2";

export const AI_MODEL = "gemini-3.8-flash";
export const AI_LOCATION = "eu";
export const AI_BASE_URL = "https://aiplatform.eu.rep.googleapis.com/";
const AI_TIMEOUT_MS = 90_000;

export interface AiRequest { parts: Part[]; instruction: string; schema: object; purpose: "document" | "label" }
export type AiModel = (r: AiRequest) => Promise<unknown>;

const projectId = () => process.env.GCLOUD_PROJECT ?? JSON.parse(process.env.FIREBASE_CONFIG ?? "{}").projectId ?? "";
export const usesFakeModel = () => process.env.FUNCTIONS_EMULATOR === "true" || projectId().startsWith("demo-");

type Log = (message: string, data: Record<string, unknown>) => void;

// The real model. `test` lets a test check the request and the log without network and without credentials.
// Every call writes one log line ("ai_call" or "ai_call_failed"): time, tokens or the error of Vertex AI, so the
// first calls online can be checked and their cost estimated (P-124 procedure). Never the request or the answer.
export function geminiModel(project: string, test?: { fetch: typeof fetch; authClient: unknown; log?: Log }): AiModel {
  const info: Log = test?.log ?? ((m, d) => logger.info(m, d)), warn: Log = test?.log ?? ((m, d) => logger.warn(m, d));
  const ai = new GoogleGenAI({
    vertexai: true, project, location: AI_LOCATION,
    httpOptions: { baseUrl: AI_BASE_URL, apiVersion: "v1", timeout: AI_TIMEOUT_MS, ...(test ? { fetch: test.fetch } : {}) },
    ...(test ? { googleAuthOptions: { authClient: test.authClient as never } } : {}),
  });
  return async (r) => {
    const started = Date.now();
    const res = await ai.models.generateContent({
      model: AI_MODEL,
      contents: [{ role: "user", parts: r.parts }],
      config: {
        systemInstruction: r.instruction,
        responseMimeType: "application/json",
        responseSchema: r.schema,
        temperature: 0,
        thinkingConfig: { thinkingLevel: ThinkingLevel.LOW }, // the lowest level gemini-3.8-flash accepts
      },
    }).catch((e: { status?: number; message?: string; name?: string }) => {
      warn("ai_call_failed", { purpose: r.purpose, model: AI_MODEL, location: AI_LOCATION, ms: Date.now() - started, status: e?.status ?? null, error: String(e?.message ?? e?.name ?? "error").slice(0, 300) });
      throw e;
    });
    const u = res.usageMetadata;
    info("ai_call", { purpose: r.purpose, model: AI_MODEL, location: AI_LOCATION, ms: Date.now() - started,
      promptTokens: u?.promptTokenCount ?? null, outputTokens: u?.candidatesTokenCount ?? null, thoughtsTokens: u?.thoughtsTokenCount ?? null });
    return JSON.parse(res.text ?? "null");
  };
}

// Fixed answers on the emulators and in the tests (agreed with o3 for the e2e tests). Labels: D-49, extractLabel.
export const FAKE_DOCUMENT_ANSWER = (purpose: string, bom: boolean) => purpose === "label"
  ? { codes: [{ code: "AI-LABEL-0001", uncertainAt: [] }, { code: "AI-LABEL-0O01", uncertainAt: [10] }] }
  : { lines: [{ kind: "serial", codeRaw: "AI-DEMO-0001", ...(bom ? { direction: "remove" } : {}) }, { kind: "serial", codeRaw: "AI-DEMO-0002", ...(bom ? { direction: "install" } : {}) }] };

let override: AiModel | null = null;
// Tests only: answers of a model chosen by the test (for example a malformed one).
export const setModelForTests = (m: AiModel | null) => { override = m; };

// Checks the switch, counts the reading against the user's daily limit, then asks the model. Any failure of the
// model is "ai_unavailable" (never "unavailable": the app reads that as offline).
export async function askModel(uid: string, r: AiRequest, bom = false): Promise<{ answer: unknown; fake: boolean }> {
  const features = await getSettings("features");
  if (!features.aiDocumentExtraction) fail("failed-precondition", "feature_disabled");
  await countDailyUse(uid, features.aiDailyLimit);
  if (!override && usesFakeModel()) return { answer: FAKE_DOCUMENT_ANSWER(r.purpose, bom), fake: true };
  try {
    return { answer: await (override ?? geminiModel(projectId()))(r), fake: false };
  } catch (e) {
    // Only the kind of error, never the request or the answer.
    logger.warn("ai_unavailable", { purpose: r.purpose, error: (e as Error)?.name ?? "error" });
    fail("failed-precondition", "ai_unavailable");
  }
  return { answer: null, fake: false }; // unreachable: fail throws
}

// One counter per user per day (UTC), shared by documents and labels (D-49). A reading counts when it is asked,
// also if the model then fails: the limit protects the cost.
async function countDailyUse(uid: string, limit: number): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const ref = db.collection("rateLimits").doc(`ai_${uid}_${day}`);
  const used = await db.runTransaction(async (tx) => {
    const n = ((await tx.get(ref)).get("count") as number | undefined ?? 0) + 1;
    if (n <= limit) tx.set(ref, { count: n, expiresAt: new Date(Date.parse(day) + 2 * 86_400_000), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return n;
  });
  if (used > limit) fail("resource-exhausted", "ai_daily_limit");
}
