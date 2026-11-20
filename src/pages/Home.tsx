import { Link } from "react-router";
import { useTranslation } from "react-i18next";
import { useSession } from "@/app/session";
import { homeSections } from "@/app/nav";
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
      {/* P-222: the cards in the areas of the menu, in menu order. An area with at least two cards has its title;
          neighbouring areas of one card share one untitled grid. */}
      <div className="space-y-6">
        {homeSections(role).map((s) => (
          <section key={s.key} data-testid={s.area ? `home-area-${s.area}` : "home-area-other"}>
            {s.area && <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted">{t(`nav.areas.${s.area}`)}</h2>}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {s.items.map((n) => (
                <Link key={n.to} to={n.to} data-testid={`home-card-${n.to.replace(/\//g, "-").replace(/^-/, "")}`}>
                  <Card className="h-full hover:border-primary transition-colors">
                    <n.icon className="h-6 w-6 text-primary mb-3" aria-hidden />
                    <p className="font-semibold">{t(n.label)}</p>
                    <p className="text-sm text-muted mt-1">{t(`home.cards.${n.label.split(".")[1]}`)}</p>
                  </Card>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
