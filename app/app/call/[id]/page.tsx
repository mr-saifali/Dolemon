"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RotateCcw,
  Video as VideoIcon,
  VideoOff,
  Volume2,
  VolumeX,
} from "lucide-react";
import { AppGuard } from "@/components/app-guard";
import { LiveCallLauncher } from "@/components/call/live-call-launcher";
import { Avatar } from "@/components/avatar";
import { authMode } from "@/lib/auth";
import { useCallSession } from "@/lib/calls";
import { demoConversations } from "@/lib/chat";
import { appendCallEvent, formatCallDuration } from "@/lib/thread";
import { cn } from "@/lib/utils";

function CallScreen({
  direction,
  type,
}: {
  direction: "incoming" | "outgoing";
  type: "voice" | "video";
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const conversationId = params.id;
  const [conversation] = useState(
    () => demoConversations().find((c) => c.id === conversationId) ?? null
  );
  const name = conversation?.name ?? "Them";

  const call = useCallSession({ direction, type, demo: authMode === "local" });
  const ended = useRef(false);

  // Keep the screen awake during a call where the platform allows it.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const anyNav = navigator as unknown as {
          wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
        };
        if (anyNav.wakeLock) lock = await anyNav.wakeLock.request("screen");
      } catch {
        /* unsupported */
      }
    };
    void request();
    return () => {
      void lock?.release().catch(() => {});
    };
  }, []);

  const finish = (info: Parameters<typeof appendCallEvent>[1]) => {
    if (ended.current) return;
    ended.current = true;
    appendCallEvent(conversationId, info);
    router.replace(`/app/chat/${conversationId}`);
  };

  useEffect(() => {
    if (call.phase !== "ended") return;
    const t = setTimeout(() => {
      finish({ type, durationMs: call.elapsed, missed: direction === "incoming" && call.elapsed === 0 });
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [call.phase]);

  const status =
    call.phase === "dialing"
      ? "Calling…"
      : call.phase === "ringing"
        ? "Ringing…"
        : call.phase === "connected"
          ? formatCallDuration(call.elapsed)
          : call.phase === "incoming"
            ? `Incoming ${type} call`
            : "Call ended";

  return (
    <main className="relative isolate flex h-dvh flex-col overflow-hidden bg-[#08080B]">
      {/* ambient backdrop */}
      <div aria-hidden className="absolute inset-0">
        <motion.div
          className="absolute left-1/2 top-[-10%] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,92,122,0.30),transparent_65%)] blur-3xl"
          animate={{ scale: call.phase === "connected" ? [1, 1.06, 1] : 1 }}
          transition={{ duration: 5, repeat: Infinity }}
        />
        {type === "video" && (
          <div className="absolute inset-0 bg-[linear-gradient(160deg,#1A1A22,#0B0B0F_60%)] opacity-70" />
        )}
      </div>

      {authMode === "local" && (
        <div className="relative z-20 mx-auto mt-4 w-fit rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[10.5px] text-text-muted/80 backdrop-blur">
          Simulated call · media not connected
        </div>
      )}

      <div className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 safe-t">
        <div className="relative mb-7 flex items-center justify-center">
          {(call.phase === "dialing" || call.phase === "ringing" || call.phase === "incoming") && (
            <>
              {[0, 1].map((i) => (
                <motion.span
                  key={i}
                  className="absolute h-32 w-32 rounded-full border border-rose/30"
                  animate={{ scale: [1, 1.9], opacity: [0.5, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: i * 1.2, ease: "easeOut" }}
                />
              ))}
            </>
          )}
          <Avatar
            avatarId={conversation?.avatarId ?? null}
            name={name}
            size="lg"
            className="scale-[1.6]"
          />
        </div>

        <h1 className="mt-10 text-[26px] font-semibold tracking-[-0.02em]">{name}</h1>
        <p
          className={cn(
            "mt-1.5 text-[13.5px] tabular-nums",
            call.phase === "connected" ? "text-success" : "text-text-muted"
          )}
        >
          {status}
        </p>

        {type === "video" && call.phase === "connected" && (
          <div className="mt-8 w-full max-w-md">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[24px] border border-white/[0.07] bg-[#121217]">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,92,122,0.16),transparent_60%)]" />
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-text-muted">
                <VideoOff className="h-6 w-6" />
                <p className="text-[12px]">Their camera is off</p>
              </div>

              {/* local preview */}
              <div className="absolute bottom-3 right-3 flex h-28 w-20 flex-col items-center justify-center gap-1 rounded-2xl border border-white/10 bg-[#1C1C24]/95 shadow-card">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-rose/15 text-[12px] font-semibold text-rose">
                  You
                </span>
                <span className="text-[9.5px] text-text-muted">{call.cameraOn ? "Camera on" : "Camera off"}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md px-6 pb-8 safe-b">
        {call.phase === "incoming" ? (
          <div className="flex items-center justify-around">
            <CallAction label="Decline" variant="decline" onClick={() => finish(call.decline())}>
              <PhoneOff className="h-6 w-6" />
            </CallAction>
            <CallAction
              label="Accept"
              variant="accept"
              onClick={call.accept}
              pulse
            >
              {type === "video" ? <VideoIcon className="h-6 w-6" /> : <Phone className="h-6 w-6" />}
            </CallAction>
          </div>
        ) : (
          <>
            <div className="mb-5 flex items-center justify-center gap-3">
              <RoundControl
                active={!call.muted}
                onClick={() => call.setMuted((m) => !m)}
                label={call.muted ? "Unmute" : "Mute"}
              >
                {call.muted ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
              </RoundControl>

              <RoundControl
                active={!call.speaker}
                onClick={() => call.setSpeaker((s) => !s)}
                label={call.speaker ? "Speaker off" : "Speaker"}
              >
                {call.speaker ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
              </RoundControl>

              {type === "video" && (
                <>
                  <RoundControl
                    active={!call.cameraOn}
                    onClick={() => call.setCameraOn((c) => !c)}
                    label={call.cameraOn ? "Camera off" : "Camera on"}
                  >
                    {call.cameraOn ? <VideoIcon className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                  </RoundControl>
                  <RoundControl
                    active
                    onClick={() => call.setFrontCamera((f) => !f)}
                    label="Flip camera"
                  >
                    <RotateCcw className="h-5 w-5" />
                  </RoundControl>
                </>
              )}
            </div>

            <div className="flex justify-center">
              <CallAction
                label="End"
                variant="decline"
                onClick={() => {
                  const info = call.end();
                  finish(info);
                }}
              >
                <PhoneOff className="h-6 w-6" />
              </CallAction>
            </div>
          </>
        )}

        <p className="mt-6 text-center text-[11px] text-text-muted/50">
          Calls are only ever between the two of you.
        </p>
      </div>
    </main>
  );
}

function RoundControl({
  children,
  label,
  active,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-full border transition-colors",
        active
          ? "border-white/10 bg-white/[0.08] text-text hover:bg-white/[0.12]"
          : "border-transparent bg-white text-[#0B0B0F]"
      )}
    >
      {children}
    </button>
  );
}

function CallAction({
  children,
  label,
  variant,
  onClick,
  pulse,
}: {
  children: React.ReactNode;
  label: string;
  variant: "accept" | "decline";
  onClick: () => void;
  pulse?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <motion.button
        type="button"
        onClick={onClick}
        aria-label={label}
        animate={pulse ? { scale: [1, 1.06, 1] } : undefined}
        transition={pulse ? { duration: 1.6, repeat: Infinity } : undefined}
        whileTap={{ scale: 0.94 }}
        className={cn(
          "flex h-[68px] w-[68px] items-center justify-center rounded-full text-[#0B0B0F] shadow-[0_16px_40px_-14px_rgba(0,0,0,0.9)]",
          variant === "accept" ? "bg-success" : "bg-rose"
        )}
      >
        {children}
      </motion.button>
      <span className="text-[11px] text-text-muted">{label}</span>
    </div>
  );
}

export default function CallPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { kind?: string; direction?: string };
}) {
  const type = searchParams.kind === "video" ? "video" : "voice";
  const direction = searchParams.direction === "incoming" ? "incoming" : "outgoing";

  // Live calls render in the global overlay; this route just kicks one off.
  if (authMode === "supabase") {
    return (
      <AppGuard>
        <LiveCallLauncher conversationId={params.id} type={type} />
      </AppGuard>
    );
  }

  return (
    <AppGuard>
      <CallScreen direction={direction} type={type} />
    </AppGuard>
  );
}
