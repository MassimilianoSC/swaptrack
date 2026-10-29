import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { Card, PageHeader } from "@/components/ui/card";

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
    </div>
  );
}
