/** Rightward travel in CSS pixels; a shorter gesture must be a genuine flick. */
export const SWIPE_DISTANCE = 100;
/** Rightward speed in CSS pixels per second. */
export const SWIPE_FLICK_VELOCITY = 500;

export function shouldDismissChat(offsetX: number, velocityX: number): boolean {
  if (!Number.isFinite(offsetX) || !Number.isFinite(velocityX) || offsetX <= 0) return false;
  return offsetX > SWIPE_DISTANCE || velocityX > SWIPE_FLICK_VELOCITY;
}
