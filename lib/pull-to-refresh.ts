/**
 * Pull-to-refresh maths, kept free of the DOM so the gesture can be tested.
 *
 * A WebView has no browser chrome, so Android never offers its own
 * pull-to-refresh — without this the only way to refresh a chat is to leave it
 * and come back. The mapping below is deliberately damped: a short pull moves
 * the indicator a little, a committed one locks it open.
 */
export const REFRESH_EVENT = "dolemon:refresh";
/** Indicator travel, in CSS pixels, at which letting go refreshes. */
export const PULL_TRIGGER_PX = 44;
/** Hard stop, so a long drag never turns into a full-screen curtain. */
export const PULL_LIMIT_PX = 96;

/** Finger travel → indicator offset. Only downward pulls count. */
export function pullOffset(distance: number): number {
  if (!Number.isFinite(distance) || distance <= 0) return 0;
  // 1:1 for the first few pixels (feels connected), then resistance.
  const damped = distance < 24 ? distance : 24 + (distance - 24) * 0.6;
  return Math.min(PULL_LIMIT_PX, Math.round(damped));
}

/** Did the person pull far enough to mean it? */
export function shouldRefresh(offset: number): boolean {
  return Number.isFinite(offset) && offset >= PULL_TRIGGER_PX;
}

/** Progress 0…1 for the indicator's arrow rotation / opacity. */
export function pullProgress(offset: number): number {
  if (!Number.isFinite(offset) || offset <= 0) return 0;
  return Math.min(1, offset / PULL_TRIGGER_PX);
}

/**
 * Is the element the touch started on already scrolled to its top?
 *
 * The inbox and the thread both scroll inside their own containers, not the
 * document, so `window.scrollY` alone would arm the gesture in the middle of a
 * long chat.
 */
export function isAtTop(start: {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
} | null): boolean {
  if (!start) return true;
  if (start.scrollTop > 0) return false;
  // An element that cannot scroll is "at the top" by definition.
  return start.scrollHeight - start.clientHeight <= 1 || start.scrollTop === 0;
}
