import { db } from "./admin";
import { SETTINGS_DEFAULTS, SettingsName } from "../shared/settingsDefaults";

type S<N extends SettingsName> = (typeof SETTINGS_DEFAULTS)[N];

export async function getSettings<N extends SettingsName>(name: N): Promise<S<N>> {
  const snap = await db.collection("settings").doc(name).get();
  return { ...SETTINGS_DEFAULTS[name], ...(snap.data() ?? {}) } as S<N>;
}
