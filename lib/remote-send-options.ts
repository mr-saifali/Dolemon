import type { useThread } from "@/lib/thread";
import type { RemoteSendOptions } from "@/lib/use-remote-thread";

/** Keep the demo composer's reply and attachment metadata when sending live. */
export function toRemoteSendOptions(options?: Parameters<ReturnType<typeof useThread>["send"]>[1]): RemoteSendOptions {
  const kind = options?.kind === "sticker" || options?.kind === "image" || options?.kind === "audio" || options?.kind === "file"
    ? options.kind : "text";
  return {
    kind,
    sticker: options?.sticker,
    replyTo: options?.replyTo,
    media: options?.media ? {
      dataUrl: options.media.url,
      name: options.media.name,
      sizeBytes: options.media.sizeBytes,
      durationMs: options.media.durationMs,
      ext: options.media.ext,
    } : undefined,
  };
}
