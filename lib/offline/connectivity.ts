/** Only a negative connectivity hint: online does not guarantee delivery.
 * This is an interim guard, not an offline outbox or a connectivity probe. */
export function isKnownOffline(): boolean {
  return typeof navigator !== "undefined" && navigator.onLine === false;
}
export const OFFLINE_SEND_NOTICE = "Internet is required to send. Your message has not been sent or queued.";
export const OFFLINE_RETRY_NOTICE = "Cannot retry while offline. The previous delivery may be unconfirmed.";
export const OFFLINE_CHANGE_NOTICE = "Internet is required right now. Offline changes are not yet supported or queued.";
