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

/** A glockenspiel-style note: triangle body + a soft octave sparkle. */
function bell(audio: AudioContext, at: number, frequency: number, dur: number, gain: number) {
  const main = audio.createOscillator();
  const amp = audio.createGain();
  main.type = "triangle";
  main.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.015);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  main.connect(amp).connect(audio.destination);
  main.start(at);
  main.stop(at + dur + 0.05);

  const sparkle = audio.createOscillator();
  const sAmp = audio.createGain();
  sparkle.type = "sine";
  sparkle.frequency.value = frequency * 2;
  sAmp.gain.setValueAtTime(0.0001, at);
  sAmp.gain.exponentialRampToValueAtTime(gain * 0.22, at + 0.012);
  sAmp.gain.exponentialRampToValueAtTime(0.0001, at + dur * 0.6);
  sparkle.connect(sAmp).connect(audio.destination);
  sparkle.start(at);
  sparkle.stop(at + dur * 0.6 + 0.05);
}

function bassNote(audio: AudioContext, at: number, frequency: number, dur: number, gain: number) {
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.05);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(audio.destination);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/**
 * The app's opening jingle — about 10 seconds of a bright, bouncy,
 * pentatonic little tune (an original Dolemon motif, not a recording).
 * Synthesised on the fly: zero bytes of audio, works fully offline.
 */
export function playIntroJingle() {
  const audio = ctx();
  if (!audio) return;
  const now = audio.currentTime + 0.05;
  const step = 0.24; // one eighth-note at ~125 bpm
  const mel = (slot: number, freq: number, dur = 0.22, gain = 0.05) => bell(audio, now + slot * step, freq, dur, gain);

  // phrase A — the rising bounce
  mel(0, 523.25); mel(1, 659.25); mel(2, 783.99); mel(3, 1046.5);
  mel(4, 659.25); mel(5, 783.99); mel(6, 1046.5); mel(7, 1318.51);
  // phrase B — the playful tumble
  mel(8, 783.99); mel(9, 659.25); mel(10, 523.25); mel(11, 659.25);
  mel(12, 440.0); mel(13, 523.25); mel(14, 659.25); mel(15, 880.0);
  // phrase C — the variation
  mel(16, 523.25); mel(17, 659.25); mel(18, 783.99); mel(19, 1046.5);
  mel(20, 659.25); mel(21, 783.99); mel(22, 1046.5); mel(23, 1318.51, 0.4);
  // phrase D — the lift
  mel(24, 587.33); mel(25, 698.46); mel(26, 880.0); mel(27, 1174.66);
  mel(28, 987.77); mel(29, 880.0); mel(30, 698.46); mel(31, 587.33);
  // the landing
  mel(32, 659.25); mel(33, 783.99); mel(34, 1046.5); mel(35, 1318.51, 0.7, 0.055);
  // the closing double-bell
  bell(audio, now + 38 * step, 1318.51, 1.3, 0.045);
  bell(audio, now + 38 * step, 1046.5, 1.3, 0.03);

  // soft roots under each phrase
  bassNote(audio, now, 130.81, 1.7, 0.028);
  bassNote(audio, now + 8 * step, 196.0, 1.7, 0.028);
  bassNote(audio, now + 16 * step, 130.81, 1.7, 0.028);
  bassNote(audio, now + 24 * step, 146.83, 1.7, 0.028);
  bassNote(audio, now + 32 * step, 130.81, 2.4, 0.028);
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
