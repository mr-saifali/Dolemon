/** Preserve a live composer while interacting with non-text message controls. */
export function isTextEntry(element: Element | null): boolean {
  return !!element?.matches('textarea, input:not([type="button"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]');
}
