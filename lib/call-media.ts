/** Null-track senders must remain reusable after switching to voice. */
export function videoSender(pc: RTCPeerConnection): RTCRtpSender | undefined {
  const matches = pc.getTransceivers().filter((item) => (item.sender.track?.kind === "video" || item.receiver.track.kind === "video"));
  const transceiver = matches.find((item) => item.mid !== null) ?? matches[0];
  if (transceiver) transceiver.direction = "sendrecv";
  return transceiver?.sender;
}

export function setCameraEnabled(stream: MediaStream, enabled: boolean) {
  stream.getVideoTracks().forEach((track) => { track.enabled = enabled; });
}

export async function replaceCamera(
  pc: RTCPeerConnection,
  stream: MediaStream,
  facing: "user" | "environment",
  enabled: boolean,
  stillActive: () => boolean,
): Promise<boolean> {
  const old = stream.getVideoTracks();
  const capture = () => navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false,
  });
  let fresh: MediaStream;
  try { fresh = await capture(); }
  catch (error) {
    // Many Android cameras cannot open a second lens until the first is released.
    if (!old.length || !stillActive() || !["NotReadableError", "AbortError"].includes((error as Error).name)) throw error;
    old.forEach((track) => track.stop());
    fresh = await capture();
  }
  try {
    if (!stillActive()) return false;
    const track = fresh.getVideoTracks()[0];
    if (!track) throw new Error("No camera track");
    track.enabled = enabled;
    const sender = videoSender(pc);
    if (sender) await sender.replaceTrack(track);
    else pc.addTrack(track, stream);
    if (!stillActive()) return false;
    old.forEach((item) => { stream.removeTrack(item); item.stop(); });
    stream.addTrack(track);
    return true;
  } finally {
    fresh.getTracks().forEach((track) => { if (!stream.getTracks().includes(track)) track.stop(); });
  }
}

export async function removeCamera(pc: RTCPeerConnection, stream: MediaStream) {
  const sender = videoSender(pc);
  if (sender) await sender.replaceTrack(null);
  stream.getVideoTracks().forEach((track) => { stream.removeTrack(track); track.stop(); });
}
