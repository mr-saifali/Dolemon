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
  Video as VideoIcon,
  Volume2,
} from "lucide-react";
import { useLiveCall } from "@/lib/live-call";
import { formatCallDuration } from "@/lib/thread";
import { cn } from "@/lib/utils";

/** iOS-style control: a glass circle with a small label under it. */
function CallControl({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.9 }}
      transition={{ type: "spring", stiffness: 620, damping: 26 }}
      className="flex min-w-0 max-w-[68px] flex-1 flex-col items-center gap-1.5"
    >
      <span
        className={cn(
          "flex h-11 w-11 items-center sm:h-[52px] sm:w-[52px] justify-center rounded-full border transition-colors duration-200",
          active
            ? "border-white/25 bg-white text-[#0B0B0E]"
            : "border-white/[0.12] bg-white/[0.12] text-white"
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
 *
 * The remote <audio> element lives OUTSIDE both branches on purpose — dropping
 * the call into the pill must not cut the other person's voice.
 */
export function LiveCallOverlay() {
  const {
    call,
    localStream,
    remoteStream,
    elapsed,
    muted,
    cameraOn,
    speaker,
    notice,
    encrypted,
    accept,
    decline,
    hangup,
    toggleMute,
    toggleCamera,
    flipCamera,
    toggleSpeaker,
    switchType,
    minimized,
    minimize,
    expand,
  } = useLiveCall();

  const localVideo = useRef<HTMLVideoElement | null>(null);
  const remoteVideo = useRef<HTMLVideoElement | null>(null);
  const remoteAudio = useRef<HTMLAudioElement | null>(null);
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([]);
  const [chromeVisible, setChromeVisible] = useState(true);
  const floatingBounds = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  useEffect(() => { setChromeVisible(true); }, [call?.conversationId, call?.type, call?.phase]);

  const video = call?.type === "video";
  const connected = call?.phase === "connected";
  const audioCarries = !video || minimized;

  useEffect(() => {
    if (localVideo.current && localVideo.current.srcObject !== localStream) {
      localVideo.current.srcObject = localStream;
    }
    if (localStream) void localVideo.current?.play().catch(() => {});
  }, [localStream, call?.phase, call?.type, minimized]);

  useEffect(() => {
    const isVideo = call?.type === "video";
    const videoVisible = isVideo && !minimized;

    if (remoteVideo.current && remoteVideo.current.srcObject !== (videoVisible ? remoteStream : null)) {
      remoteVideo.current.srcObject = videoVisible ? remoteStream : null;
    }
    // voice calls, and any minimized video call, carry the far end on this element
    if (remoteAudio.current && remoteAudio.current.srcObject !== (audioCarries ? remoteStream : null)) {
      remoteAudio.current.srcObject = audioCarries ? remoteStream : null;
    }

    const play = () => {
      if (videoVisible) void remoteVideo.current?.play().catch(() => {});
      if (audioCarries) void remoteAudio.current?.play().catch(() => {});
    };
    if (remoteStream) play();
  }, [remoteStream, call?.phase, call?.type, minimized, audioCarries]);

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
      <>
        <audio ref={remoteAudio} autoPlay playsInline className="hidden" />
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
      </>
    );
  }

  /* ------------------------------------------------------------ full screen */
  return (
    <>
      <audio ref={remoteAudio} autoPlay playsInline className="hidden" />
      <AnimatePresence>
        <motion.div
          key={call.conversationId}
          initial={{ opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          onClick={(event) => {
            if (video && connected && !(event.target as Element).closest("button, [data-call-chrome], [data-self-preview]")) setChromeVisible((visible) => !visible);
          }}
          onPointerDown={() => {
            void remoteVideo.current?.play().catch(() => {});
            void remoteAudio.current?.play().catch(() => {});
          }}
          aria-label="Call screen"
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
          {video && chromeVisible && <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/80" />}
          {/* Drag constraints use the whole usable screen, independently of chrome. */}
          <div ref={floatingBounds} className="pointer-events-none absolute inset-3" />

          {/* top bar: duration + collapse */}
          <div data-call-chrome hidden={video && connected && !chromeVisible} className={cn("relative z-20 flex items-center justify-between gap-2 px-4 pt-[max(env(safe-area-inset-top),12px)]", video && connected && !chromeVisible && "!hidden")}>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-white">@{call.peerName.replace(/^@/, "")}</span>
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
              data-self-preview
              aria-label="Your camera preview. Drag to move."
              drag
              dragConstraints={floatingBounds}
              dragElastic={0}
              dragMomentum={false}
              onDragStart={() => { dragging.current = true; }}
              onDragEnd={() => { window.setTimeout(() => { dragging.current = false; }, 0); }}
              onClick={(event) => { event.stopPropagation(); if (!dragging.current && connected) setChromeVisible((visible) => !visible); }}
              style={{ touchAction: "none" }}
              initial={{ opacity: 0, scale: 0.9, y: -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 32 }}
              className="absolute cursor-grab active:cursor-grabbing right-4 top-[calc(max(env(safe-area-inset-top),12px)+52px)] z-20 h-[150px] w-[108px] overflow-hidden rounded-[18px] border border-white/[0.14] bg-black/70 shadow-[0_18px_44px_-16px_rgba(0,0,0,0.95)]"
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
          <div className="pointer-events-none relative z-10 flex flex-1 flex-col items-center justify-center px-8">
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

            {(!video || !connected) && <><p
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
            </p></>}

            {connected && !video && (
              <p className="mt-6 flex items-center gap-1.5 text-[11.5px] text-white/35">
                <span className={cn("h-1.5 w-1.5 rounded-full", encrypted ? "bg-mint" : "bg-amber")} />
                {encrypted ? "Encrypted · phone to phone" : "Securing the line…"}
              </p>
            )}
          </div>

          {/* controls */}
          <div data-call-chrome hidden={video && connected && !chromeVisible} className={cn("relative z-10 px-5 pb-[max(env(safe-area-inset-bottom),26px)]", video && connected && !chromeVisible && "!hidden")}>
            {video && connected && <button type="button" className="mb-3 w-full text-center text-xs text-white/60" onClick={() => setChromeVisible(false)}>Tap video to hide controls</button>}
            {notice && <p className="mb-4 text-center text-[12px] text-white/45">{notice}</p>}

            {incoming ? (
              <div className="flex items-center justify-center gap-4">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  onClick={decline}
                  aria-label="Decline call"
                  className="flex h-14 w-32 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#FF6B7D] to-[#E23B4E] text-[13px] font-medium text-white shadow-[0_14px_34px_-12px_rgba(244,53,78,0.8)]"
                >
                  <PhoneOff className="h-5 w-5" strokeWidth={2} />
                  Decline
                </motion.button>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.95 }}
                  animate={{ scale: [1, 1.04, 1] }}
                  transition={{ duration: 1.6, repeat: Infinity }}
                  onClick={() => void accept()}
                  aria-label="Accept call"
                  className="flex h-14 w-32 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-[#5CE89B] to-[#2FCB6E] text-[13px] font-medium text-white shadow-[0_14px_34px_-12px_rgba(47,203,110,0.8)]"
                >
                  {video ? <VideoIcon className="h-5 w-5" strokeWidth={2} /> : <Phone className="h-5 w-5" strokeWidth={2} />}
                  Accept
                </motion.button>
              </div>
            ) : ended ? (
              <p className="pb-2 text-center text-[12px] text-white/35">Closing…</p>
            ) : (
              <>
                <div className="mx-auto flex w-full max-w-[420px] items-start justify-center gap-1 sm:gap-4">
                  <CallControl
                    onClick={toggleMute}
                    label={muted ? "Unmute" : "Mute"}
                    active={muted}
                    icon={muted ? <MicOff className="h-[22px] w-[22px]" /> : <Mic className="h-[22px] w-[22px]" />}
                  />

                  <CallControl
                    onClick={toggleSpeaker}
                    label={speaker ? "Speaker" : "Earpiece"}
                    active={speaker}
                    icon={<Volume2 className="h-[22px] w-[22px]" />}
                  />

                  <CallControl
                    onClick={() => void switchType(video ? "voice" : "video")}
                    label={video ? "Voice only" : "Go to video"}
                    active={video}
                    icon={
                      video ? <Phone className="h-[22px] w-[22px]" /> : <VideoIcon className="h-[22px] w-[22px]" />
                    }
                  />

                  {video && (
                    <>
                      <CallControl
                        onClick={toggleCamera}
                        label={cameraOn ? "Camera" : "Camera off"}
                        active={!cameraOn}
                        icon={
                          cameraOn ? <Camera className="h-[22px] w-[22px]" /> : <CameraOff className="h-[22px] w-[22px]" />
                        }
                      />
                      <CallControl
                        onClick={() => void flipCamera()}
                        label="Flip"
                        icon={<SwitchCamera className="h-[22px] w-[22px]" />}
                      />
                    </>
                  )}
                </div>

                <div className="mt-5 flex justify-center">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.95 }}
                    onClick={hangup}
                    aria-label="End call"
                    className="flex h-14 w-44 items-center justify-center gap-2.5 rounded-full bg-gradient-to-b from-[#FF5F5F] to-[#D92D43] text-[14px] font-medium tracking-wide text-white shadow-[0_16px_38px_-12px_rgba(217,45,67,0.85)]"
                  >
                    <PhoneOff className="h-5 w-5" strokeWidth={2} />
                    End call
                  </motion.button>
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
    </>
  );
}
