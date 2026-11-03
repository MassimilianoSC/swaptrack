// Automatic reading of a document's photos and PDFs (§11.2 extension point; D-45, D-46): the server's extractDocument
// proposes lines, the page shows them as lines to confirm (the same boxes as typed or Excel lines) and nothing is
// saved without "Save". Off unless settings/features.aiDocumentExtraction is on; the server checks it again.
import { call } from "@/lib/data/call";
import type { DocLine } from "./lines";

export interface Extraction { lines: DocLine[]; warnings: string[]; pages: number }

// Warnings meant for the tests only, never shown to the user.
const SILENT_WARNINGS = new Set(["demo_extraction"]);

export async function extractLines(documentId: string): Promise<Extraction> {
  const r = await call<Extraction>("extractDocument", { documentId });
  return { ...r, warnings: (r.warnings ?? []).filter((w) => !SILENT_WARNINGS.has(w)) };
}
