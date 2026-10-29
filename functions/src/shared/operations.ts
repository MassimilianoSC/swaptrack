// Single map operation -> router area (SPEC R20, §19.2). Shared by server and frontend (R19).
export const AREAS = ["users", "catalog", "items", "shipments", "documents", "alerts", "desk", "settings"] as const;
export type Area = (typeof AREAS)[number];

export const OPERATIONS = {
  createAsp: "users",
  setAspActive: "users",
  inviteUser: "users",
  resendInvitation: "users",
  changeRole: "users",
  deactivateUser: "users",
  blockUserNow: "users",
  signOutEverywhere: "users",
  deleteUser: "users",
  acceptPrivacy: "users",
  setLanguage: "users",
  requestPasswordReset: "users",

  importLocations: "catalog",
  saveLocation: "catalog",
  reassignSite: "catalog",
  importModels: "catalog",
  saveModel: "catalog",

  editItem: "items",
  mergeItems: "items",
  correctEventLocation: "items",
  forceState: "items",
  itemHistory: "items",
  revealEventAuthor: "items",
  attachPhotos: "items",

  createShipment: "shipments",
  sendShipment: "shipments",
  cancelShipment: "shipments",
  confirmReturn: "shipments",

  saveDocument: "documents",
  compareDocument: "documents",
  markDocumentChecked: "documents",
  closeDocument: "documents",
  saveDocumentMapping: "documents",

  markAlertSeen: "alerts",
  closeAlert: "alerts",
  resolveAnomaly: "alerts",

  listEvents: "desk",
  createExport: "desk",
  generateReport: "desk",

  saveSettings: "settings",
  saveSortingCategory: "settings",
  saveSortingRule: "settings",
} as const satisfies Record<string, Area>;

export type OpName = keyof typeof OPERATIONS;

// Operations callable without sign-in (listed in ARCHITECTURE.md).
export const PUBLIC_OPERATIONS: readonly OpName[] = ["requestPasswordReset"];

export function areaOf(op: string): Area | null {
  return Object.prototype.hasOwnProperty.call(OPERATIONS, op) ? OPERATIONS[op as OpName] : null;
}
