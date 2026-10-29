import type { LucideIcon } from "lucide-react";
import { Home, Building2, Users, MapPin, Boxes, Settings, ScrollText, BookOpen, Tags, Package, Truck, ClipboardList, FileText, Bell, AlertTriangle, LayoutDashboard, FileSpreadsheet, FileBarChart2 } from "lucide-react";

export interface NavItem { to: string; label: string; icon: LucideIcon; roles: readonly string[] }

const ALL = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse", "asp_technician"];
const DESK_ALL = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"];
const SHIP_ROLES = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"];
const DASHBOARD = ["client_admin", "client_office", "asp_admin"];

// Sections of each role (§12, §15).
export const NAV: NavItem[] = [
  { to: "/", label: "nav.home", icon: Home, roles: ALL },
  { to: "/dashboard", label: "nav.dashboard", icon: LayoutDashboard, roles: DASHBOARD },
  { to: "/items", label: "nav.items", icon: Package, roles: DESK_ALL },
  { to: "/items/to-complete", label: "nav.toComplete", icon: ClipboardList, roles: ["client_admin", "client_office", "asp_admin", "asp_warehouse"] },
  { to: "/shipments", label: "nav.shipments", icon: Truck, roles: SHIP_ROLES },
  { to: "/documents", label: "nav.documents", icon: FileText, roles: DESK_ALL },
  { to: "/alerts", label: "nav.alerts", icon: Bell, roles: DESK_ALL },
  { to: "/anomalies", label: "nav.anomalies", icon: AlertTriangle, roles: ["client_admin", "client_office", "asp_admin", "asp_warehouse"] },
  { to: "/exports", label: "nav.exports", icon: FileSpreadsheet, roles: ["client_admin", "client_office", "asp_admin"] },
  { to: "/reports", label: "nav.reports", icon: FileBarChart2, roles: ["client_admin", "client_office", "asp_admin"] },
  { to: "/admin/organizations", label: "nav.organizations", icon: Building2, roles: ["client_admin"] },
  { to: "/admin/users", label: "nav.users", icon: Users, roles: ["client_admin"] },
  { to: "/people", label: "nav.people", icon: Users, roles: ["asp_admin"] },
  { to: "/admin/locations", label: "nav.locations", icon: MapPin, roles: ["client_admin"] },
  { to: "/admin/models", label: "nav.models", icon: Boxes, roles: ["client_admin"] },
  { to: "/admin/sorting", label: "nav.sorting", icon: Tags, roles: ["client_admin"] },
  { to: "/admin/settings", label: "nav.settings", icon: Settings, roles: ["client_admin"] },
  { to: "/admin/log", label: "nav.adminLog", icon: ScrollText, roles: ["client_admin"] },
  { to: "/guide", label: "nav.guide", icon: BookOpen, roles: ALL },
];

export const navFor = (role: string) => NAV.filter((n) => n.roles.includes(role));
