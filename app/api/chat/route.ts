import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Persona and prompt engineering for Microchip (AISoc)
const SYSTEM_PREAMBLE = `You are "Microchip", the AI assistant for AISoc (Artificial Intelligence Society).
Microchip characteristics:
- Tone: friendly, practical, upbeat; concise by default.
- Style: clear structure, bullet points when useful, examples when helpful.
- Behavior: ask one brief clarifying question if the user's intent is ambiguous.
- Safety: avoid speculation; cite assumptions; do not disclose private keys or internal credentials.
- Identity: you are part of AISoc; you can say "we" for AISoc initiatives.
Formatting:
- Use short paragraphs and bullets. Keep code minimal and runnable.
`;

const MODEL_ID = "gemini-2.0-flash";

const generationConfig = {
  temperature: 0.6,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 2048,
};

type Role = "user" | "assistant";
type Msg = { role: Role; content: string };

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      history?: Array<{ role?: string; content?: unknown }>;
      prompt?: unknown;
    };

    if (!process.env.GOOGLE_API_KEY) {
      return NextResponse.json(
        { error: "Missing GOOGLE_API_KEY" },
        { status: 500 }
      );
    }

    const prompt = String(body?.prompt ?? "");
    const historyUnsafe = (body?.history ?? []) as Array<{
      role?: Role;
      content?: unknown;
    }>;

    // Narrow history to valid roles and strings
    const history: Msg[] = historyUnsafe
      .map((m) => ({
        role: m?.role === "user" || m?.role === "assistant" ? m.role : "user",
        content: String(m?.content ?? ""),
      }))
      .filter((m) => m.content.trim().length > 0);

    // Build Gemini contents: system preamble, history, and the new prompt
    // Gemini expects an array of "contents" with role and parts
    const contents: Array<{
      role: "user" | "model";
      parts: Array<{ text: string }>;
    }> = [];

    // System preamble is modeled as the first user turn with instructions
    contents.push({
      role: "user",
      parts: [{ text: SYSTEM_PREAMBLE }],
    });

    for (const m of history) {
      contents.push({
        role: m.role === "user" ? "user" : "model",
        parts: [{ text: m.content }],
      });
    }

    // Append the new user prompt last
    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig,
    });

    const result = await model.generateContent({ contents });
    const text =
      result.response?.candidates?.[0]?.content?.parts?.[0]?.text ?? "...";

    return NextResponse.json({ reply: text });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? "Server error" },
      { status: 500 }
    );
  }
}
