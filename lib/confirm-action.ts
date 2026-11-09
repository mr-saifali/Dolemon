/** App-rendered confirmation: WebView's default WebChromeClient cancels JS confirm(). */
export type ConfirmationRequest = { message: string; resolve: (answer: boolean) => void; handled: boolean };
export const CONFIRM_ACTION_EVENT = "dolemon:confirm-action";

export function confirmAction(message: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  return new Promise((resolve) => {
    const request: ConfirmationRequest = { message, resolve, handled: false };
    window.dispatchEvent(new CustomEvent(CONFIRM_ACTION_EVENT, { detail: request }));
    // Fail closed when the host is not mounted; never silently share content.
    if (!request.handled) resolve(false);
  });
}
