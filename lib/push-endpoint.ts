/** Never POST to arbitrary URLs supplied by users, even with a valid RLS row. */
export function allowedPushEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint);
    const host = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && !u.port && !u.hash &&
      (host === "fcm.googleapis.com" || host === "updates.push.services.mozilla.com" || host.endsWith(".push.apple.com") || host.endsWith(".notify.windows.com"));
  } catch { return false; }
}
