import * as React from "react";
import { useTranslation } from "react-i18next";
import { useAction } from "@/app/hooks";
import { call } from "@/lib/data/call";
import { watchDoc } from "@/lib/data/db";
import { SETTINGS_DEFAULTS } from "@shared/settingsDefaults";
import { PageHeader, Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input, Field, Checkbox, Textarea, Select } from "@/components/ui/form";
import { Loading } from "@/components/states";

type D = typeof SETTINGS_DEFAULTS;

function useSetting<N extends keyof D>(name: N) {
  const [v, setV] = React.useState<D[N] | null>(null);
  React.useEffect(() => watchDoc<D[N]>(`settings/${name}`, (x) => setV({ ...SETTINGS_DEFAULTS[name], ...(x ?? {}) } as D[N])), [name]);
  return [v, setV] as const;
}

function SaveBar({ onSave, busy, testId }: { onSave: () => void; busy: boolean; testId: string }) {
  const { t } = useTranslation();
  return <div className="flex justify-end pt-2"><Button disabled={busy} onClick={onSave} data-testid={testId}>{t("common.save")}</Button></div>;
}

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = () => rej(new Error("read_failed"));
  r.readAsDataURL(f);
});

function BrandingTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("branding");
  const [logo, setLogo] = React.useState<File | null>(null);
  if (!v) return <Loading />;
  const save = () => run(async () => {
    if (logo && logo.size > 500_000) throw new Error("logo_too_large");
    const payload = logo ? { base64: await toBase64(logo), contentType: logo.type } : null;
    await call("saveSettings", { name: "branding", value: { appName: v.appName, primaryColor: v.primaryColor, logo: payload } });
    setLogo(null);
  }, t("common.saved"));
  return (
    <Card className="space-y-4 max-w-xl">
      <Field label={t("settings.appName")} htmlFor="s-name"><Input id="s-name" value={v.appName} onChange={(e) => setV({ ...v, appName: e.target.value })} data-testid="settings-app-name" /></Field>
      <Field label={t("settings.primaryColor")} htmlFor="s-color">
        <div className="flex gap-2"><input type="color" aria-label={t("settings.primaryColor")} value={v.primaryColor} onChange={(e) => setV({ ...v, primaryColor: e.target.value })} className="h-10 w-14" /><Input id="s-color" className="font-mono" value={v.primaryColor} onChange={(e) => setV({ ...v, primaryColor: e.target.value })} data-testid="settings-primary-color" /></div>
      </Field>
      <Field label={t("settings.logo")} htmlFor="s-logo" hint={t("settings.logoHint")}>
        <input id="s-logo" type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" onChange={(e) => setLogo(e.target.files?.[0] ?? null)} data-testid="settings-logo-input" className="text-sm" />
      </Field>
      {v.logoPath && <Button variant="secondary" disabled={busy} data-testid="settings-logo-remove" onClick={() => run(() => call("saveSettings", { name: "branding", value: { appName: v.appName, primaryColor: v.primaryColor, removeLogo: true } }), t("common.saved"))}>{t("settings.removeLogo")}</Button>}
      <SaveBar onSave={save} busy={busy} testId="settings-branding-save" />
    </Card>
  );
}

function AuthTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("auth");
  if (!v) return <Loading />;
  const flag = (k: "google" | "microsoft" | "mfaAdmins" | "inactivityEnabled") => (
    <Checkbox id={`s-${k}`} label={t(`settings.${k}`)} checked={v[k]} onChange={(x) => setV({ ...v, [k]: x })} testId={`settings-${k}`} />
  );
  return (
    <Card className="space-y-2 max-w-xl">
      <p className="text-sm text-muted">{t("settings.identityPlatformHint")}</p>
      {flag("google")}{flag("microsoft")}{flag("mfaAdmins")}{flag("inactivityEnabled")}
      <Field label={t("settings.inactivityMinutes")} htmlFor="s-min"><Input id="s-min" type="number" min={5} max={480} value={v.inactivityMinutes} onChange={(e) => setV({ ...v, inactivityMinutes: Number(e.target.value) })} data-testid="settings-inactivity-minutes" /></Field>
      <SaveBar busy={busy} testId="settings-auth-save" onSave={() => run(() => call("saveSettings", { name: "auth", value: v }), t("common.saved"))} />
    </Card>
  );
}

function AppTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("app");
  if (!v) return <Loading />;
  return (
    <Card className="space-y-3 max-w-xl">
      <Field label={t("settings.minVersion")} htmlFor="s-minv" hint={t("settings.minVersionHint", { version: __APP_VERSION__ })}><Input id="s-minv" className="font-mono" placeholder="1.0.0" value={v.minVersion} onChange={(e) => setV({ ...v, minVersion: e.target.value })} data-testid="settings-min-version" /></Field>
      <Checkbox id="s-email" label={t("settings.emailConfigured")} checked={v.emailConfigured} onChange={(x) => setV({ ...v, emailConfigured: x })} testId="settings-email-configured" />
      <p className="text-xs text-muted">{t("settings.emailConfiguredHint")}</p>
      <SaveBar busy={busy} testId="settings-app-save" onSave={() => run(() => call("saveSettings", { name: "app", value: v }), t("common.saved"))} />
    </Card>
  );
}

function PrivacyTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("privacy");
  const [bump, setBump] = React.useState(false);
  if (!v) return <Loading />;
  const save = () => run(() => call("saveSettings", { name: "privacy", value: { texts: v.texts, bumpVersion: bump, retentionEnabled: v.retentionEnabled, retentionDays: v.retentionDays } }), t("common.saved"));
  return (
    <Card className="space-y-3 max-w-3xl">
      <p className="text-sm" data-testid="settings-privacy-version">{t("privacy.versionLabel", { version: v.version })}</p>
      <Field label={t("settings.privacyIt")} htmlFor="s-pit"><Textarea id="s-pit" value={v.texts.it} onChange={(e) => setV({ ...v, texts: { ...v.texts, it: e.target.value } })} data-testid="settings-privacy-it" /></Field>
      <Field label={t("settings.privacyEn")} htmlFor="s-pen"><Textarea id="s-pen" value={v.texts.en} onChange={(e) => setV({ ...v, texts: { ...v.texts, en: e.target.value } })} data-testid="settings-privacy-en" /></Field>
      <Checkbox id="s-bump" label={t("settings.bumpVersion")} checked={bump} onChange={setBump} testId="settings-privacy-bump" />
      <Checkbox id="s-ret" label={t("settings.retentionEnabled")} checked={v.retentionEnabled} onChange={(x) => setV({ ...v, retentionEnabled: x })} testId="settings-retention-enabled" />
      <Field label={t("settings.retentionDays")} htmlFor="s-days"><Input id="s-days" type="number" min={30} max={3650} value={v.retentionDays} onChange={(e) => setV({ ...v, retentionDays: Number(e.target.value) })} data-testid="settings-retention-days" /></Field>
      <SaveBar busy={busy} testId="settings-privacy-save" onSave={save} />
    </Card>
  );
}

function ThresholdsTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("thresholds");
  if (!v) return <Loading />;
  return (
    <Card className="space-y-3 max-w-xl">
      <Field label={t("settings.staleDays")} htmlFor="s-stale" hint={t("settings.staleDaysHint")}><Input id="s-stale" type="number" min={1} max={365} value={v.staleDays} onChange={(e) => setV({ ...v, staleDays: Number(e.target.value) })} data-testid="settings-stale-days" /></Field>
      <Field label={t("settings.transferDays")} htmlFor="s-tr" hint={t("settings.transferDaysHint")}><Input id="s-tr" type="number" min={1} max={90} value={v.transferDays} onChange={(e) => setV({ ...v, transferDays: Number(e.target.value) })} data-testid="settings-transfer-days" /></Field>
      <SaveBar busy={busy} testId="settings-thresholds-save" onSave={() => run(() => call("saveSettings", { name: "thresholds", value: v }), t("common.saved"))} />
    </Card>
  );
}

function PhotosTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("photos");
  if (!v) return <Loading />;
  return (
    <Card className="space-y-3 max-w-xl">
      <Checkbox id="s-ph" label={t("settings.mandatoryForDefective")} checked={v.mandatoryForDefective} onChange={(x) => setV({ ...v, mandatoryForDefective: x })} testId="settings-photos-mandatory" />
      <SaveBar busy={busy} testId="settings-photos-save" onSave={() => run(() => call("saveSettings", { name: "photos", value: v }), t("common.saved"))} />
    </Card>
  );
}

function FieldPolicyTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("fieldPolicy");
  if (!v) return <Loading />;
  return (
    <Card className="space-y-3 max-w-xl">
      <Field label={t("settings.pieceAtSiteNotInBom")} htmlFor="s-fp" hint={t("settings.fieldPolicyHint")}>
        <Select id="s-fp" value={v.pieceAtSiteNotInBom} onChange={(e) => setV({ ...v, pieceAtSiteNotInBom: e.target.value as never })} data-testid="settings-field-policy">
          <option value="accept_and_alert">{t("settings.acceptAndAlert")}</option>
          <option value="accept_silently">{t("settings.acceptSilently")}</option>
        </Select>
      </Field>
      <SaveBar busy={busy} testId="settings-field-policy-save" onSave={() => run(() => call("saveSettings", { name: "fieldPolicy", value: v }), t("common.saved"))} />
    </Card>
  );
}

function FeaturesTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("features");
  if (!v) return <Loading />;
  return (
    <Card className="space-y-3 max-w-xl">
      <Checkbox id="s-ai" label={t("settings.aiDocumentExtraction")} checked={v.aiDocumentExtraction} onChange={(x) => setV({ ...v, aiDocumentExtraction: x })} testId="settings-ai" />
      <p className="text-xs text-muted">{t("settings.aiHint")}</p>
      <SaveBar busy={busy} testId="settings-features-save" onSave={() => run(() => call("saveSettings", { name: "features", value: v }), t("common.saved"))} />
    </Card>
  );
}

