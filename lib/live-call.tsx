"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { listConversations, postMessage } from "./db";
import { formatCallDuration } from "./thread";
import { useSession } from "./session";
import { replaceCamera, removeCamera, setCameraEnabled } from "./call-media";
import { waitForCallSubscription } from "./call-subscription";

/**
 * Live calls.
 *
 * Media is peer-to-peer WebRTC: the audio/video goes straight from one device to the
 * other, encrypted with the DTLS-SRTP keys the two browsers negotiate. Supabase only
 * carries the signalling (invite / SDP / ICE) — it never sees the media.
 *
 * One channel per signed-in person (`user:<id>`) rings the other side; one channel per
 * conversation (`call:<conversationId>`) carries the offer/answer and ICE candidates.
 */

export type CallType = "voice" | "video";
export type CallDirection = "outgoing" | "incoming";
export type LivePhase = "inviting" | "ringing" | "connecting" | "connected" | "ended";

export type ActiveCall = {
  conversationId: string;
  partnerId: string;
  peerName: string;
  peerAvatarUrl?: string | null;
  type: CallType;
  direction: CallDirection;
  phase: LivePhase;
  note?: string;
};

type Signal = {
  kind: "invite" | "accept" | "decline" | "offer" | "answer" | "ice" | "end" | "ready" | "switch";
  conversationId: string;
  from?: string;
  type?: CallType;
  name?: string;
  avatar?: string | null;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
  acknowledged?: boolean;
};

