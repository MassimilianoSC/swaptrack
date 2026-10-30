// D-29 / P-60: an alert stays open until a person closes it, also when its differences are gone (count 0).
// Such an alert reads "no difference now" in neutral tone and is not one of the alerts to look at.
export interface AlertLike { closedAt?: unknown; count?: number }

export const hasNoDifferenceNow = (a: AlertLike): boolean => !a.closedAt && a.count === 0;
export const isAlertToWatch = (a: AlertLike): boolean => !a.closedAt && a.count !== 0;

// Roles that read alerts (firestore.rules /alerts): the technician never subscribes.
export const ALERT_READER_ROLES = ["client_admin", "client_office", "client_warehouse", "asp_admin", "asp_warehouse"];
