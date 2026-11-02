/** Carries in-progress signup state between screens without putting it in the URL. */
const EMAIL_KEY = "dolemon:signup-email";
const DEV_CODE_KEY = "dolemon:dev-code";

export function setSignupEmail(email: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(EMAIL_KEY, email.trim().toLowerCase());
}

export function getSignupEmail(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(EMAIL_KEY);
}

/** Only used by the local demo provider, so the flow can be tested without a mailbox. */
export function setDevCode(code: string) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DEV_CODE_KEY, code);
}

export function getDevCode(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(DEV_CODE_KEY);
}

export function clearSignupDraft() {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(EMAIL_KEY);
  window.sessionStorage.removeItem(DEV_CODE_KEY);
}
