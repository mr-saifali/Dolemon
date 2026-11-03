import { NextResponse, type NextRequest } from "next/server";
import {
  ANALYZE_INSTRUCTIONS,
  ASK_INSTRUCTIONS,
  DOREMON_PERSONA,
  memoryForPrompt,
} from "@/lib/doremon/persona";

/**
 * Doremon's mind, server-side — the Gemini key never reaches the browser.
 *
 *   POST /api/doremon  { action: "analyze" | "ask", ... }
 *
 *   analyze → the compressed record update + fight/boring signals (JSON out)
 *   ask     → Doremon's chat answer to a /doremon message (text out)
 *
 * Model: GEMINI_MODEL (default gemini-2.5-flash — bump it to the newest
 * flash release whenever Google ships one).
 */

export const runtime = "nodejs";
export const maxDuration = 30;

type RequestBody = {
  action: "analyze" | "ask";
  me: string;
  partner: string;
  recent: { who: "me" | "them"; text: string }[];
  memory: unknown;
  question?: string;
};

const ok = (payload: unknown) => NextResponse.json(payload);

export async function POST(req: NextRequest) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: "NO_KEY" }, { status: 503 });
  }
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "BAD_BODY" }, { status: 400 });
  }

  if (body.action !== "analyze" && body.action !== "ask") {
    return NextResponse.json({ ok: false, error: "BAD_ACTION" }, { status: 400 });
  }

  const { system, user } = promptsFor(body);

  try {
    const raw = await generateContent(key, model, system, user, body.action === "analyze");
    if (body.action === "analyze") {
      const parsed = parseJson(raw);
      if (!parsed) throw new Error("unparseable analysis");
      return ok({ ok: true, analysis: parsed });
    }
    return ok({ ok: true, answer: raw.slice(0, 1200) });
  } catch (error) {
    console.error("[doremon] gemini failure:", error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "GEMINI" }, { status: 502 });
  }
}

function promptsFor(body: RequestBody): { system: string; user: string } {
  const transcript = body.recent
    .slice(-16)
    .map((m) => `${m.who === "me" ? body.me : body.partner}: ${m.text}`)
    .join("\n");

  const memoryBlock = memoryForPrompt(
    body.memory as Parameters<typeof memoryForPrompt>[0]
  );

  if (body.action === "analyze") {
    return {
      system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon working for the pair "${body.me}" and "${body.partner}".\n\n${ANALYZE_INSTRUCTIONS}`,
      user: `YOUR MEMORY SO FAR:\n${memoryBlock}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation is empty)"}`,
    };
  }

  const question = body.question?.trim() || "";
  return {
    system: `${DOREMON_PERSONA}\n\n---\nYou are Doremon, talking with the pair "${body.me}" and "${body.partner}" in their private chat. One of them is writing to you right now.\n\n${ASK_INSTRUCTIONS}`,
    user: `YOUR MEMORY OF THEM:\n${memoryBlock}\n\nRECENT MESSAGES (oldest → newest):\n${transcript || "(the conversation is empty)"}\n\n${
      question ? `THEY SAID: ${question}` : "They just wrote /doremon with no question — give a short check-in: what you noticed, what you remember, one small suggestion."
    }`,
  };
}

async function generateContent(
  key: string,
  model: string,
  system: string,
  user: string,
  wantJson: boolean
): Promise<string> {
  const generationConfig: Record<string, unknown> = {
    temperature: wantJson ? 0.3 : 0.9,
    maxOutputTokens: wantJson ? 700 : 400,
  };
  if (wantJson) generationConfig.responseMimeType = "application/json";

  const payload = {
    systemInstruction: { parts: [{ text: system }] },
    contents: [{ role: "user", parts: [{ text: user }] }],
    generationConfig,
  };

  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
  );
  url.searchParams.set("key", key);

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`gemini ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
  };
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts.map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("empty completion");
  return text;
}

/** Gemini sometimes wraps JSON in fences or prose — be forgiving. */
function parseJson(raw: string): Record<string, unknown> | null {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}
