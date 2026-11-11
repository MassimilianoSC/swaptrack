import * as React from "react";
import { useLocation, useNavigate } from "react-router";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Button } from "./ui/button";

// P-163: "Back", the same on every page that is not reached from the menu. The installed app has no back button of its
// own on an iPhone (and no browser bar anywhere). It goes back to the page the user came from; a page opened from a
// direct link (the first page of this tab: no page of the app before it) goes to its parent page instead, never out of
// the app. onBefore can keep the user on the page (it returns false), for something that must be dealt with first.
// iconOnly: the arrow alone where a row must not grow (the scanning screen); "Back" is then its name for screen readers.
export function BackButton({ fallback, onBefore, testId = "page-back", className = "-ml-2 mb-2", iconOnly = false }: { fallback: string; onBefore?: () => boolean | Promise<boolean>; testId?: string; className?: string; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const loc = useLocation();
  const go = async () => {
    if (onBefore && !(await onBefore())) return;
    if (loc.key !== "default") nav(-1); else nav(fallback, { replace: true });
  };
  return (
    <Button variant="ghost" size={iconOnly ? "icon" : "sm"} className={className} onClick={() => void go()} data-testid={testId}
      aria-label={iconOnly ? t("common.back") : undefined} title={iconOnly ? t("common.back") : undefined}>
      <ArrowLeft className={iconOnly ? "h-6 w-6" : "h-4 w-4"} aria-hidden />{!iconOnly && t("common.back")}
    </Button>
  );
}
