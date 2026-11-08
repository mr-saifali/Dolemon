"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Camera, FileText, ImagePlus, Mic, Square, Video, X } from "lucide-react";
import { toast } from "sonner";
import { blobToDataUrl, compressImage, pickAudioMime } from "@/lib/media";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const MAX_RECORDING_MS = 60_000;
const MAX_FILE_BYTES = 20 * 1024 * 1024;

type PhotoPayload = { dataUrl: string; width: number; height: number };
type VoicePayload = { dataUrl: string; durationMs: number; ext: string };
type FilePayload = { dataUrl: string; name: string; sizeBytes: number; ext: string };

export type AttachmentSheetHandle = {
  openCamera: () => void;
  openPhoto: () => void;
  openFile: () => void;
  openVideo: () => void;
  startVoice: () => void;
};

export const AttachmentSheet = forwardRef<AttachmentSheetHandle, {
  open: boolean;
  onClose: () => void;
  onPhoto: (image: PhotoPayload) => void;
  onVoice: (audio: VoicePayload) => void;
  onFile?: (file: FilePayload) => void;
  onVideo?: (file: File) => Promise<void>;
  publicMedia?: boolean;
  preferred?: "camera" | "photo" | "voice";
}>(function AttachmentSheet({ open, onClose, onPhoto, onVoice, onFile, onVideo, publicMedia = false, preferred }, ref) {
  const dialog = useRef<HTMLDivElement | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const docInput = useRef<HTMLInputElement | null>(null);
  const videoInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const cameraStream = useRef<MediaStream | null>(null);
  const cameraView = useRef<HTMLVideoElement | null>(null);
  const cameraRequest = useRef(0);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const voiceRequest = useRef(0);
  const mounted = useRef(true);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [busy, setBusy] = useState(false);
  const [readingDoc, setReadingDoc] = useState(false);
  const [recording, setRecording] = useState(false);
  const [voicePending, setVoicePending] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [cameraState, setCameraState] = useState<"idle" | "requesting" | "active" | "unavailable">("idle");

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    const requests = voiceRequest;
    const cameraRequests = cameraRequest;
    const camera = cameraStream;
    mounted.current = true;
    return () => {
      mounted.current = false;
      requests.current++;
      cameraRequests.current++;
      camera.current?.getTracks().forEach((track) => track.stop());
      camera.current = null;
      stopTimer();
      if (recorder.current) recorder.current.onstop = null;
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const image = await compressImage(file);
      if (mounted.current) { onPhoto(image); onClose(); }
    } catch {
      toast.error("Couldn't read that photo");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      if (cameraInput.current) cameraInput.current.value = "";
    }
  };

  const handleVideo = async (file: File | undefined) => {
    if (!file || !onVideo) return;
    setBusy(true);
    try { await onVideo(file); if (mounted.current) onClose(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t send that video."); }
    finally { setBusy(false); if (videoInput.current) videoInput.current.value = ""; }
  };

  const handleDoc = async (file: File | undefined) => {
    if (!file) return;
    if (file.type.startsWith("video/") || /\.(mp4|mov|webm|m4v)$/i.test(file.name)) { await handleVideo(file); if (docInput.current) docInput.current.value = ""; return; }
    if (file.size > MAX_FILE_BYTES) {
      toast.error("Files up to 20 MB");
      if (docInput.current) docInput.current.value = "";
      return;
    }
    setReadingDoc(true);
    try {
      const dataUrl = await blobToDataUrl(file);
      const ext = (file.name.split(".").pop() || "file").toLowerCase().slice(0, 8);
      if (mounted.current) { onFile?.({ dataUrl, name: file.name, sizeBytes: file.size, ext }); onClose(); }
    } catch {
      toast.error("Couldn't read that file");
    } finally {
      setReadingDoc(false);
      if (docInput.current) docInput.current.value = "";
    }
  };

  const stopCamera = () => {
    cameraRequest.current++;
    cameraStream.current?.getTracks().forEach((track) => track.stop());
    cameraStream.current = null;
    setCameraState("idle");
  };

  const startCamera = async () => {
    cancelRecording();
    stopCamera();
    const request = ++cameraRequest.current;
    setCameraState("requesting");
    if (!navigator.mediaDevices?.getUserMedia) { setCameraState("unavailable"); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      if (!mounted.current || request !== cameraRequest.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      cameraStream.current = stream;
      setCameraState("active");
    } catch {
      if (mounted.current && request === cameraRequest.current) setCameraState("unavailable");
    }
  };

  useEffect(() => {
    if (cameraState !== "active" || !cameraView.current || !cameraStream.current) return;
    const video = cameraView.current;
    video.srcObject = cameraStream.current;
    void video.play().catch(() => {
      if (mounted.current && cameraStream.current === video.srcObject) {
        cameraStream.current?.getTracks().forEach((track) => track.stop());
        cameraStream.current = null;
        setCameraState("unavailable");
      }
    });
    return () => { video.srcObject = null; };
  }, [cameraState]);

  const capturePhoto = () => {
    const video = cameraView.current;
    if (!video?.videoWidth || !video.videoHeight) { toast.error("Camera is still starting. Try again in a moment."); return; }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 2048 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const context = canvas.getContext("2d");
    if (!context) { toast.error("Couldn't capture this photo."); return; }
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const request = cameraRequest.current;
    setBusy(true);
    canvas.toBlob((blob) => {
      if (!mounted.current || request !== cameraRequest.current) return;
      if (!blob) { setBusy(false); toast.error("Couldn't capture this photo."); return; }
      stopCamera();
      void handleFile(new File([blob], "camera.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
  };

  const startRecording = async () => {
    if (recorder.current?.state === "recording") return;
    const request = ++voiceRequest.current;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      toast.error("Voice notes need a microphone this browser can reach");
      return;
    }
    setVoicePending(true);
    let acquired: MediaStream | null = null;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      acquired = stream;
      if (!mounted.current || request !== voiceRequest.current) { stream.getTracks().forEach((track) => track.stop()); return; }
      const mimeType = pickAudioMime() || undefined;
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const ext = (rec.mimeType.split("/")[1] || "webm").split(";")[0];
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = async () => {
        const durationMs = Date.now() - startedAt.current;
        stream.getTracks().forEach((t) => t.stop());
        if (durationMs < 800 || chunks.current.length === 0) {
          toast.error("Too short — hold on a little longer");
          return;
        }
        const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
        try {
          const dataUrl = await blobToDataUrl(blob);
          if (mounted.current && request === voiceRequest.current) { onVoice({ dataUrl, durationMs, ext }); onClose(); }
        } catch {
          if (mounted.current && request === voiceRequest.current) toast.error("Couldn't prepare that voice note.");
        }
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      rec.start();
      setRecording(true);
      setElapsed(0);
      timer.current = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_RECORDING_MS && recorder.current?.state === "recording") {
          stopTimer();
          setRecording(false);
          recorder.current.stop();
        }
      }, 200);
    } catch {
      acquired?.getTracks().forEach((track) => track.stop());
      if (mounted.current && request === voiceRequest.current) toast.error("Microphone permission was blocked");
    } finally {
      if (mounted.current && request === voiceRequest.current) setVoicePending(false);
    }
  };

  const stopRecording = () => {
    stopTimer();
    setRecording(false);
    if (recorder.current?.state === "recording") recorder.current.stop();
  };

  const cancelRecording = () => {
    voiceRequest.current++;
    setVoicePending(false);
    stopTimer();
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
      recorder.current.stream.getTracks().forEach((t) => t.stop());
    }
    setRecording(false);
    setElapsed(0);
  };

  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const cancelRef = useRef(cancelRecording);
  cancelRef.current = () => { cancelRecording(); stopCamera(); };
  const busyRef = useRef(busy);
  busyRef.current = busy;
  useEffect(() => {
    if (!open || typeof window === "undefined") return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = dialog.current;
    const controls = () => Array.from(panel?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? []);
    controls()[0]?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busyRef.current) { event.preventDefault(); cancelRef.current(); closeRef.current(); return; }
      if (event.key !== "Tab") return;
      const buttons = controls(); if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); buttons[buttons.length - 1].focus(); }
      else if (!event.shiftKey && (index < 0 || index === buttons.length - 1)) { event.preventDefault(); buttons[0].focus(); }
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      if (previous?.isConnected && (document.activeElement === document.body || panel?.contains(document.activeElement))) previous.focus({ preventScroll: true });
    };
  }, [open]);

  useImperativeHandle(ref, () => ({
    openCamera: () => { if (!busy && !readingDoc) void startCamera(); },
    openPhoto: () => { if (!busy && !readingDoc) fileInput.current?.click(); },
    openFile: () => { if (!busy && !readingDoc) docInput.current?.click(); },
    openVideo: () => { if (!busy && !readingDoc) videoInput.current?.click(); },
    startVoice: () => { if (!busy && !readingDoc) void startRecording(); },
  }));

  return (
    <>
    <AnimatePresence>
      {open && (
        <div data-swipe-back="ignore" className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (busy) return;
              cancelRecording();
              stopCamera();
              onClose();
            }}
            className="absolute inset-0 bg-black/65"
          />

          <motion.div
            ref={dialog}
            role="dialog"
            aria-modal="true"
            aria-label="Attach"
            aria-busy={busy}
            initial={{ y: "100%", opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.7 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="relative w-full max-w-md rounded-t-[26px] border border-white/[0.07] bg-[#14141A] px-5 pb-7 pt-3 shadow-card sm:rounded-[26px]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">{preferred === "camera" ? "Take a photo" : preferred === "photo" ? "Choose an attachment" : preferred === "voice" ? "Send a voice note" : "Send something"}</h2>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  cancelRecording();
                  stopCamera();
                  onClose();
                }}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.06] hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {publicMedia && <p role="note" className="mb-4 rounded-xl border border-amber-400/25 bg-amber-400/10 px-3 py-2 text-xs leading-relaxed text-amber-100">Photos, voice notes and files use public links. Videos use a private, temporary handoff and a device-local copy.</p>}

            {cameraState !== "idle" ? (
              <div className="space-y-3">
                {cameraState === "requesting" && <p role="status" className="py-8 text-center text-sm text-zinc-400">Opening camera…</p>}
                {cameraState === "active" && <>
                  <video ref={cameraView} autoPlay playsInline muted aria-label="Camera preview" className="aspect-[4/3] w-full rounded-2xl bg-black object-contain" />
                  <button type="button" disabled={busy} onClick={capturePhoto} className="min-h-11 w-full rounded-full bg-rose px-4 py-3 text-sm font-medium text-white disabled:opacity-50">Take photo</button>
                </>}
                {cameraState === "unavailable" && <div role="status" className="space-y-3 text-center text-sm text-zinc-300">
                  <p>Couldn’t open the camera here. Check permission or use your device’s camera picker.</p>
                  <button type="button" onClick={() => { stopCamera(); cameraInput.current?.click(); }} className="min-h-11 rounded-full bg-white/10 px-5 py-2 text-white">Open device camera</button>
                </div>}
              </div>
            ) : voicePending ? (
              <p role="status" className="py-8 text-center text-sm text-zinc-400">Opening microphone…</p>
            ) : recording ? (
              <div className="rounded-xl2 border border-rose/25 bg-rose/[0.06] p-4">
                <div className="flex items-center gap-2 text-[12px] text-rose">
                  <motion.span
                    className="h-2 w-2 rounded-full bg-rose"
                    animate={{ opacity: [1, 0.25, 1] }}
                    transition={{ duration: 1.1, repeat: Infinity }}
                  />
                  Recording voice note
                  <span className="ml-auto tabular-nums text-text">
                    {String(Math.floor(elapsed / 60000)).padStart(1, "0")}:
                    {String(Math.floor((elapsed % 60000) / 1000)).padStart(2, "0")}
                  </span>
                </div>

                <div className="mt-4 flex items-center gap-[3px]" aria-hidden>
                  {Array.from({ length: 32 }).map((_, i) => (
                    <motion.span
                      key={i}
                      className="w-[3px] flex-1 rounded-full bg-rose/70"
                      animate={{ height: [6, 10 + ((i * 11) % 26), 6] }}
                      transition={{ duration: 0.9 + (i % 5) * 0.1, repeat: Infinity, ease: "easeInOut" }}
                    />
                  ))}
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    onClick={cancelRecording}
                    className="flex-1 rounded-full border border-ink-line py-2.5 text-[13px] text-text-muted hover:bg-white/[0.04]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={stopRecording}
                    className="flex flex-1 items-center justify-center gap-2 rounded-full bg-rose py-2.5 text-[13px] font-medium text-[#1A0A0F]"
                  >
                    <Square className="h-3 w-3 fill-current" />
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <Tile
                  icon={<Camera className="h-5 w-5" />}
                  label="Camera"
                  hint="Take a photo"
                  highlighted={preferred === "camera"}
                  onClick={() => void startCamera()}
                  disabled={busy}
                />
                <Tile
                  icon={<ImagePlus className="h-5 w-5" />}
                  label="Photo"
                  hint="From your phone"
                  highlighted={preferred === "photo"}
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                />
                <Tile
                  icon={<Video className="h-5 w-5" />}
                  label="Video"
                  hint="Up to 50 MB"
                  onClick={() => videoInput.current?.click()}
                  disabled={busy || !onVideo}
                />
                <Tile
                  icon={<Mic className="h-5 w-5" />}
                  label="Voice note"
                  hint="Up to 60s"
                  highlighted={preferred === "voice"}
                  onClick={startRecording}
                  disabled={busy}
                />
                <Tile
                  icon={<FileText className="h-5 w-5" />}
                  label="File"
                  hint="Up to 20 MB"
                  onClick={() => docInput.current?.click()}
                  disabled={busy || readingDoc || !onFile}
                />
              </div>
            )}

            {busy && <p role="status" className="mt-3 text-center text-xs text-zinc-400">Saving and uploading… Keep this chat open.</p>}
            <p className="mt-4 text-center text-[11px] text-text-muted/60">
              Voice notes up to 60s · files up to 20 MB · videos up to 50 MB
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
    <div className="hidden" aria-hidden="true">
            <input
              ref={cameraInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <input ref={videoInput} type="file" accept="video/mp4,video/webm,video/quicktime" className="hidden" onChange={(e) => void handleVideo(e.target.files?.[0])} />
            <input
              ref={docInput}
              type="file"
              className="hidden"
              onChange={(e) => void handleDoc(e.target.files?.[0])}
            />

    </div>
    {(busy || readingDoc) && !open && <p role="status" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-zinc-900 px-4 py-2 text-xs text-white shadow-xl">Preparing attachment…</p>}
    </>
  );
});

function Tile({
  icon,
  label,
  hint,
  onClick,
  disabled,
  highlighted = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  highlighted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl2 border border-ink-line bg-ink-surface/70 px-2 py-4 transition-colors",
        disabled ? "opacity-45" : "hover:border-rose/30 hover:bg-white/[0.04] active:scale-[0.98]",
        highlighted && "border-rose/50 bg-rose/[0.08]"
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose/12 text-rose">{icon}</span>
      <span className="text-[12.5px] font-medium">{label}</span>
      <span className="text-[10px] text-text-muted/70">{hint}</span>
    </button>
  );
}
