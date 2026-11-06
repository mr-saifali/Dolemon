export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
export const VIDEO_BUCKET = "temporary-chat-videos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONVERSATION = /^[a-zA-Z0-9_-]{1,80}$/;
export function videoReference(conversationId: string, videoId: string) {
  if (!CONVERSATION.test(conversationId) || !UUID.test(videoId)) throw new Error("Invalid video reference.");
  return `dolemon-video:${conversationId}:${videoId}`;
}
export function parseVideoReference(value: string | undefined | null): { conversationId: string; videoId: string; path: string } | null {
  if (!value) return null;
  const match = /^dolemon-video:([a-zA-Z0-9_-]{1,80}):([0-9a-f-]{36})$/i.exec(value);
  if (!match || !UUID.test(match[2])) return null;
  return { conversationId: match[1], videoId: match[2], path: `${match[1]}/${match[2]}` };
}
export function supportedVideo(file: { type: string; size: number }): boolean {
  return file.size > 0 && file.size <= MAX_VIDEO_BYTES && ["video/mp4", "video/webm", "video/quicktime"].includes(file.type.toLowerCase());
}
