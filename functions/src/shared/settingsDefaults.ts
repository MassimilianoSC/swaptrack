// Defaults of the configurable items (SPEC §14, R17). Exactly these, nothing more.
export interface SettingsShapes {
  branding: { appName: string; logoPath: string | null; primaryColor: string };
  auth: { google: boolean; microsoft: boolean; mfaAdmins: boolean; inactivityEnabled: boolean; inactivityMinutes: number };
  app: { minVersion: string; emailConfigured: boolean };
  privacy: { version: number; texts: { it: string; en: string }; retentionEnabled: boolean; retentionDays: number };
  importMappings: { locations: Record<string, string>; models: Record<string, string> };
  photos: { mandatoryForDefective: boolean };
  // §14 configurable items added in step 4:
  itemFields: { fields: Array<{ key: string; labels: { it: string; en: string }; type: "text" | "number" | "choice"; options?: string[]; required: boolean }> };
  thresholds: { staleDays: number; transferDays: number };
  fieldPolicy: { pieceAtSiteNotInBom: "accept_and_alert" | "accept_silently" };
  features: { aiDocumentExtraction: boolean };
}

export const SETTINGS_DEFAULTS: SettingsShapes = {
  branding: { appName: "SwapTrack", logoPath: null, primaryColor: "#FF6B00" },
  auth: { google: false, microsoft: false, mfaAdmins: false, inactivityEnabled: false, inactivityMinutes: 30 },
  app: { minVersion: "", emailConfigured: false },
  privacy: { version: 1, texts: { it: "", en: "" }, retentionEnabled: false, retentionDays: 365 },
  importMappings: { locations: {}, models: {} },
  photos: { mandatoryForDefective: false },
  itemFields: { fields: [] },
  thresholds: { staleDays: 30, transferDays: 7 },
  fieldPolicy: { pieceAtSiteNotInBom: "accept_and_alert" },
  features: { aiDocumentExtraction: false },
};

export type SettingsName = keyof SettingsShapes;
export const PUBLIC_SETTINGS: readonly SettingsName[] = ["branding", "auth"];
