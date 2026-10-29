import * as React from "react";
import { useTranslation } from "react-i18next";
import { MoreHorizontal, UserPlus } from "lucide-react";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchUsers, watchOrganizations, watchDoc, type Row, type UserProfile, type Organization } from "@/lib/data/db";
import { CLIENT_ROLES, ASP_ROLES } from "@shared/roles";
import { DataTable } from "@/components/DataTable";
import { Badge, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/form";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Menu, MenuTrigger, MenuContent, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Loading, ErrorState, Empty } from "@/components/states";
import { InviteResultDialog, ConfirmDialog, type InviteResult } from "@/components/dialogs";

type U = Row<UserProfile & { authDisabled?: boolean }>;
type Act = "deactivate" | "reactivate" | "block" | "signOut" | "delete";

function rolesFor(actorRole: string, orgType: string | undefined) {
  if (actorRole === "asp_admin") return ["asp_warehouse", "asp_technician"];
  return orgType === "client" ? [...CLIENT_ROLES] : [...ASP_ROLES];
}

function InviteDialog({ open, onClose, orgs, onDone }: { open: boolean; onClose: () => void; orgs: Row<Organization>[]; onDone: (r: InviteResult) => void }) {
  const { t } = useTranslation();
  const { claims } = useSession();
  const { busy, run } = useAction();
  const [f, setF] = React.useState({ email: "", firstName: "", lastName: "", language: "it", orgId: claims?.role === "asp_admin" ? claims.orgId! : "", role: "" });
  const org = orgs.find((o) => o.id === f.orgId);
  const roles = rolesFor(claims?.role ?? "", org?.type);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const r = await run(() => call<InviteResult>("inviteUser", f));
    if (r) { onDone(r); onClose(); }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t("users.invite")} description={t("users.inviteHint")}>
        <form onSubmit={submit} className="space-y-3">
          {claims?.role === "client_admin" && (
            <Field label={t("users.organization")} htmlFor="inv-org">
              <Select id="inv-org" value={f.orgId} onChange={(e) => setF({ ...f, orgId: e.target.value, role: "" })} required data-testid="invite-org-select">
                <option value="">{t("common.choose")}</option>
                {orgs.filter((o) => o.active).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </Select>
            </Field>
          )}
          <Field label={t("users.role")} htmlFor="inv-role">
            <Select id="inv-role" value={f.role} onChange={set("role")} required data-testid="invite-role-select">
              <option value="">{t("common.choose")}</option>
              {roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
            </Select>
          </Field>
          <Field label={t("users.firstName")} htmlFor="inv-first"><Input id="inv-first" value={f.firstName} onChange={set("firstName")} required data-testid="invite-first-name" /></Field>
          <Field label={t("users.lastName")} htmlFor="inv-last"><Input id="inv-last" value={f.lastName} onChange={set("lastName")} required data-testid="invite-last-name" /></Field>
          <Field label={t("auth.email")} htmlFor="inv-email"><Input id="inv-email" type="email" value={f.email} onChange={set("email")} required data-testid="invite-email" /></Field>
          <Field label={t("common.language")} htmlFor="inv-lang"><Select id="inv-lang" value={f.language} onChange={set("language")} data-testid="invite-language"><option value="it">Italiano</option><option value="en">English</option></Select></Field>
          <div className="flex justify-end"><Button type="submit" disabled={busy || !f.role || !f.orgId} data-testid="invite-submit">{t("users.invite")}</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RoleDialog({ user, orgType, onClose }: { user: U | null; orgType?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { claims, user: me, refreshClaims } = useSession();
  const { busy, run } = useAction();
  const [role, setRole] = React.useState("");
  React.useEffect(() => { setRole(user?.role ?? ""); }, [user]);
  const save = async () => {
    const r = await run(() => call<{ selfChanged: boolean }>("changeRole", { uid: user!.id, role }), t("common.saved"));
    if (r?.selfChanged || user?.id === me?.uid) { await refreshClaims(); }
    onClose();
  };
  return (
    <Dialog open={!!user} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent title={t("users.changeRole")} description={t("users.changeRoleHint")}>
        <Select aria-label={t("users.role")} value={role} onChange={(e) => setRole(e.target.value)} data-testid="change-role-select">
          {rolesFor(claims?.role ?? "", orgType).map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}
        </Select>
        <div className="flex justify-end mt-4"><Button disabled={busy || role === user?.role} onClick={save} data-testid="change-role-submit">{t("common.save")}</Button></div>
      </DialogContent>
    </Dialog>
  );
}

function status(u: U) {
  if (u.deleted) return ["deleted", "neutral"] as const;
  if (u.active) return ["active", "success"] as const;
  return u.authDisabled ? (["blocked", "danger"] as const) : (["deactivated", "warning"] as const);
}

export default function UsersPage() {
  const { t } = useTranslation();
  const { claims, user: me } = useSession();
  const { busy, run } = useAction();
  const isClientAdmin = claims?.role === "client_admin";
  const [users, setUsers] = React.useState<U[] | null>(null);
  const [orgs, setOrgs] = React.useState<Row<Organization>[]>([]);
  const [error, setError] = React.useState(false);
  const [inviting, setInviting] = React.useState(false);
  const [invite, setInvite] = React.useState<InviteResult | null>(null);
  const [roleUser, setRoleUser] = React.useState<U | null>(null);
  const [confirm, setConfirm] = React.useState<{ user: U; act: Act } | null>(null);

  React.useEffect(() => watchUsers(isClientAdmin ? null : claims!.orgId!, (v) => setUsers(v.filter((u) => !u.deleted)), () => setError(true)), [isClientAdmin, claims]);
  React.useEffect(() => (isClientAdmin
    ? watchOrganizations(setOrgs)
    : watchDoc<Organization>(`organizations/${claims!.orgId}`, (o) => setOrgs(o ? [o] : []))), [isClientAdmin, claims]);
  const orgName = (id: string) => orgs.find((o) => o.id === id)?.name ?? "—";

  const doAct = async () => {
    const { user, act } = confirm!;
    const op = { deactivate: "deactivateUser", reactivate: "deactivateUser", block: "blockUserNow", signOut: "signOutEverywhere", delete: "deleteUser" } as const;
    await run(() => call(op[act], { uid: user.id, ...(act === "reactivate" ? { reactivate: true } : {}) }), t("common.saved"));
    setConfirm(null);
  };

  if (error) return <ErrorState message={t("errors.load_failed")} onRetry={() => location.reload()} />;
  if (!users) return <Loading />;
  return (
    <div>
      <PageHeader title={t(isClientAdmin ? "nav.users" : "nav.people")} subtitle={t("users.subtitle")}
        actions={<Button onClick={() => setInviting(true)} data-testid="users-invite-button"><UserPlus className="h-4 w-4" /> {t("users.invite")}</Button>} />
      <DataTable testId="users-table" rows={users}
        empty={<Empty title={t("users.empty")} hint={t("users.emptyHint")} action={<Button onClick={() => setInviting(true)}>{t("users.invite")}</Button>} />}
        columns={[
          { key: "name", header: t("users.name"), value: (u) => `${u.lastName ?? ""} ${u.firstName ?? ""}` },
          { key: "email", header: t("auth.email"), className: "font-mono text-xs" },
          ...(isClientAdmin ? [{ key: "org", header: t("users.organization"), value: (u: U) => orgName(u.orgId) }] : []),
          { key: "role", header: t("users.role"), value: (u) => t(`roles.${u.role}`) },
          { key: "status", header: t("common.status"), value: (u) => status(u)[0], render: (u) => { const [s, tone] = status(u); return <Badge tone={tone}>{t(`users.status.${s}`)}</Badge>; } },
          { key: "actions", header: "", render: (u) => (
            <Menu>
              <MenuTrigger asChild><Button size="icon" variant="ghost" aria-label={t("common.actions")} data-testid={`user-actions-${u.id}`}><MoreHorizontal className="h-5 w-5" /></Button></MenuTrigger>
              <MenuContent>
                {u.active && <MenuItem onSelect={() => run(async () => setInvite(await call<InviteResult>("resendInvitation", { uid: u.id })))} data-testid="user-action-resend">{t("users.resend")}</MenuItem>}
                {u.active && <MenuItem onSelect={() => setRoleUser(u)} data-testid="user-action-role">{t("users.changeRole")}</MenuItem>}
                <MenuSeparator />
                {u.active && u.id !== me?.uid && <MenuItem onSelect={() => setConfirm({ user: u, act: "deactivate" })} data-testid="user-action-deactivate">{t("users.deactivate")}</MenuItem>}
                {!u.active && <MenuItem onSelect={() => setConfirm({ user: u, act: "reactivate" })} data-testid="user-action-reactivate">{t("users.reactivate")}</MenuItem>}
                {u.id !== me?.uid && !u.authDisabled && <MenuItem onSelect={() => setConfirm({ user: u, act: "block" })} data-testid="user-action-block">{t("users.blockNow")}</MenuItem>}
                <MenuItem onSelect={() => setConfirm({ user: u, act: "signOut" })} data-testid="user-action-signout">{t("profile.signOutEverywhere")}</MenuItem>
                {u.id !== me?.uid && <MenuItem onSelect={() => setConfirm({ user: u, act: "delete" })} className="text-danger" data-testid="user-action-delete">{t("users.delete")}</MenuItem>}
              </MenuContent>
            </Menu>) },
        ]} />
      <InviteDialog open={inviting} onClose={() => setInviting(false)} orgs={orgs} onDone={setInvite} />
      <InviteResultDialog result={invite} onClose={() => setInvite(null)} />
      <RoleDialog user={roleUser} orgType={orgs.find((o) => o.id === roleUser?.orgId)?.type} onClose={() => setRoleUser(null)} />
      <ConfirmDialog open={!!confirm} busy={busy} danger={confirm?.act !== "reactivate"}
        title={confirm ? t(`users.confirm.${confirm.act}.title`) : ""}
        body={confirm ? t(`users.confirm.${confirm.act}.body`, { name: `${confirm.user.firstName} ${confirm.user.lastName}` }) : ""}
        confirmLabel={t("common.confirm")} onClose={() => setConfirm(null)} onConfirm={doAct} />
    </div>
  );
}
