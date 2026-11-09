/** Keep the message menu visible even beside screen edges or a large bubble. */
export function messageMenuPosition(
  anchor: { top: number; bottom: number; left: number; width: number },
  viewport: { width: number; height: number },
  mine: boolean,
  actionCount: number,
  reactionHeight = 56
) {
  const margin = 8;
  const width = Math.max(0, Math.min(232, viewport.width - margin * 2));
  const height = reactionHeight + 8 + 8 + actionCount * 44;
  const maxHeight = Math.max(0, viewport.height - margin * 2);
  const visibleHeight = Math.min(height, maxHeight);
  const preferredLeft = mine ? anchor.left + anchor.width - width : anchor.left;
  const left = Math.max(margin, Math.min(preferredLeft, viewport.width - width - margin));
  const below = anchor.bottom + 8;
  const above = anchor.top - visibleHeight - 8;
  const preferredTop = below + visibleHeight <= viewport.height - margin ? below : above >= margin ? above : below;
  const top = Math.max(margin, Math.min(preferredTop, viewport.height - visibleHeight - margin));
  return { left, top, width, maxHeight: Math.min(maxHeight, viewport.height - top - margin) };
}
