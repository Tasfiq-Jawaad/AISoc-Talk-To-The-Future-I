import { NextRequest } from "next/server";

interface Message {
  role: "user" | "system";
  content: string;
}

interface ChatRequest {
  messages: Message[];
  system_prompt?: string;
  model?: string;
  temperature?: number;
}

export async function POST(req: NextRequest) {
  const { messages, system_prompt, model, temperature }: ChatRequest =
    await req.json();

  const allMessages: Message[] = system_prompt
    ? [{ role: "system", content: system_prompt }, ...messages]
    : messages;

  const response = await fetch("http://localhost:11434/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "pirate-bot",
      messages: allMessages,
      stream: true,
      options: {
        temperature: temperature || 0.8,
      },
    }),
  });

  // Return the streaming response
  return new Response(response.body, {
    headers: { "Content-Type": "text/event-stream" },
  });
}
