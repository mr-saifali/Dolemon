"use client";

/**
 * Message tones with no audio files: two short sine blips through WebAudio.
 * Created lazily and reused — a new AudioContext per message leaks on iOS.
 */
let context: AudioContext | null = null;

function ctx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!context) context = new Ctor();
  if (context.state === "suspended") void context.resume().catch(() => undefined);
  return context;
}

function blip(audio: AudioContext, at: number, frequency: number, gain: number) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + 0.16);
  osc.connect(amp).connect(audio.destination);
  osc.start(at);
  osc.stop(at + 0.18);
}

/** Rising two-note chime for an incoming message. */
export function playMessageTone() {
  const audio = ctx();
  if (!audio) return;
  const now = audio.currentTime;
  blip(audio, now, 660, 0.05);
  blip(audio, now + 0.09, 880, 0.04);
}

/** Lower, longer pair for a call invite. */
export function playRingTone() {
  const audio = ctx();
  if (!audio) return;
  const now = audio.currentTime;
  for (let i = 0; i < 2; i += 1) {
    blip(audio, now + i * 0.5, 520, 0.05);
    blip(audio, now + i * 0.5 + 0.16, 440, 0.04);
  }
}
