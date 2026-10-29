// Isolated, disabled extension point for automatic reading of documents (§11.2, §20).
export async function extractLines(): Promise<{ available: false; reason: "not_available" }> {
  return { available: false, reason: "not_available" };
}
