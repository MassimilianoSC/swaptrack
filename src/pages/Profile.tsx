import * as React from "react";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { changePassword, signOut } from "@/lib/data/auth";
import { passwordIssues } from "@shared/policy";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Field, Select } from "@/components/ui/form";

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { profile, claims, user } = useSession();
  const { busy, run } = useAction();
  const [cur, setCur] = React.useState("");
  const [next, setNext] = React.useState("");
  const issues = passwordIssues(next);

  const savePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await run(() => changePassword(cur, next), t("profile.passwordChanged"));
    if (ok !== undefined) { setCur(""); setNext(""); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t("nav.profile")} />
      <Card className="space-y-2" data-testid="profile-card">
        <p className="font-semibold" data-testid="profile-name">{profile?.firstName} {profile?.lastName}</p>
        <p className="text-sm text-muted" data-testid="profile-email">{profile?.email}</p>
        <p className="text-sm" data-testid="profile-role">{t(`roles.${claims?.role}`)}</p>
      </Card>
      <Card className="space-y-3">
        <Field label={t("common.language")} htmlFor="lang">
          <Select id="lang" value={i18n.language} data-testid="profile-language-select"
            onChange={(e) => run(async () => { await i18n.changeLanguage(e.target.value); await call("setLanguage", { target: "user", language: e.target.value }); })}>
            <option value="it">Italiano</option>
            <option value="en">English</option>
          </Select>
        </Field>
      </Card>
      <Card>
        <form onSubmit={savePassword} className="space-y-3">
          <h2 className="font-semibold">{t("profile.changePassword")}</h2>
          <Field label={t("profile.currentPassword")} htmlFor="cur"><Input id="cur" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} data-testid="profile-current-password" /></Field>
          <Field label={t("auth.newPassword")} htmlFor="next" hint={t("auth.passwordPolicy")}><Input id="next" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} data-testid="profile-new-password" /></Field>
          {next && issues.length > 0 && <ul className="text-sm text-danger">{issues.map((i) => <li key={i}>{t(`errors.${i}`)}</li>)}</ul>}
          <Button type="submit" disabled={busy || !cur || issues.length > 0} data-testid="profile-change-password-button">{t("profile.changePassword")}</Button>
        </form>
      </Card>
      <Card className="space-y-3">
        <h2 className="font-semibold">{t("profile.signOutEverywhere")}</h2>
        <p className="text-sm text-muted">{t("profile.signOutEverywhereHint")}</p>
        <Button variant="danger" disabled={busy} data-testid="profile-signout-everywhere-button"
          onClick={() => run(async () => { await call("signOutEverywhere", { uid: user!.uid }); await signOut(); })}>{t("profile.signOutEverywhere")}</Button>
      </Card>
    </div>
  );
}
