// §4.8: at the end of the grace period the Auth account is disabled. The user document is marked authDisabled only
// when Auth confirmed it, or when there is no Auth account to disable: otherwise the next run tries again.
export function authDisableDone(err: unknown): boolean {
  return !err || (err as { code?: string }).code === "auth/user-not-found";
}
