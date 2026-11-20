// SPEC §11.2: the lines of a document as saveDocument accepts them. A serial line (codeRaw; material code or model
// optional) or a quantity line (material code or model, and quantity). P-223 (tester): a line with the quantity only
// is refused (line_without_code): before, the schema let a quantity line through without any code, which no reading
// could ever count. Pure (zod only), so a unit test reads it without loading the router.
import { z } from "zod";

const hasText = (v: string | null | undefined) => typeof v === "string" && v.trim().length > 0;

export const serialLineSchema = z.object({
  kind: z.literal("serial"), codeRaw: z.string().trim().min(1).max(300), codeId: z.string().optional(),
  materialCode: z.string().optional().nullable(), modelId: z.string().optional().nullable(), direction: z.enum(["remove", "install"]).optional(),
});
export const quantityLineSchema = z.object({
  kind: z.literal("quantity"), materialCode: z.string().optional().nullable(), modelId: z.string().optional().nullable(),
  quantity: z.number().int().min(1).max(100000), direction: z.enum(["remove", "install"]).optional(),
});
export const lineSchema = z.union([serialLineSchema, quantityLineSchema]);
export type InputLine = z.infer<typeof lineSchema>;

// The first line with the quantity only (no material code, no model), or -1: saveDocument refuses the document with
// line_without_code, before writing anything.
export function quantityOnlyLine(lines: InputLine[]): number {
  return lines.findIndex((l) => l.kind === "quantity" && !hasText(l.materialCode) && !hasText(l.modelId));
}
