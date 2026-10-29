import * as React from "react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { OpError } from "@/lib/data/call";

// Runs an async action with a busy flag and translated error toast.
export function useAction() {
  const { t } = useTranslation();
  const [busy, setBusy] = React.useState(false);
  const run = React.useCallback(async <T,>(fn: () => Promise<T>, success?: string): Promise<T | undefined> => {
    setBusy(true);
    try {
      const r = await fn();
      if (success) toast.success(success);
      return r;
    } catch (e) {
      const code = e instanceof OpError ? e.code : (e as Error).message;
      toast.error(t(`errors.${code}`, { defaultValue: t("errors.unexpected") }));
      return undefined;
    } finally {
      setBusy(false);
    }
  }, [t]);
  return { busy, run };
}

export function useOnline() {
  const [online, setOnline] = React.useState(navigator.onLine);
  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, []);
  return online;
}

export function useNarrow() {
  const [narrow, setNarrow] = React.useState(() => window.matchMedia("(max-width: 767px)").matches);
  React.useEffect(() => {
    const m = window.matchMedia("(max-width: 767px)");
    const fn = () => setNarrow(m.matches);
    m.addEventListener("change", fn);
    return () => m.removeEventListener("change", fn);
  }, []);
  return narrow;
}
