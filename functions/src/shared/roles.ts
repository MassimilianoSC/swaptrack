// Roles and pure permission helpers (SPEC §3). No Firebase imports (R19).
export const CLIENT_ROLES = ["client_admin", "client_office", "client_warehouse"] as const;
export const ASP_ROLES = ["asp_admin", "asp_warehouse", "asp_technician"] as const;
export const ROLES = [...CLIENT_ROLES, ...ASP_ROLES] as const;
export type Role = (typeof ROLES)[number];
export type OrgType = "client" | "asp";
export const LANGUAGES = ["it", "en"] as const;
export type Language = (typeof LANGUAGES)[number];

export const isClientRole = (r: string): boolean => (CLIENT_ROLES as readonly string[]).includes(r);
export const isAspRole = (r: string): boolean => (ASP_ROLES as readonly string[]).includes(r);
export const isAdminRole = (r: string): boolean => r === "client_admin" || r === "asp_admin";

export function roleFitsOrg(role: string, orgType: OrgType): boolean {
  return orgType === "client" ? isClientRole(role) : isAspRole(role);
}

// §3.3 "Manage users": client_admin everyone; asp_admin only warehouse/technician of own ASP.
export function canManageUser(
  actor: { role: string; orgId: string },
  target: { role: string; orgId: string },
): boolean {
  if (actor.role === "client_admin") return true;
  if (actor.role === "asp_admin") {
    return actor.orgId === target.orgId && (target.role === "asp_warehouse" || target.role === "asp_technician");
  }
  return false;
}

// Event types a role may create directly (§3.3, §8.1). Mirrored in firestore.rules.
export const EVENT_TYPES_BY_ROLE: Record<string, readonly string[]> = {
  asp_admin: ["arrive_at_warehouse", "classify", "transfer_out", "return_ship", "relabel", "void"],
  asp_warehouse: ["arrive_at_warehouse", "classify", "transfer_out", "return_ship", "relabel", "void"],
  asp_technician: ["remove_at_site", "install_at_site", "site_done", "relabel", "void"],
};

// Shell chosen by width, not role, except technicians (§12.2, §15).
export function shellFor(role: string, narrow: boolean): "field" | "desk" {
  if (role === "asp_technician") return "field";
  if (isAspRole(role) && narrow) return "field";
  return "desk";
}
