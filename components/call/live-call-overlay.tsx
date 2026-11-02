"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Camera,
  CameraOff,
  ChevronDown,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  SwitchCamera,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useLiveCall } from "@/lib/live-call";
import { formatCallDuration } from "@/lib/thread";
import { cn } from "@/lib/utils";

/** iOS-style control: a glass circle with a small label under it. */
function CallControl({
  icon,
  label,
  onClick,
  tone = "glass",
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  tone?: "glass" | "end" | "accept" | "light";
  active?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 620, damping: 26 }}
      className="flex w-[68px] flex-col items-center gap-2"
    >
      <span
        className={cn(
          "flex h-[58px] w-[58px] items-center justify-center rounded-full border transition-colors duration-200",
          tone === "glass" && "border-white/[0.12] bg-white/[0.12] text-white",
          tone === "glass" && active && "border-white/25 bg-white text-[#0B0B0E]",
          tone === "light" && "border-white/[0.14] bg-white/[0.22] text-white",
          tone === "accept" &&
            "border-transparent bg-gradient-to-b from-[#5CE89B] to-[#2FCB6E] text-white shadow-[0_10px_30px_-8px_rgba(47,203,110,0.75)]",
          tone === "end" &&
            "border-transparent bg-gradient-to-b from-[#FF6B7D] to-[#F4354E] text-white shadow-[0_10px_30px_-8px_rgba(244,53,78,0.8)]"
        )}
      >
        {icon}
      </span>
      <span className="text-[10.5px] font-medium tracking-[0.01em] text-white/60">{label}</span>
    </motion.button>
  );
}

