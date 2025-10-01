import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

// Same persona as non-streaming
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
      return new NextResponse("Missing GOOGLE_API_KEY", { status: 500 });
    }

    const prompt = String(body?.prompt ?? "");
    const historyUnsafe = (body?.history ?? []) as Array<{
      role?: Role;
      content?: unknown;
    }>;

    const history: Msg[] = historyUnsafe
      .map((m) => ({
        role: m?.role === "user" || m?.role === "assistant" ? m.role : "user",
        content: String(m?.content ?? ""),
      }))
      .filter((m) => m.content.trim().length > 0);

    const contents: Array<{
      role: "user" | "model";
      parts: Array<{ text: string }>;
    }> = [];

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

    contents.push({
      role: "user",
      parts: [{ text: prompt }],
    });

    const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);
    const model = genAI.getGenerativeModel({
      model: MODEL_ID,
      generationConfig,
    });

    const response = await model.generateContentStream({ contents });

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const send = (data: string) =>
          controller.enqueue(encoder.encode(`data: ${data}\n\n`));

        try {
          for await (const chunk of response.stream) {
            const text = chunk.text();
            if (text) send(JSON.stringify({ token: text }));
          }
          controller.enqueue(encoder.encode(`event: done\ndata: [DONE]\n\n`));
          controller.close();
        } catch (e: any) {
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({
                error: e?.message ?? "stream error",
              })}\n\n`
            )
          );
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Transfer-Encoding": "chunked",
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message ?? "Server error", { status: 500 });
  }
}
