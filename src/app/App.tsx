import * as React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router";
import { Toaster } from "sonner";
import { SessionProvider, useSession } from "./session";
import { FailClosedScreen, NoAccountScreen, DeactivatedScreen, UpdateRequiredScreen, PrivacyGate, MfaEnrollGate } from "./gates";
import { AppShell } from "@/components/shell/AppShell";
import { Loading } from "@/components/states";
import { APP_VERSION } from "@/lib/data/firebase";
import { compareVersions } from "@shared/policy";
import { isAdminRole } from "@shared/roles";
import { hasMfa } from "@/lib/data/auth";
import SignIn from "@/pages/SignIn";
import ForgotPassword from "@/pages/ForgotPassword";
import AuthAction from "@/pages/AuthAction";
import Home from "@/pages/Home";
import Profile from "@/pages/Profile";
import Guide from "@/pages/Guide";
import Scan from "@/pages/field/Scan";
import Sorting from "@/pages/admin/Sorting";
import Organizations from "@/pages/admin/Organizations";
import UsersPage from "@/pages/admin/Users";
import Locations from "@/pages/admin/Locations";
import Models from "@/pages/admin/Models";
import ImportWizard from "@/pages/admin/ImportWizard";
import SettingsPage from "@/pages/admin/Settings";
import AdminLog from "@/pages/admin/AdminLog";
import Items from "@/pages/desk/Items";
import ItemDetail from "@/pages/desk/ItemDetail";
import ToComplete from "@/pages/desk/ToComplete";
import Shipments from "@/pages/desk/Shipments";
import ShipmentDetail from "@/pages/desk/ShipmentDetail";
import Documents from "@/pages/desk/Documents";
import DocumentDetail from "@/pages/desk/DocumentDetail";
import Alerts from "@/pages/desk/Alerts";
import Anomalies from "@/pages/desk/Anomalies";
import Dashboard from "@/pages/desk/Dashboard";
import Exports from "@/pages/desk/Exports";
import Reports from "@/pages/desk/Reports";

function RoleRoute({ roles, children }: { roles: string[]; children: React.ReactNode }) {
  const { claims } = useSession();
  return roles.includes(claims?.role ?? "") ? <>{children}</> : <Navigate to="/" replace />;
}

function Gate() {
  const s = useSession();
  if (s.phase === "loading") return <Loading />;
  if (s.phase === "failClosed") return <FailClosedScreen />;
  if (s.phase === "signedOut") {
    return (
      <Routes>
        <Route path="/signin" element={<SignIn />} />
        <Route path="/forgot" element={<ForgotPassword />} />
        <Route path="/auth/action" element={<AuthAction />} />
        <Route path="*" element={<Navigate to="/signin" replace />} />
      </Routes>
    );
  }
  if (s.phase === "noAccount") return <NoAccountScreen />;
  if (s.phase === "deactivated") return <DeactivatedScreen />;
  if (!s.appSettings || !s.privacy || !s.profile) return <Loading />;
  if (s.appSettings.minVersion && compareVersions(APP_VERSION, s.appSettings.minVersion) < 0) return <UpdateRequiredScreen />;
  if (s.profile.privacyNoticeVersion !== s.privacy.version) return <PrivacyGate />;
  const mfaNeeded = s.authSettings.mfaAdmins && isAdminRole(s.claims?.role ?? "") && s.user && (!hasMfa(s.user) || !s.claims?.secondFactor);
  if (mfaNeeded) return <MfaEnrollGate />;
  const ca = ["client_admin"];
  const deskRead = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"];
  const shipAccess = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"];
  const dash = ["client_admin", "client_office", "asp_admin"];
  const anom = ["client_admin", "client_office", "asp_admin", "asp_warehouse"];
  return (
    <Routes>
      <Route path="/auth/action" element={<AuthAction />} />
      <Route element={<AppShell />}>
        <Route index element={<Home />} />
        <Route path="profile" element={<Profile />} />
        <Route path="guide" element={<Guide />} />
        <Route path="scan" element={<Scan />} />
        <Route path="dashboard" element={<RoleRoute roles={dash}><Dashboard /></RoleRoute>} />
        <Route path="items" element={<RoleRoute roles={deskRead}><Items /></RoleRoute>} />
        <Route path="items/to-complete" element={<RoleRoute roles={["client_admin", "client_office", "asp_admin", "asp_warehouse"]}><ToComplete /></RoleRoute>} />
        <Route path="items/:id" element={<RoleRoute roles={deskRead}><ItemDetail /></RoleRoute>} />
        <Route path="shipments" element={<RoleRoute roles={shipAccess}><Shipments /></RoleRoute>} />
        <Route path="shipments/:id" element={<RoleRoute roles={shipAccess}><ShipmentDetail /></RoleRoute>} />
        <Route path="documents" element={<RoleRoute roles={deskRead}><Documents /></RoleRoute>} />
        <Route path="documents/:id" element={<RoleRoute roles={deskRead}><DocumentDetail /></RoleRoute>} />
        <Route path="alerts" element={<RoleRoute roles={deskRead}><Alerts /></RoleRoute>} />
        <Route path="anomalies" element={<RoleRoute roles={anom}><Anomalies /></RoleRoute>} />
        <Route path="exports" element={<RoleRoute roles={dash}><Exports /></RoleRoute>} />
        <Route path="reports" element={<RoleRoute roles={dash}><Reports /></RoleRoute>} />
        <Route path="people" element={<RoleRoute roles={["asp_admin"]}><UsersPage /></RoleRoute>} />
        <Route path="admin/organizations" element={<RoleRoute roles={ca}><Organizations /></RoleRoute>} />
        <Route path="admin/users" element={<RoleRoute roles={ca}><UsersPage /></RoleRoute>} />
        <Route path="admin/locations" element={<RoleRoute roles={ca}><Locations /></RoleRoute>} />
        <Route path="admin/locations/import" element={<RoleRoute roles={ca}><ImportWizard kind="locations" /></RoleRoute>} />
        <Route path="admin/models" element={<RoleRoute roles={ca}><Models /></RoleRoute>} />
        <Route path="admin/models/import" element={<RoleRoute roles={ca}><ImportWizard kind="models" /></RoleRoute>} />
        <Route path="admin/settings" element={<RoleRoute roles={ca}><SettingsPage /></RoleRoute>} />
        <Route path="admin/sorting" element={<RoleRoute roles={ca}><Sorting /></RoleRoute>} />
        <Route path="admin/log" element={<RoleRoute roles={ca}><AdminLog /></RoleRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <Gate />
        <Toaster position="top-center" richColors closeButton />
      </SessionProvider>
    </BrowserRouter>
  );
}