function ItemFieldsTab() {
  const { t } = useTranslation();
  const { busy, run } = useAction();
  const [v, setV] = useSetting("itemFields");
  const [row, setRow] = React.useState({ key: "", it: "", en: "", type: "text" as "text" | "number" | "choice", required: false, options: "" });
  if (!v) return <Loading />;
  const add = () => {
    if (!row.key.trim() || !row.it.trim() || !row.en.trim()) return;
    const fields = [...v.fields, { key: row.key.trim(), labels: { it: row.it, en: row.en }, type: row.type, required: row.required, ...(row.options ? { options: row.options.split(",").map((s) => s.trim()).filter(Boolean) } : {}) }];
    setV({ fields }); setRow({ key: "", it: "", en: "", type: "text", required: false, options: "" });
  };
  const remove = (i: number) => setV({ fields: v.fields.filter((_, j) => j !== i) });
  return (
    <Card className="space-y-3 max-w-3xl">
      <p className="text-sm text-muted">{t("settings.itemFieldsHint")}</p>
      <ul className="space-y-2 text-sm" data-testid="settings-item-fields-list">
        {v.fields.map((f, i) => (
          <li key={f.key} className="flex items-center gap-2 border-b border-border py-1">
            <span className="font-mono text-xs">{f.key}</span>
            <span>{f.labels.it} / {f.labels.en}</span>
            <span className="text-muted text-xs">{f.type}{f.required ? " · required" : ""}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => remove(i)} data-testid={`settings-item-fields-remove-${i}`}>×</Button>
          </li>
        ))}
      </ul>
      <div className="grid gap-2 md:grid-cols-6 items-end">
        <Field label="key" htmlFor="if-k"><Input id="if-k" className="font-mono" value={row.key} onChange={(e) => setRow({ ...row, key: e.target.value })} data-testid="settings-item-fields-key" /></Field>
        <Field label="IT" htmlFor="if-it"><Input id="if-it" value={row.it} onChange={(e) => setRow({ ...row, it: e.target.value })} data-testid="settings-item-fields-it" /></Field>
        <Field label="EN" htmlFor="if-en"><Input id="if-en" value={row.en} onChange={(e) => setRow({ ...row, en: e.target.value })} data-testid="settings-item-fields-en" /></Field>
        <Field label="type" htmlFor="if-t"><Select id="if-t" value={row.type} onChange={(e) => setRow({ ...row, type: e.target.value as never })} data-testid="settings-item-fields-type"><option value="text">text</option><option value="number">number</option><option value="choice">choice</option></Select></Field>
        <Field label="options (choice)" htmlFor="if-o"><Input id="if-o" value={row.options} onChange={(e) => setRow({ ...row, options: e.target.value })} placeholder="a,b,c" data-testid="settings-item-fields-options" /></Field>
        <Checkbox id="if-r" label={t("settings.required")} checked={row.required} onChange={(x) => setRow({ ...row, required: x })} testId="settings-item-fields-required" />
      </div>
      <div className="flex justify-between"><Button variant="secondary" onClick={add} data-testid="settings-item-fields-add">{t("common.add")}</Button>
        <Button disabled={busy} onClick={() => run(() => call("saveSettings", { name: "itemFields", value: v }), t("common.saved"))} data-testid="settings-item-fields-save">{t("common.save")}</Button>
      </div>
    </Card>
  );
}

// §14: all the listed items (R17).
export default function SettingsPage() {
  const { t } = useTranslation();
  return (
    <div>
      <PageHeader title={t("nav.settings")} subtitle={t("settings.subtitle")} />
      <Tabs defaultValue="branding">
        <TabsList>
          <TabsTrigger value="branding" data-testid="settings-tab-branding">{t("settings.tabs.branding")}</TabsTrigger>
          <TabsTrigger value="auth" data-testid="settings-tab-auth">{t("settings.tabs.auth")}</TabsTrigger>
          <TabsTrigger value="app" data-testid="settings-tab-app">{t("settings.tabs.app")}</TabsTrigger>
          <TabsTrigger value="privacy" data-testid="settings-tab-privacy">{t("settings.tabs.privacy")}</TabsTrigger>
          <TabsTrigger value="thresholds" data-testid="settings-tab-thresholds">{t("settings.tabs.thresholds")}</TabsTrigger>
          <TabsTrigger value="photos" data-testid="settings-tab-photos">{t("settings.tabs.photos")}</TabsTrigger>
          <TabsTrigger value="itemFields" data-testid="settings-tab-item-fields">{t("settings.tabs.itemFields")}</TabsTrigger>
          <TabsTrigger value="fieldPolicy" data-testid="settings-tab-field-policy">{t("settings.tabs.fieldPolicy")}</TabsTrigger>
          <TabsTrigger value="features" data-testid="settings-tab-features">{t("settings.tabs.features")}</TabsTrigger>
        </TabsList>
        <TabsContent value="branding"><BrandingTab /></TabsContent>
        <TabsContent value="auth"><AuthTab /></TabsContent>
        <TabsContent value="app"><AppTab /></TabsContent>
        <TabsContent value="privacy"><PrivacyTab /></TabsContent>
        <TabsContent value="thresholds"><ThresholdsTab /></TabsContent>
        <TabsContent value="photos"><PhotosTab /></TabsContent>
        <TabsContent value="itemFields"><ItemFieldsTab /></TabsContent>
        <TabsContent value="fieldPolicy"><FieldPolicyTab /></TabsContent>
        <TabsContent value="features"><FeaturesTab /></TabsContent>
      </Tabs>
    </div>
  );
}
