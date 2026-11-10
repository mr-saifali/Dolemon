/** Enforce actual streamed bytes, not an attacker-controlled Content-Length. */
export class BodyReadError extends Error {
  constructor(public status: 400 | 408 | 413, message: string) { super(message); }
}
export async function readLimitedJson(request: Request, limit: number, timeoutMs = 5000): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > limit) throw new BodyReadError(413, "Body too large");
  if (!request.body) throw new BodyReadError(400, "Missing body");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new BodyReadError(408, "Body timeout")), timeoutMs); });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timeout]);
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new BodyReadError(413, "Body too large");
      chunks.push(value);
    }
    const joined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(joined));
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