/**
 * Full-screen call surface, iOS-call flavoured: glass controls, a self-view
 * picture-in-picture on video, and a pill you can drop the call into so the
 * chat stays usable. Mounted once in the root layout.
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
    minimized,
    minimize,
    expand,
  } = useLiveCall();

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const [speaker, setSpeaker] = useState(false);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);

  const video = call?.type === "video";
  const connected = call?.phase === "connected";

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

  // earpiece/speaker routing is only real when the browser exposes setSinkId
  useEffect(() => {
    if (!connected) return;
    if (typeof HTMLMediaElement === "undefined" || !("setSinkId" in HTMLMediaElement.prototype)) return;
    void navigator.mediaDevices
      ?.enumerateDevices()
      .then((devices) => setOutputs(devices.filter((device) => device.kind === "audiooutput")))
      .catch(() => undefined);
  }, [connected]);

  const canRoute = outputs.length > 1;

  useEffect(() => {
    if (!canRoute) return;
    const target = speaker ? outputs[0] : outputs.find((device) => device.deviceId === "default") ?? outputs[0];
    const apply = (element: HTMLMediaElement | null) => {
      const withSink = element as (HTMLMediaElement & { setSinkId?: (id: string) => Promise<void> }) | null;
      if (withSink?.setSinkId && target) void withSink.setSinkId(target.deviceId).catch(() => undefined);
    };
    apply(remoteAudio.current);
    apply(remoteVideo.current);
  }, [speaker, canRoute, outputs]);

  const initials = useMemo(
    () => (call?.peerName ?? "").replace(/^@/, "").slice(0, 2).toUpperCase(),
    [call?.peerName]
  );

  if (!call) return null;

  const incoming = call.direction === "incoming" && call.phase === "ringing";
  const ended = call.phase === "ended";
  const ringing = call.phase === "inviting" || call.phase === "connecting" || incoming;

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

  /* ------------------------------------------------------------------ pill */
  if (minimized) {
    return (
      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 420, damping: 34 }}
        className="fixed inset-x-0 top-0 z-[70] flex justify-center px-4 pt-[max(env(safe-area-inset-top),10px)]"
      >
        <div className="flex w-full max-w-sm items-center gap-3 rounded-full border border-white/[0.1] bg-[#141418]/95 px-2.5 py-2 shadow-[0_18px_44px_-18px_rgba(0,0,0,0.9)]">
          <button
            type="button"
            onClick={expand}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            aria-label="Return to call"
          >
            <span className="relative flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white/[0.08] text-[11px] font-medium text-zinc-200">
              {call.peerAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={call.peerAvatarUrl} alt="" className="h-full w-full object-cover" />
              ) : (
                initials
              )}
              <span className="absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-[#141418] bg-mint" />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[12.5px] font-medium text-zinc-100">
                @{call.peerName.replace(/^@/, "")}
              </span>
              <span className="block truncate text-[11px] text-mint">{status}</span>
            </span>
          </button>

          {!ended && (
            <button
              type="button"
              onClick={hangup}
              aria-label="End call"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-b from-[#FF6B7D] to-[#F4354E] text-white"
            >
              <PhoneOff className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={expand}
            aria-label="Expand call"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-zinc-300"
          >
            <ChevronDown className="h-4 w-4 rotate-180" />
          </button>
        </div>
      </motion.div>
    );
  }

  /* ------------------------------------------------------------ full screen */
  return (
    <AnimatePresence>
      <motion.div
        key={call.conversationId}
        initial={{ opacity: 0, scale: 1.015 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
        onPointerDown={() => {
          void remoteVideo.current?.play().catch(() => {});
          void remoteAudio.current?.play().catch(() => {});
        }}
        className="fixed inset-0 z-[70] flex flex-col overflow-hidden bg-[#08080B]"
      >
        {/* ambient wash — pure gradients, nothing blurs per frame */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute left-1/2 top-[-16%] h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.26),rgba(255,160,122,0.10)_46%,transparent_72%)]" />
          <div className="absolute -bottom-32 -left-24 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle_at_center,rgba(167,139,250,0.18),transparent_70%)]" />
          <div className="absolute -bottom-24 -right-20 h-[320px] w-[320px] rounded-full bg-[radial-gradient(circle_at_center,rgba(94,234,212,0.12),transparent_70%)]" />
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
        {video && <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />}
        <audio ref={remoteAudio} autoPlay playsInline className="hidden" />

        {/* top bar: duration + collapse */}
        <div className="relative z-20 flex items-center justify-between px-4 pt-[max(env(safe-area-inset-top),12px)]">
          <div className="w-9" />
          {connected ? (
            <div className="flex items-center gap-1.5 rounded-full border border-white/10 bg-black/35 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-mint animate-pulse-soft" />
              <span className="text-[11.5px] font-medium tabular-nums text-white/85">{status}</span>
            </div>
          ) : (
            <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] tracking-wide text-white/60">
              {video ? "Video call" : "Voice call"}
            </div>
          )}
          <motion.button
            type="button"
            onClick={minimize}
            whileTap={{ scale: 0.92 }}
            aria-label="Minimise call"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.08] text-white/80"
          >
            <ChevronDown className="h-4 w-4" />
          </motion.button>
        </div>

        {/* self-view picture-in-picture */}
        {video && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
            className="absolute right-4 top-[calc(max(env(safe-area-inset-top),12px)+52px)] z-20 h-[150px] w-[108px] overflow-hidden rounded-[18px] border border-white/[0.14] bg-black/70 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.95)]"
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
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-[10px] text-white/50">
                <CameraOff className="h-4 w-4" />
                camera off
              </div>
            )}
          </motion.div>
        )}

        {/* who you're talking to */}
        <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-8">
          {(!video || !connected) && (
            <div className="relative mb-8 flex items-center justify-center">
              {ringing && !ended && (
                <>
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="absolute h-32 w-32 rounded-full border border-[#FF5C7A]/25"
                      animate={{ scale: [1, 1.85], opacity: [0.5, 0] }}
                      transition={{ duration: 2.7, repeat: Infinity, delay: i * 0.9, ease: "easeOut" }}
                    />
                  ))}
                </>
              )}
              <div className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border border-white/[0.12] bg-[#15151A] text-[30px] font-light tracking-wide text-zinc-200 shadow-[0_20px_60px_-24px_rgba(255,92,122,0.6)]">
                {call.peerAvatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={call.peerAvatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  initials
                )}
              </div>
            </div>
          )}

          <p
            className={cn(
              "text-[23px] font-light tracking-[-0.01em] text-white",
              video && connected && "drop-shadow-[0_2px_12px_rgba(0,0,0,0.85)]"
            )}
          >
            @{call.peerName.replace(/^@/, "")}
          </p>
          <p
            className={cn(
              "mt-1.5 text-[13px] tracking-wide",
              connected ? "text-white/50" : "text-white/40",
              ended && "text-white/45"
            )}
          >
            {status}
          </p>

          {connected && !video && (
            <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-white/35">
              <span className={cn("h-1.5 w-1.5 rounded-full", encrypted ? "bg-mint" : "bg-amber")} />
              {encrypted ? "Encrypted · phone to phone" : "Securing the line…"}
            </p>
          )}
        </div>

        {/* controls */}
        <div className="relative z-10 px-5 pb-[max(env(safe-area-inset-bottom),26px)]">
          {notice && <p className="mb-4 text-center text-[12px] text-white/45">{notice}</p>}

          {incoming ? (
            <div className="flex items-start justify-center gap-16">
              <CallControl
                onClick={decline}
                label="Decline"
                tone="end"
                icon={<PhoneOff className="h-6 w-6" strokeWidth={1.9} />}
              />
              <CallControl
                onClick={() => void accept()}
                label="Accept"
                tone="accept"
                icon={<Phone className="h-6 w-6" strokeWidth={1.9} />}
              />
            </div>
          ) : ended ? (
            <p className="pb-2 text-center text-[12px] text-white/35">Closing…</p>
          ) : (
            <>
              <div className="flex items-start justify-center gap-4">
                <CallControl
                  onClick={toggleMute}
                  label={muted ? "Unmute" : "Mute"}
                  active={muted}
                  icon={muted ? <MicOff className="h-[22px] w-[22px]" /> : <Mic className="h-[22px] w-[22px]" />}
                />

                {canRoute && (
                  <CallControl
                    onClick={() => setSpeaker((value) => !value)}
                    label={speaker ? "Speaker" : "Earpiece"}
                    active={speaker}
                    icon={
                      speaker ? <Volume2 className="h-[22px] w-[22px]" /> : <VolumeX className="h-[22px] w-[22px]" />
                    }
                  />
                )}

                {video && (
                  <CallControl
                    onClick={toggleCamera}
                    label={cameraOn ? "Camera" : "Camera off"}
                    active={!cameraOn}
                    icon={
                      cameraOn ? <Camera className="h-[22px] w-[22px]" /> : <CameraOff className="h-[22px] w-[22px]" />
                    }
                  />
                )}

                {video ? (
                  <CallControl
                    onClick={() => void flipCamera()}
                    label="Flip"
                    icon={<SwitchCamera className="h-[22px] w-[22px]" />}
                  />
                ) : (
                  <CallControl
                    onClick={minimize}
                    label="Back to chat"
                    icon={<ChevronDown className="h-[22px] w-[22px]" />}
                  />
                )}
              </div>

              <div className="mt-5 flex justify-center">
                <CallControl
                  onClick={hangup}
                  label="End call"
                  tone="end"
                  icon={<PhoneOff className="h-6 w-6" strokeWidth={1.9} />}
                />
              </div>
            </>
          )}

          {connected && (
            <div className="mt-6 flex items-center justify-center gap-1.5 text-[10.5px] text-white/30">
              <span className="h-1 w-1 rounded-full bg-mint" />
              {encrypted ? "End-to-end encrypted" : "Connecting securely"}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
