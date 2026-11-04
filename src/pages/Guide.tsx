import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { Card, PageHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen } from "lucide-react";

// P-135: the section of the complete guide (/guida.html, copied from GUIDA.html at build) for each role.
const SECTION: Record<string, string> = {
  asp_technician: "tecnico-asp", asp_warehouse: "magazzino-asp", asp_admin: "amministratore-asp",
  client_warehouse: "magazzino-cliente", client_office: "ufficio-cliente", client_admin: "amministratore-cliente",
};

// §15: a short in-app guide per role, one screen, bilingual.
export default function Guide() {
  const { t } = useTranslation();
  const { claims } = useSession();
  const role = claims?.role ?? "";
  const steps = t(`guide.${role}`, { returnObjects: true }) as string[];
  return (
    <div className="max-w-2xl">
      <PageHeader title={t("nav.guide")} subtitle={t(`roles.${role}`)} />
      <Card>
        <ol className="list-decimal pl-5 space-y-3" data-testid="guide-steps">
          {(Array.isArray(steps) ? steps : []).map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      </Card>
      {/* A new tab (on the phone: the browser view over the app), so closing it goes back to the app. */}
      <Button asChild size="lg" className="mt-4">
        <a href={`/guida.html#${SECTION[role] ?? "per-tutti"}`} target="_blank" rel="noopener" data-testid="guide-full"><BookOpen className="h-5 w-5" aria-hidden />{t("guidePage.openFull")}</a>
      </Button>
    </div>
  );
}
