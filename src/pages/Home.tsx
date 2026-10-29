import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { navFor } from "@/app/nav";
import { isAspRole } from "@shared/roles";
import { Card, PageHeader } from "@/components/ui/card";
import SitePicker from "./field/SitePicker";

export default function Home() {
  const { t } = useTranslation();
  const { claims, profile } = useSession();
  const role = claims?.role ?? "";
  if (isAspRole(role)) return <SitePicker />;
  return (
    <div>
      <PageHeader title={t("home.welcome", { name: profile?.firstName ?? "" })} subtitle={t(`roles.${role}`)} />
      {/* TODO(SPEC §13.1) step 4: client dashboard. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {navFor(role).filter((n) => n.to !== "/").map((n) => (
          <Link key={n.to} to={n.to} data-testid={`home-card-${n.to.replace(/\//g, "-").replace(/^-/, "")}`}>
            <Card className="h-full hover:border-primary transition-colors">
              <n.icon className="h-6 w-6 text-primary mb-3" aria-hidden />
              <p className="font-semibold">{t(n.label)}</p>
              <p className="text-sm text-muted mt-1">{t(`home.cards.${n.label.split(".")[1]}`)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
