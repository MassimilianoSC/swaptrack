import type { LucideIcon } from "lucide-react";
import { Home, Building2, Users, MapPin, Boxes, Settings, ScrollText, BookOpen, Tags, Package, Truck, ClipboardList, FileText, Bell, AlertTriangle, LayoutDashboard, FileSpreadsheet } from "lucide-react";

// P-222 (tester): the menu in areas. "home" is the Home alone, on top, never with a title.
export type NavArea = "home" | "dashboard" | "operations" | "documents" | "check" | "reports" | "registry" | "config" | "guide";
export interface NavItem { to: string; label: string; icon: LucideIcon; roles: readonly string[]; area: NavArea }

const ALL = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse", "asp_technician"];
const DESK_ALL = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"];
const SHIP_ROLES = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"];
const DASHBOARD = ["client_admin", "client_office", "asp_admin"];

// Sections of each role (§12, §15), in the order of their areas.
export const NAV: NavItem[] = [
  { to: "/", label: "nav.home", icon: Home, roles: ALL, area: "home" },
  { to: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard, roles: DASHBOARD, area: "dashboard" },
  { to: "/items", label: "nav.items", icon: Package, roles: DESK_ALL, area: "operations" },
  { to: "/items/to-complete", label: "nav.toComplete", icon: ClipboardList, roles: ["client_admin", "client_office", "asp_admin", "asp_warehouse"], area: "operations" },
  { to: "/shipments", label: "nav.shipments", icon: Truck, roles: SHIP_ROLES, area: "operations" },
  { to: "/documents", label: "nav.documents", icon: FileText, roles: DESK_ALL, area: "documents" },
  { to: "/alerts", label: "nav.alerts", icon: Bell, roles: DESK_ALL, area: "check" },
  { to: "/anomalies", label: "nav.anomalies", icon: AlertTriangle, roles: ["client_admin", "client_office", "asp_admin", "asp_warehouse"], area: "check" },
  // P-190: exports and monthly reports in one page with two tabs (/reports opens the second one).
  { to: "/exports", label: "nav.exportsReports", icon: FileSpreadsheet, roles: ["client_admin", "client_office", "asp_admin"], area: "reports" },
  { to: "/admin/organizations", label: "nav.organizations", icon: Building2, roles: ["client_admin"], area: "registry" },
  { to: "/admin/users", label: "nav.users", icon: Users, roles: ["client_admin"], area: "registry" },
  { to: "/people", label: "nav.people", icon: Users, roles: ["asp_admin"], area: "registry" },
  { to: "/admin/locations", label: "nav.locations", icon: MapPin, roles: ["client_admin"], area: "registry" },
  { to: "/admin/models", label: "nav.models", icon: Boxes, roles: ["client_admin"], area: "registry" },
  { to: "/admin/sorting", label: "nav.sorting", icon: Tags, roles: ["client_admin"], area: "config" },
  { to: "/admin/settings", label: "nav.settings", icon: Settings, roles: ["client_admin"], area: "config" },
  { to: "/admin/log", label: "nav.adminLog", icon: ScrollText, roles: ["client_admin"], area: "config" },
  { to: "/guide", label: "nav.guide", icon: BookOpen, roles: ALL, area: "guide" },
];

export const navFor = (role: string) => NAV.filter((n) => n.roles.includes(role));

// P-222: the entries of a role grouped by area, in menu order. An area shows its title (nav.areas.<area>) only when
// it has at least two entries for that role; the Home never has one.
export interface NavGroup { area: NavArea; titled: boolean; items: NavItem[] }
export function navAreasFor(role: string): NavGroup[] {
  const groups: NavGroup[] = [];
  for (const n of navFor(role)) {
    const last = groups[groups.length - 1];
    if (last && last.area === n.area) last.items.push(n);
    else groups.push({ area: n.area, titled: false, items: [n] });
  }
  for (const g of groups) g.titled = g.area !== "home" && g.items.length >= 2;
  return groups;
}
