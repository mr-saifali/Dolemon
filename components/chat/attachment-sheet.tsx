"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FileText, ImagePlus, Mic, Square, X } from "lucide-react";
import { toast } from "sonner";
import { blobToDataUrl, compressImage, pickAudioMime } from "@/lib/media";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const MAX_RECORDING_MS = 60_000;

export function AttachmentSheet({
  open,
  onClose,
  onPhoto,
  onVoice,
}: {
  open: boolean;
  onClose: () => void;
  onPhoto: (image: { dataUrl: string; width: number; height: number }) => void;
  onVoice: (audio: { dataUrl: string; durationMs: number }) => void;
}) {
  const fileInput = useRef<HTMLInputElement | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  const stopTimer = () => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  };

  useEffect(() => {
    return () => {
      stopTimer();
      recorder.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      const image = await compressImage(file);
      onPhoto(image);
      onClose();
    } catch {
      toast.error("Couldn't read that photo");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices) {
      toast.error("Voice notes need a microphone this browser can reach");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickAudioMime() || undefined;
      const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
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
        const dataUrl = await blobToDataUrl(blob);
        onVoice({ dataUrl, durationMs });
        onClose();
      };
      recorder.current = rec;
      startedAt.current = Date.now();
      rec.start();
      setRecording(true);
      setElapsed(0);
      timer.current = setInterval(() => {
        const ms = Date.now() - startedAt.current;
        setElapsed(ms);
        if (ms >= MAX_RECORDING_MS) recorder.current?.stop();
      }, 200);
    } catch {
      toast.error("Microphone permission was blocked");
    }
  };

  const stopRecording = () => {
    stopTimer();
    setRecording(false);
    recorder.current?.stop();
  };

  const cancelRecording = () => {
    stopTimer();
    if (recorder.current && recorder.current.state !== "inactive") {
      recorder.current.onstop = null;
      recorder.current.stop();
      recorder.current.stream.getTracks().forEach((t) => t.stop());
    }
    setRecording(false);
    setElapsed(0);
  };

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
          <motion.button
            type="button"
            aria-label="Close"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => {
              if (recording) cancelRecording();
              onClose();
            }}
            className="absolute inset-0 bg-black/65"
          />

          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Attach"
            initial={{ y: "100%", opacity: 0.7 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: "100%", opacity: 0.7 }}
            transition={{ duration: 0.26, ease: EASE }}
            className="relative w-full max-w-md rounded-t-[26px] border border-white/[0.07] bg-[#14141A] px-5 pb-7 pt-3 shadow-card sm:rounded-[26px]"
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />

            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[18px] font-semibold">Send something</h2>
              <button
                type="button"
                onClick={() => {
                  if (recording) cancelRecording();
                  onClose();
                }}
                aria-label="Close"
                className="flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:bg-white/[0.06] hover:text-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {recording ? (
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
              <div className="grid grid-cols-3 gap-2.5">
                <Tile
                  icon={<ImagePlus className="h-5 w-5" />}
                  label="Photo"
                  hint="From your phone"
                  onClick={() => fileInput.current?.click()}
                  disabled={busy}
                />
                <Tile
                  icon={<Mic className="h-5 w-5" />}
                  label="Voice note"
                  hint="Hold up to 60s"
                  onClick={startRecording}
                />
                <Tile
                  icon={<FileText className="h-5 w-5" />}
                  label="File"
                  hint="Coming soon"
                  disabled
                  onClick={() => toast("Files land with the storage backend")}
                />
              </div>
            )}

            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            <p className="mt-4 text-center text-[11px] text-text-muted/60">
              Photos and voice notes stay on this device until storage is connected.
            </p>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function Tile({
  icon,
  label,
  hint,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex flex-col items-center gap-2 rounded-xl2 border border-ink-line bg-ink-surface/70 px-2 py-4 transition-colors",
        disabled ? "opacity-45" : "hover:border-rose/30 hover:bg-white/[0.04] active:scale-[0.98]"
      )}
    >
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-rose/12 text-rose">{icon}</span>
      <span className="text-[12.5px] font-medium">{label}</span>
      <span className="text-[10px] text-text-muted/70">{hint}</span>
    </button>
  );
}
