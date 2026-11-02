"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CameraOff,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
} from "lucide-react";
import { useLiveCall } from "@/lib/live-call";
import { formatCallDuration } from "@/lib/thread";
import { cn } from "@/lib/utils";

/**
 * Full-screen call surface. Rendered once in the root layout so an incoming call
 * can find you on any screen.
 */
export function LiveCallOverlay() {
  const {
    call,
    localStream,
    remoteStream,
    elapsed,
    muted,
    cameraOn,
    notice,
    encrypted,
    accept,
    decline,
    hangup,
    toggleMute,
    toggleCamera,
    flipCamera,
  } = useLiveCall();

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (localVideo.current && localVideo.current.srcObject !== localStream) {
      localVideo.current.srcObject = localStream;
    }
  }, [localStream, call?.phase]);

  useEffect(() => {
    const isVideo = call?.type === "video";

    if (remoteVideo.current && remoteVideo.current.srcObject !== remoteStream) {
      remoteVideo.current.srcObject = isVideo ? remoteStream : null;
    }
    // the video element already carries the audio — only the voice screen needs this one
    if (remoteAudio.current && remoteAudio.current.srcObject !== remoteStream) {
      remoteAudio.current.srcObject = isVideo ? null : remoteStream;
    }

    const play = () => {
      if (isVideo) void remoteVideo.current?.play().catch(() => {});
      else void remoteAudio.current?.play().catch(() => {});
    };
    if (remoteStream) play();
  }, [remoteStream, call?.phase, call?.type]);

  if (!call) return null;

  const video = call.type === "video";
  const connected = call.phase === "connected";
  const incoming = call.direction === "incoming" && call.phase === "ringing";
  const ended = call.phase === "ended";

  const status = ended
    ? call.note ?? "Call ended"
    : incoming
      ? `Incoming ${video ? "video" : "voice"} call`
      : connected
        ? formatCallDuration(elapsed)
        : call.phase === "connecting"
          ? "Connecting…"
          : call.direction === "incoming"
            ? "Ringing…"
            : "Calling…";

  const initials = call.peerName.replace(/^@/, "").slice(0, 2).toUpperCase();

  return (
    <AnimatePresence>
      <motion.div
        key={call.conversationId}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onPointerDown={() => {
          void remoteVideo.current?.play().catch(() => {});
          void remoteAudio.current?.play().catch(() => {});
        }}
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#08080B]"
      >
        {/* ambient glow */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <motion.div
            className="absolute left-1/2 top-[-14%] h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.30),rgba(255,140,90,0.08)_45%,transparent_70%)] blur-3xl"
            animate={{ scale: connected ? [1, 1.06, 1] : [1, 1.03, 1], opacity: [0.85, 1, 0.85] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
          />
          <div className="absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(104,120,255,0.16),transparent_70%)] blur-3xl" />
        </div>

        {/* remote video sits behind everything for video calls */}
        {video && (
          <video
            ref={remoteVideo}
            autoPlay
            playsInline
            className={cn(
              "absolute inset-0 h-full w-full object-cover transition-opacity duration-500",
              connected && remoteStream ? "opacity-100" : "opacity-0"
            )}
          />
        )}
        {video && <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black/75" />}
        <audio ref={remoteAudio} autoPlay playsInline className="hidden" />

        {/* local preview */}
        {video && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="absolute right-4 top-[max(env(safe-area-inset-top),16px)] z-20 h-[152px] w-[110px] overflow-hidden rounded-2xl border border-white/10 bg-black/60 shadow-[0_18px_40px_-18px_rgba(0,0,0,0.9)]"
          >
            <video
              ref={localVideo}
              autoPlay
              playsInline
              muted
              className={cn("h-full w-full object-cover", !cameraOn && "opacity-0")}
              style={{ transform: "scaleX(-1)" }}
            />
            {!cameraOn && (
              <div className="absolute inset-0 flex items-center justify-center text-[11px] text-zinc-500">
                camera off
              </div>
            )}
          </motion.div>
        )}

        {/* who you're talking to */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8 safe-t">
          {(!video || !connected) && (
            <div className="relative mb-8 flex items-center justify-center">
              {(incoming || call.phase === "inviting" || call.phase === "connecting") && (
                <>
                  {[0, 1].map((i) => (
                    <motion.span
                      key={i}
                      className="absolute h-32 w-32 rounded-full border border-[#FF5C7A]/25"
                      animate={{ scale: [1, 1.9], opacity: [0.55, 0] }}
                      transition={{ duration: 2.6, repeat: Infinity, delay: i * 1.3, ease: "easeOut" }}
                    />
                  ))}
                </>
              )}
              <div className="flex h-32 w-32 items-center justify-center rounded-full border border-white/10 bg-[#15151A] text-[30px] font-light tracking-wide text-zinc-200">
                {initials}
              </div>
            </div>
          )}

          <p className={cn("text-[22px] font-light tracking-[-0.01em] text-white", video && connected && "drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]")}>
            @{call.peerName.replace(/^@/, "")}
          </p>
          <p
            className={cn(
              "mt-1.5 text-[13px] tracking-wide",
              connected ? "text-zinc-400" : "text-zinc-500",
              ended && "text-zinc-400"
            )}
          >
            {status}
          </p>

          {connected && (
            <p
              className={cn(
                "mt-6 max-w-[240px] text-center text-[11.5px] leading-relaxed",
                video ? "text-zinc-300/80 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]" : "text-zinc-600"
              )}
            >
              {encrypted ? "Encrypted · phone to phone" : "Connecting securely…"}
            </p>
          )}
        </div>

        {/* controls */}
        <div className="relative z-10 px-8 pb-[max(env(safe-area-inset-bottom),34px)]">
          {notice && (
            <p className="mb-4 text-center text-[12px] text-zinc-500">{notice}</p>
          )}

          {incoming ? (
            <div className="flex items-center justify-center gap-10">
              <CallButton onClick={decline} label="Decline" tone="plain">
                <PhoneOff className="h-6 w-6" strokeWidth={1.9} />
              </CallButton>
              <CallButton onClick={() => void accept()} label="Accept" tone="accept">
                <Phone className="h-6 w-6" strokeWidth={1.9} />
              </CallButton>
            </div>
          ) : ended ? (
            <p className="pb-2 text-center text-[12px] text-zinc-600">Closing…</p>
          ) : (
            <div className="flex items-center justify-center gap-4">
              <CallButton onClick={toggleMute} label={muted ? "Unmute" : "Mute"} tone="plain" active={muted}>
                {muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </CallButton>

              {video && (
                <>
                  <CallButton onClick={toggleCamera} label={cameraOn ? "Camera off" : "Camera on"} tone="plain" active={!cameraOn}>
                    {cameraOn ? <Camera className="h-5 w-5" /> : <CameraOff className="h-5 w-5" />}
                  </CallButton>
                  <CallButton onClick={() => void flipCamera()} label="Flip camera" tone="plain">
                    <SwitchCamera className="h-5 w-5" />
                  </CallButton>
                </>
              )}

              <CallButton onClick={hangup} label="End call" tone="end">
                <PhoneOff className="h-6 w-6" strokeWidth={1.9} />
              </CallButton>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

function CallButton({
  children,
  onClick,
  label,
  tone,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  label: string;
  tone: "plain" | "end" | "accept";
  active?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      aria-label={label}
      whileTap={{ scale: 0.94 }}
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-full transition-colors",
        tone === "plain" && "border border-white/10 bg-white/[0.06] text-zinc-200 hover:bg-white/[0.1]",
        tone === "plain" && active && "border-white/20 bg-white text-zinc-900 hover:bg-white",
        tone === "accept" && "bg-gradient-to-br from-[#4ADE80] to-[#22C55E] text-white shadow-[0_0_26px_rgba(74,222,128,0.35)]",
        tone === "end" && "bg-gradient-to-br from-[#FF5C7A] to-[#FF3B5C] text-white shadow-[0_0_26px_rgba(255,92,122,0.35)]"
      )}
    >
      {children}
    </motion.button>
  );
}
