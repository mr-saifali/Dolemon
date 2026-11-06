"use client";

import { useEffect, useState } from "react";
import { Download, Film, Trash2 } from "lucide-react";
import { auth } from "@/lib/auth";
import { useSession } from "@/lib/session";
import { loadVideoOnDevice, receiveVideo, removeVideoFromDevice } from "@/lib/video-storage";
import { parseVideoReference } from "@/lib/video-reference";
import { formatBytes } from "@/lib/thread";

export function VideoMessage({ reference, conversationId, name, size, mine }: { reference: string; conversationId?: string; name?: string; size?: number; mine: boolean }) {
  const { account } = useSession();
  const belongsToConversation = Boolean(conversationId && parseVideoReference(reference)?.conversationId === conversationId);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true; setBlob(null); setChecking(true); setNotice("");
    if (!account?.id || !belongsToConversation) { setChecking(false); return; }
    void loadVideoOnDevice(account.id, reference).then((value) => { if (active) setBlob(value); }).catch(() => { if (active) setNotice("Device storage is unavailable."); }).finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, [reference, account?.id, belongsToConversation]);
  useEffect(() => {
    if (!blob) { setUrl(null); return; }
    const objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  const download = async () => {
    if (!account?.id) return;
    setBusy(true); setNotice("");
    try {
      const result = await receiveVideo(account.id, reference);
      setBlob(result.blob);
      setNotice(result.serverRemoved ? "Saved on this device. The temporary server copy was removed." : "Saved on this device. A server copy may remain until cleanup.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Couldn’t save this video."); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!account?.id || !window.confirm("Remove this video from this device? If the temporary copy has expired or was already downloaded, you may need the sender to share it again.")) return;
    setBusy(true);
    try { await removeVideoFromDevice(account.id, reference); setBlob(null); setNotice("Removed from this device."); }
    catch { setNotice("Couldn’t remove the video from this device."); }
    finally { setBusy(false); }
  };
  const stop = (event: React.SyntheticEvent) => event.stopPropagation();
  if (!belongsToConversation) return <p className="p-2 text-xs text-white/70">This video reference does not match this conversation.</p>;
  return <div onPointerDown={stop} onPointerUp={stop} onClick={stop} onKeyDown={stop} className="w-[min(248px,70vw)] p-1">
    {url ? <video src={url} controls playsInline preload="metadata" className="max-h-[300px] w-full rounded-xl bg-black" aria-label={name || "Shared video"} /> : <div className="flex min-h-28 flex-col items-center justify-center gap-2 rounded-xl bg-black/20 p-3 text-center"><Film className="h-6 w-6 text-white/70" /><p className="max-w-full truncate text-sm text-white">{name || "Video"}</p>{size != null && <p className="text-xs text-white/60">{formatBytes(size)}</p>}</div>}
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-white/80">
      {checking ? <span>Checking device…</span> : url ? <><a href={url} download={name || "video"} className="rounded-full bg-white/10 px-2.5 py-1.5">Save to files</a><button type="button" disabled={busy} onClick={() => void remove()} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 disabled:opacity-50"><Trash2 className="h-3 w-3" /> Remove local</button></> : auth.mode === "supabase" && !mine ? <button type="button" disabled={busy || !account?.id} onClick={() => void download()} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-1.5 disabled:opacity-50"><Download className="h-3 w-3" /> {busy ? "Saving…" : "Save video to device"}</button> : <span>Not saved on this device.</span>}
    </div>
    {!blob && !checking && !notice && <p className="mt-2 text-[11px] leading-relaxed text-white/60">{mine ? "A video saved on another device isn’t available here." : "Save within 7 days. The app then tries to remove the temporary copy, so it may not be available on other devices."}</p>}
    {notice && <p role="status" className="mt-2 text-[11px] leading-relaxed text-white/70">{notice}</p>}
  </div>;
}