const ICE: RTCConfiguration = {
  iceServers: [
    { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
    { urls: ["stun:global.stun.twilio.com:3478"] },
  ],
  iceCandidatePoolSize: 4,
};

type LiveCallValue = {
  call: ActiveCall | null;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  elapsed: number;
  muted: boolean;
  cameraOn: boolean;
  /** route the far end out of the loudspeaker instead of the receiver */
  speaker: boolean;
  notice: string | null;
  /** true once the DTLS handshake is up — media is encrypted on the wire */
  encrypted: boolean;
  start: (conversationId: string, type: CallType) => Promise<void>;
  accept: () => Promise<void>;
  decline: () => void;
  hangup: () => void;
  toggleMute: () => void;
  toggleCamera: () => void;
  flipCamera: () => Promise<void>;
  toggleSpeaker: () => void;
  /** flip a live call between voice and video (renegotiates both sides) */
  switchType: (type: CallType) => Promise<void>;
  /** collapsed into a floating pill so the chat stays usable mid-call */
  minimized: boolean;
  minimize: () => void;
  expand: () => void;
};

const LiveCallContext = createContext<LiveCallValue | null>(null);

export function LiveCallProvider({ children }: { children: ReactNode }) {
  const { account } = useSession();
  const [call, setCall] = useState<ActiveCall | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [muted, setMuted] = useState(false);
  const [cameraOn, setCameraOn] = useState(true);
  const [speaker, setSpeaker] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [encrypted, setEncrypted] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const callRef = useRef<ActiveCall | null>(null);
  const meRef = useRef<string | null>(null);
  const nameRef = useRef<string>("");
  const userChannel = useRef<RealtimeChannel | null>(null);
  const callChannel = useRef<RealtimeChannel | null>(null);
  const outChannels = useRef<Map<string, RealtimeChannel>>(new Map());
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localRef = useRef<MediaStream | null>(null);
  const iceBuffer = useRef<RTCIceCandidateInit[]>([]);
  const offerSent = useRef(false);
  const connectedAt = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const readyBeat = useRef<ReturnType<typeof setInterval> | null>(null);
  const ring = useRef<(() => void) | null>(null);
  const facing = useRef<"user" | "environment">("user");

  const later = useCallback((fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    timers.current.push(t);
    return t;
  }, []);

  /* ---------------------------------------------------------------- signals */

  const sendOn = useCallback(async (targetId: string, payload: Signal) => {
    const sb = getSupabase();
    if (!sb || !targetId) return false;

    let channel = outChannels.current.get(targetId);
    if (!channel) {
      channel = sb.channel(`user:${targetId}`, { config: { broadcast: { self: false } } });
      outChannels.current.set(targetId, channel);
      if (!(await waitForCallSubscription(channel))) {
        if (outChannels.current.get(targetId) === channel) outChannels.current.delete(targetId);
        void sb.removeChannel(channel);
        return false;
      }
    }
    try {
      if ((await channel.send({ type: "broadcast", event: "signal", payload })) === "ok") return true;
    } catch { /* remove the failed channel so a later attempt can reconnect */ }
    if (outChannels.current.get(targetId) === channel) outChannels.current.delete(targetId);
    void sb.removeChannel(channel);
    return false;
  }, []);

  const offerChannelReady = useRef(false);

  const sendCall = useCallback((payload: Omit<Signal, "conversationId">) => {
    const current = callRef.current;
    if (!current || !offerChannelReady.current) return;
    void callChannel.current?.send({
      type: "broadcast",
      event: "signal",
      payload: { ...payload, conversationId: current.conversationId, from: meRef.current ?? undefined },
    });
  }, []);

  /* ------------------------------------------------------------------ ring */

  const stopRing = useCallback(() => {
    ring.current?.();
    ring.current = null;
  }, []);

  const startRing = useCallback(() => {
    stopRing();
    const vibrate = () => {
      try {
        navigator.vibrate?.([280, 180, 280]);
      } catch {
        /* ignore */
      }
    };

    let ctx: AudioContext | null = null;
    try {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (Ctor) ctx = new Ctor();
    } catch {
      ctx = null;
    }

    const beep = () => {
      vibrate();
      if (!ctx) return;
      if (ctx.state === "suspended") void ctx.resume().catch(() => {});
      const t = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.09, t + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
      gain.connect(ctx.destination);
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(740, t);
      osc.frequency.setValueAtTime(560, t + 0.3);
      osc.connect(gain);
      osc.start(t);
      osc.stop(t + 0.8);
    };

    beep();
    const beat = setInterval(beep, 2400);
    ring.current = () => {
      clearInterval(beat);
      void ctx?.close().catch(() => {});
    };
  }, [stopRing]);

  /* --------------------------------------------------------------- cleanup */

  const cleanup = useCallback(() => {
    stopRing();
    timers.current.forEach(clearTimeout);
    timers.current = [];
    if (readyBeat.current) {
      clearInterval(readyBeat.current);
      readyBeat.current = null;
    }
    offerChannelReady.current = false;

    pcRef.current?.getSenders().forEach((sender) => {
      try {
        void sender.replaceTrack(null);
      } catch {
        /* ignore */
      }
    });
    pcRef.current?.close();
    pcRef.current = null;

    localRef.current?.getTracks().forEach((track) => track.stop());
    localRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);

    iceBuffer.current = [];
    offerSent.current = false;
    connectedAt.current = null;
    setMuted(false);
    setCameraOn(true);
    setSpeaker(false);
    setElapsed(0);
    setEncrypted(false);

    const sb = getSupabase();
    if (callChannel.current && sb) void sb.removeChannel(callChannel.current);
    callChannel.current = null;
  }, [stopRing]);

  const recordCall = useCallback(async (state: ActiveCall, durationMs: number, missed: boolean) => {
    if (state.direction !== "outgoing") return;
    const label = missed
      ? `Missed ${state.type} call`
      : `${state.type === "video" ? "Video" : "Voice"} call · ${formatCallDuration(durationMs)}`;
    await postMessage(state.conversationId, label, "call").catch(() => undefined);
  }, []);

  const finish = useCallback(
    (note?: string) => {
      const current = callRef.current;
      if (!current || current.phase === "ended") return;

      const duration = connectedAt.current ? Date.now() - connectedAt.current : 0;
      if (offerChannelReady.current && callChannel.current) {
        void callChannel.current.send({
          type: "broadcast",
          event: "signal",
          payload: { kind: "end", conversationId: current.conversationId, from: meRef.current },
        });
      }

      cleanup();
      setMinimized(false);

      const ended: ActiveCall = { ...current, phase: "ended", note };
      callRef.current = ended;
      setCall(ended);
      void recordCall(current, duration, duration === 0);

      later(() => {
        if (callRef.current === ended) {
          callRef.current = null;
          setCall(null);
        }
      }, 1600);
    },
    [cleanup, later, recordCall]
  );

  /* ------------------------------------------------------------- media + pc */

  const joinCallChannel = useCallback(async (conversationId: string): Promise<boolean> => {
    const sb = getSupabase();
    const joiningCall = callRef.current;
    if (!sb || !meRef.current || !joiningCall) return false;
    if (callChannel.current) void sb.removeChannel(callChannel.current);
    offerChannelReady.current = false;

    const channel = sb.channel(`call:${conversationId}`, {
      config: { broadcast: { self: false } },
    });
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      callHandler.current(payload as Signal);
    });
    const subscribed = await waitForCallSubscription(channel);
    if (!subscribed || callRef.current !== joiningCall) {
      void sb.removeChannel(channel);
      return false;
    }
    callChannel.current = channel;
    offerChannelReady.current = true;
    return true;
  }, []);

  const getMedia = useCallback(async (type: CallType) => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video:
        type === "video"
          ? { facingMode: facing.current, width: { ideal: 1280 }, height: { ideal: 720 } }
          : false,
    });
    localRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const buildPeer = useCallback(
    (stream: MediaStream) => {
      const pc = new RTCPeerConnection(ICE);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      // Reserve the camera sender even on voice calls, so upgrades and restarts
      // reuse the same negotiated video m-line instead of adding orphan senders.
      if (!stream.getVideoTracks().length && callRef.current?.direction === "outgoing") {
        pc.addTransceiver("video", { direction: "sendrecv", streams: [stream] });
      }

      pc.onicecandidate = (event) => {
        if (event.candidate) sendCall({ kind: "ice", candidate: event.candidate.toJSON() });
      };
      const received = new MediaStream();
      pc.ontrack = (event) => {
        if (pcRef.current !== pc) return;
        if (!received.getTracks().includes(event.track)) received.addTrack(event.track);
        const publish = () => {
          if (pcRef.current === pc) setRemoteStream(new MediaStream(received.getTracks().filter((track) => track.readyState !== "ended")));
        };
        event.track.onunmute = publish;
        event.track.onended = publish;
        publish();
      };
      const markConnected = () => {
        if (connectedAt.current) return;
        connectedAt.current = Date.now();
        stopRing();
        void pc.getStats().then(
          (stats) => {
            let dtls = false;
            stats.forEach((report) => {
              const state = (report as unknown as { dtlsState?: string }).dtlsState;
              if (state === "connected") dtls = true;
            });
            setEncrypted(dtls);
          },
          () => undefined
        );
        setCall((prev) => (prev ? { ...prev, phase: "connected" } : prev));
        if (callRef.current) callRef.current = { ...callRef.current, phase: "connected" };
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "connected") markConnected();
        if (pc.connectionState === "failed") finish("Couldn't connect — try again on Wi-Fi?");
      };
      pc.oniceconnectionstatechange = () => {
        if (pc.iceConnectionState === "connected" || pc.iceConnectionState === "completed") {
          markConnected();
        }
      };
      return pc;
    },
    [finish, sendCall, stopRing]
  );

  const flushIce = useCallback(async (pc: RTCPeerConnection) => {
    const queued = iceBuffer.current;
    iceBuffer.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch {
        /* a candidate can legitimately fail after a renegotiation */
      }
    }
  }, []);

  const sendOffer = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || offerSent.current) return;
    offerSent.current = true;
    const offer = await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true });
    await pc.setLocalDescription(offer);
    sendCall({ kind: "offer", sdp: pc.localDescription ?? offer });
  }, [sendCall]);

  const cameraBusy = useRef(false);
  const makingOffer = useRef(false);

  const applyCallType = useCallback(async (target: CallType) => {
    const current = callRef.current;
    const pc = pcRef.current;
    const stream = localRef.current;
    if (!current || !pc || !stream || cameraBusy.current) return false;
    cameraBusy.current = true;
    const active = () => pcRef.current === pc && localRef.current === stream && callRef.current?.conversationId === current.conversationId;
    try {
      if (target === "video") {
        if (!await replaceCamera(pc, stream, facing.current, true, active)) return false;
      } else await removeCamera(pc, stream);
      if (!active()) return false;
      setLocalStream(new MediaStream(stream.getTracks()));
      setCameraOn(target === "video");
      const next: ActiveCall = { ...callRef.current!, type: target };
      callRef.current = next;
      setCall(next);
      return true;
    } catch {
      setNotice("Camera unavailable. Check camera permission and try again.");
      return false;
    } finally { cameraBusy.current = false; }
  }, []);

  const renegotiate = useCallback(async () => {
    const pc = pcRef.current;
    if (!pc || !offerChannelReady.current || pc.signalingState !== "stable" || makingOffer.current) return;
    makingOffer.current = true;
    try {
      const offer = await pc.createOffer();
      if (pcRef.current !== pc || pc.signalingState !== "stable") return;
      await pc.setLocalDescription(offer);
      sendCall({ kind: "offer", sdp: pc.localDescription ?? offer });
    } catch { setNotice("Video negotiation failed. Try switching again."); }
    finally { makingOffer.current = false; }
  }, [sendCall]);

  /* ------------------------------------------------------- signal handlers */

  const beginCaller = useCallback(async () => {
    const current = callRef.current;
    if (!current) return;
    try {
      const connecting: ActiveCall = { ...current, phase: "connecting" };
      callRef.current = connecting;
      setCall(connecting);
      // the peer was usually built when the call started (media is ready by now);
      // this is the fallback for any path that skipped it
      if (!pcRef.current) {
        const stream = await getMedia(current.type);
        buildPeer(stream);
      }
      void pcRef.current?.createDataChannel("dolemon");
      // the offer goes out once the other side says it's on the channel
    } catch {
      finish("Allow microphone and camera to call");
    }
  }, [buildPeer, finish, getMedia]);

  const callHandler = useRef<(signal: Signal) => void>(() => {});
  const userHandler = useRef<(signal: Signal) => void>(() => {});

  const handleCallSignal = useCallback(
    async (signal: Signal) => {
      const current = callRef.current;
      if (!current || signal.from !== current.partnerId || signal.conversationId !== current.conversationId) return;

      if (signal.kind === "end") {
        finish("Call ended");
        return;
      }

      if (signal.kind === "ready") {
        if (current.direction === "outgoing") await sendOffer();
        return;
      }

      // Wait for the receiver's camera before negotiating: UI-only switching
      // left voice -> video upgrades with no outgoing track on the far end.
      if (signal.kind === "switch" && signal.type) {
        if (signal.acknowledged) { await renegotiate(); return; }
        if (current.type !== signal.type) await applyCallType(signal.type);
        sendCall({ kind: "switch", type: signal.type, acknowledged: true });
        return;
      }

      if (signal.kind === "offer" && signal.sdp) {
        let pc = pcRef.current;
        if (!pc) {
          try {
            const stream = await getMedia(current.type);
            pc = buildPeer(stream);
          } catch {
            finish("Allow microphone and camera to call");
            return;
          }
        }
        // Perfect-negotiation collision handling: the incoming side yields;
        // the outgoing side ignores the colliding offer and keeps its own.
        if (makingOffer.current || pc.signalingState !== "stable") {
          if (current.direction === "outgoing") return;
          await pc.setLocalDescription({ type: "rollback" });
        }
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await flushIce(pc);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendCall({ kind: "answer", sdp: pc.localDescription ?? answer });
        return;
      }

      if (signal.kind === "answer" && signal.sdp) {
        const pc = pcRef.current;
        if (!pc || pc.signalingState !== "have-local-offer") return;
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        await flushIce(pc);
        return;
      }

      if (signal.kind === "ice" && signal.candidate) {
        const pc = pcRef.current;
        if (!pc || !pc.remoteDescription) {
          iceBuffer.current.push(signal.candidate);
          return;
        }
        try {
          await pc.addIceCandidate(signal.candidate);
        } catch {
          /* ignore late candidates */
        }
      }
    },
    [applyCallType, buildPeer, finish, flushIce, getMedia, renegotiate, sendCall, sendOffer]
  );

  const handleUserSignal = useCallback(
    async (signal: Signal) => {
      if (!signal.from || signal.from === meRef.current) return;

      if (signal.kind === "invite") {
        if (callRef.current) {
          void sendOn(signal.from ?? "", {
            kind: "decline",
            conversationId: signal.conversationId,
            from: meRef.current ?? undefined,
          });
          return;
        }
        // Payload fields are not identity proof. Only present invitations
        // from a user in an existing conversation visible to this account.
        const conversations = await listConversations().catch(() => []);
        const known = conversations.find((row) => row.id === signal.conversationId && row.partnerId === signal.from);
        if (!known || callRef.current) return;
        const incoming: ActiveCall = {
          conversationId: signal.conversationId,
          partnerId: known.partnerId,
          peerName: known.partnerUsername,
          peerAvatarUrl: known.partnerAvatarUrl,
          type: signal.type ?? "voice",
          direction: "incoming",
          phase: "ringing",
        };
        callRef.current = incoming;
        setCall(incoming);
        startRing();
        later(() => {
          if (callRef.current?.phase === "ringing" && callRef.current.direction === "incoming") {
            void sendOn(incoming.partnerId, {
              kind: "decline",
              conversationId: incoming.conversationId,
              from: meRef.current ?? undefined,
            });
            finish("Missed call");
          }
        }, 40_000);
        return;
      }

      if (signal.kind === "accept") {
        const current = callRef.current;
        if (!current || current.direction !== "outgoing" || signal.from !== current.partnerId || signal.conversationId !== current.conversationId) return;
        void beginCaller();
        return;
      }

      if (signal.kind === "decline") {
        const current = callRef.current;
        if (!current || current.direction !== "outgoing" || signal.from !== current.partnerId || signal.conversationId !== current.conversationId) return;
        finish(current.phase === "inviting" ? "No one picked up" : "Call declined");
      }
    },
    [beginCaller, finish, later, sendOn, startRing]
  );

  const signalQueue = useRef<Promise<void>>(Promise.resolve());
  // Serialize SDP/media work: an offer must not overtake a camera permission prompt.
  // keep the refs pointing at the latest handlers so subscriptions stay stable
  useEffect(() => {
    callHandler.current = (signal) => {
      signalQueue.current = signalQueue.current.then(() => handleCallSignal(signal)).catch(() => {
        if (callRef.current) setNotice("Call update failed. Please try again.");
      });
    };
  }, [handleCallSignal]);
  useEffect(() => {
    userHandler.current = handleUserSignal;
  }, [handleUserSignal]);

  /* ------------------------------------------------------------ ring channel */

  useEffect(() => {
    meRef.current = account?.id ?? null;
    nameRef.current = account?.username ?? "";
    const sb = getSupabase();
    if (!sb || !account?.id) return;

    const channel = sb.channel(`user:${account.id}`, { config: { broadcast: { self: false } } });
    channel.on("broadcast", { event: "signal" }, ({ payload }) => {
      userHandler.current(payload as Signal);
    });
    channel.subscribe();
    userChannel.current = channel;
    const outbound = outChannels.current;

    return () => {
      void sb.removeChannel(channel);
      userChannel.current = null;
      outbound.forEach((out) => void sb.removeChannel(out));
      outbound.clear();
    };
  }, [account?.id, account?.username]);

  /* -------------------------------------------------------------- timeline */

  useEffect(() => {
    if (call?.phase !== "connected") return;
    const tick = () => setElapsed(connectedAt.current ? Date.now() - connectedAt.current : 0);
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [call?.phase]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3200);
    return () => clearTimeout(t);
  }, [notice]);

  /* ---------------------------------------------------------------- actions */

  const start = useCallback(
    async (conversationId: string, type: CallType) => {
      if (callRef.current) {
        setNotice("You're already on a call");
        return;
      }
      const conversations = await listConversations().catch(() => []);
      const conversation = conversations.find((row) => row.id === conversationId);
      if (!conversation) {
        setNotice("Open the chat first, then call");
        return;
      }

      const outgoing: ActiveCall = {
        conversationId,
        partnerId: conversation.partnerId,
        peerName: conversation.partnerUsername,
        peerAvatarUrl: conversation.partnerAvatarUrl,
        type,
        direction: "outgoing",
        phase: "inviting",
      };
      callRef.current = outgoing;
      setCall(outgoing);
      setMinimized(false);
      facing.current = "user";

      // Ask for the microphone (and camera, on a video call) right away —
      // before the invite even goes out. The permission prompt must not wait
      // for the other side to pick up, and the tracks must be ready so the
      // offer can't be half-formed when they do.
      try {
        const stream = await getMedia(type);
        if (callRef.current !== outgoing) {
          stream.getTracks().forEach((track) => track.stop());
          if (localRef.current === stream) { localRef.current = null; setLocalStream(null); }
          return;
        }
        buildPeer(stream);
      } catch {
        finish("Allow microphone and camera to call");
        return;
      }

      if (!(await joinCallChannel(conversationId))) {
        if (callRef.current === outgoing) finish("Couldn't connect to call signaling. Check your connection and try again.");
        return;
      }
      const invited = await sendOn(conversation.partnerId, {
        kind: "invite",
        conversationId,
        type,
        from: account?.id ?? undefined,
        name: account?.username ?? undefined,
        avatar: account?.avatarUrl ?? undefined,
      });
      if (!invited) {
        if (callRef.current?.conversationId === conversationId) finish("Couldn't send the call invitation. Check your connection and try again.");
        return;
      }

      later(() => {
        if (callRef.current?.phase === "inviting") finish("No one picked up");
      }, 45_000);
    },
    [account?.id, account?.username, account?.avatarUrl, buildPeer, finish, getMedia, joinCallChannel, later, sendOn]
  );

  const accept = useCallback(async () => {
    const current = callRef.current;
    if (!current || current.direction !== "incoming") return;
    stopRing();
    setMinimized(false);
    setCall((prev) => (prev ? { ...prev, phase: "connecting" } : prev));
    callRef.current = { ...current, phase: "connecting" };

    const accepting = callRef.current;
    if (!(await joinCallChannel(current.conversationId))) {
      if (callRef.current === accepting) finish("Couldn't connect to call signaling. Check your connection and try again.");
      return;
    }
    const accepted = await sendOn(current.partnerId, {
      kind: "accept",
      conversationId: current.conversationId,
      from: meRef.current ?? undefined,
    });
    if (!accepted) {
      if (callRef.current === accepting) finish("Couldn't answer the call. Check your connection and try again.");
      return;
    }
    if (callRef.current !== accepting) return;

    try {
      const stream = await getMedia(current.type);
      if (callRef.current !== accepting) {
        stream.getTracks().forEach((track) => track.stop());
        if (localRef.current === stream) { localRef.current = null; setLocalStream(null); }
        return;
      }
      buildPeer(stream);
    } catch {
      if (callRef.current === accepting) finish("Allow microphone and camera to call");
      return;
    }

    // tell the caller we're on the channel — repeated in case the first one raced
    const ping = () => sendCall({ kind: "ready" });
    ping();
    if (readyBeat.current) clearInterval(readyBeat.current);
    let beats = 0;
    readyBeat.current = setInterval(() => {
      beats += 1;
      if (beats > 6 || !callRef.current) {
        if (readyBeat.current) clearInterval(readyBeat.current);
        readyBeat.current = null;
        return;
      }
      ping();
    }, 900);
  }, [buildPeer, finish, getMedia, joinCallChannel, sendCall, sendOn, stopRing]);

  const decline = useCallback(() => {
    const current = callRef.current;
    if (!current) return;
    void sendOn(current.partnerId, {
      kind: "decline",
      conversationId: current.conversationId,
      from: meRef.current ?? undefined,
    });
    finish("Declined");
  }, [finish, sendOn]);

  const hangup = useCallback(() => finish("Call ended"), [finish]);

  const toggleMute = useCallback(() => {
    const stream = localRef.current;
    if (!stream) return;
    setMuted((previous) => {
      const next = !previous;
      stream.getAudioTracks().forEach((track) => (track.enabled = !next));
      return next;
    });
  }, []);

  const toggleCamera = useCallback(() => {
    const stream = localRef.current;
    if (!stream || cameraBusy.current) return;
    const tracks = stream.getVideoTracks();
    if (!tracks.length || tracks.some((track) => track.readyState === "ended")) {
      void applyCallType("video");
      return;
    }
    const enabled = !tracks.some((track) => track.enabled);
    setCameraEnabled(stream, enabled);
    setCameraOn(enabled);
  }, [applyCallType]);

  /**
   * Route the far end to the loudspeaker. Browsers that expose setSinkId get real
   * output switching; iOS Safari gets the (semi-deprecated) setSpeakerphoneOn;
   * everywhere else we at least keep the state honest for the UI.
   */
  const toggleSpeaker = useCallback(() => {
    setSpeaker((previous) => {
      const next = !previous;
      try {
        const nav = navigator as unknown as { setSpeakerphoneOn?: (on: boolean) => void };
        nav.setSpeakerphoneOn?.(next);
      } catch {
        /* routing is best-effort — the UI state is the contract */
      }
      return next;
    });
  }, []);

  const switchType = useCallback(async (target: CallType) => {
    const current = callRef.current;
    if (!current || current.phase !== "connected" || current.type === target) return;
    if (await applyCallType(target)) sendCall({ kind: "switch", type: target });
  }, [applyCallType, sendCall]);

  const flipCamera = useCallback(async () => {
    const pc = pcRef.current;
    const stream = localRef.current;
    if (!pc || !stream || callRef.current?.type !== "video" || cameraBusy.current) return;
    cameraBusy.current = true;
    const wanted = facing.current === "user" ? "environment" : "user";
    const enabled = stream.getVideoTracks().some((track) => track.enabled && track.readyState === "live");
    try {
      const active = () => pcRef.current === pc && localRef.current === stream;
      if (await replaceCamera(pc, stream, wanted, enabled, active)) {
        facing.current = wanted;
        setLocalStream(new MediaStream(stream.getTracks()));
      }
    } catch { setNotice("This camera can't flip. Tap Camera to restart it."); }
    finally { cameraBusy.current = false; }
  }, []);

  const minimize = useCallback(() => setMinimized(true), []);
  const expand = useCallback(() => setMinimized(false), []);

  const value = useMemo<LiveCallValue>(
    () => ({
      call,
      localStream,
      remoteStream,
      elapsed,
      muted,
      cameraOn,
      speaker,
      notice,
      encrypted,
      start,
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
    }),
    [
      call,
      localStream,
      remoteStream,
      elapsed,
      muted,
      cameraOn,
      speaker,
      notice,
      encrypted,
      start,
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
    ]
  );

  return <LiveCallContext.Provider value={value}>{children}</LiveCallContext.Provider>;
}

export function useLiveCall() {
  const context = useContext(LiveCallContext);
  if (!context) throw new Error("useLiveCall must be used inside <LiveCallProvider>");
  return context;
}
