// Reads the organization language (SPEC §3.1, set via setLanguage). "it" / "en", default "it" when missing.
import { db } from "./admin";
import { Lang } from "../shared/reportStrings";

const CLIENT_ORG_ID = "org_client";

export async function getOrgLanguage(scope: string): Promise<Lang> {
  const orgId = scope === "client" ? CLIENT_ORG_ID : scope;
  const org = await db.collection("organizations").doc(orgId).get();
  const raw = org.exists ? (org.get("language") as string | null | undefined) : null;
  return raw === "en" ? "en" : "it";
}
