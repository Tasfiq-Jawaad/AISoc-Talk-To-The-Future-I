"use client";

import { useRef, useState } from "react";

type Role = "user" | "assistant";
type Msg = { role: Role; content: string };

const MODEL_LABEL = "gemini-2.0-flash";

export default function Home() {
  const [messages, setMessages] = useState<Msg[]>([
    {
      role: "assistant",
      content:
        "Hi! I’m Microchip, AISoc’s friendly assistant. Ask me anything. Toggle streaming for real-time tokens.",
    },
  ]);
  const [input, setInput] = useState("");
  const [useStreaming, setUseStreaming] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  // Anchor used to scroll only when the user sends
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // Builds the request payload: history (all prior messages) and the new prompt
  function buildPayload(prompt: string) {
    // Exclude the new prompt from history. History is everything already in state.
    const history = messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return { history, prompt };
  }

  const sendNonStreaming = async (prompt: string) => {
    const payload = buildPayload(prompt);

    const res = await fetch("/api/chat", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });
    if (!res.ok) throw new Error("Request failed");

    const data: { reply?: string; error?: string } = await res.json();
    const reply = data.reply ?? "...";
    setMessages((m) => [...m, { role: "assistant", content: reply }]);
  };

  const sendStreaming = async (prompt: string) => {
    const payload = buildPayload(prompt);

    // Add an assistant placeholder to stream into (no scrolling here).
    setMessages((m) => [...m, { role: "assistant", content: "" }]);

    const res = await fetch("/api/chat/stream", {
      method: "POST",
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json" },
    });

    if (!res.ok || !res.body) {
      throw new Error("Stream request failed");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let assistantText = "";

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });

      const lines = chunk.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith("data: ")) {
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;
          try {
            const obj = JSON.parse(payload) as { token?: string };
            if (obj.token) {
              assistantText += obj.token;
              // Update only the last assistant message
              setMessages((prev) => {
                const next = [...prev];
                const lastIdx = next.length - 1;
                next[lastIdx] = {
                  ...next[lastIdx],
                  content: assistantText,
                };
                return next;
              });
            }
          } catch {
            // ignore parse errors for keep-alives
          }
        }
      }
    }
  };

  const onSend = async () => {
    const prompt = input.trim();
    if (!prompt || isLoading) return;

    setInput("");

    // Add the user message first, then scroll to it
    const nextMessages: Msg[] = [
      ...messages,
      { role: "user", content: prompt },
    ];
    setMessages(nextMessages);
    queueMicrotask(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });

    setIsLoading(true);
    try {
      if (useStreaming) {
        await sendStreaming(prompt);
      } else {
        await sendNonStreaming(prompt);
      }
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: "Sorry, something went wrong. Please try again in a moment.",
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <main
      className="relative flex min-h-[100dvh] flex-col bg-[#0a0a0a] text-gray-100 antialiased"
      style={
        {
          ["--header-h" as any]: "56px",
          ["--footer-h" as any]: "28px",
          ["--composer-h" as any]: "120px",
        } as React.CSSProperties
      }
    >
      {/* Header */}
      <header
        className="sticky top-0 z-20 flex h-[var(--header-h)] items-center border-b border-[#241617] bg-black/60 backdrop-blur-md"
        style={{ WebkitBackdropFilter: "blur(8px)" }}
      >
        <div className="mx-auto flex w-full max-w-4xl items-center justify-between px-4">
          <div className="relative">
            <div className="absolute -inset-1 rounded-lg bg-[radial-gradient(60%_120%_at_10%_0%,rgba(244,63,94,0.25),transparent_60%)] blur-md opacity-70" />
            <h1 className="relative z-10 select-none rounded-lg bg-black/60 px-3 py-1 text-base font-semibold tracking-wide text-[#f43f5e] shadow-[inset_0_0_0_1px_rgba(244,63,94,0.35)]">
              Microchip · AISoc
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden text-xs text-gray-400 sm:block">
              Model: {MODEL_LABEL}
            </div>
            <label className="group inline-flex cursor-pointer items-center gap-2 text-sm">
              <span className="text-gray-300">Streaming</span>
              <span
                className={`relative h-6 w-11 rounded-full transition-colors duration-200 ${
                  useStreaming ? "bg-[#f43f5e]" : "bg-[#1b1b1b]"
                }`}
                onClick={() => setUseStreaming((v) => !v)}
                role="switch"
                aria-checked={useStreaming}
              >
                <span
                  className={`absolute top-1/2 size-4 -translate-y-1/2 transform rounded-full bg-white shadow-sm transition-all duration-200 ${
                    useStreaming ? "left-[22px]" : "left-[6px]"
                  }`}
                />
              </span>
            </label>
          </div>
        </div>
      </header>

      {/* Chat container */}
      <section className="relative mx-auto w-full max-w-4xl flex-1 px-4">
        <div
          className="relative w-full overflow-hidden rounded-3xl border border-[#241617] bg-[#0b0b0b]/90"
          style={{
            minHeight:
              "calc(100dvh - var(--header-h) - var(--composer-h) - var(--footer-h) - 16px)",
            marginTop: "16px",
            marginBottom: "16px",
          }}
        >
          {/* Background accents */}
          <div
            className="pointer-events-none absolute inset-0 opacity-60"
            aria-hidden
          >
            <div className="absolute inset-0 bg-[radial-gradient(650px_500px_at_15%_0%,rgba(244,63,94,0.10),transparent_55%),radial-gradient(600px_450px_at_85%_10%,rgba(244,63,94,0.08),transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:28px_28px]" />
          </div>

          {/* Messages */}
          <div className="relative z-10 flex h-full flex-col">
            <div
              className="flex-1 space-y-4 overflow-y-auto p-4 md:p-6"
              style={{
                paddingBottom:
                  "calc(var(--composer-h) + env(safe-area-inset-bottom) + 16px)",
                height:
                  "calc(100dvh - var(--header-h) - var(--footer-h) - 16px - 16px)",
              }}
            >
              {messages.length === 0 && <EmptyState />}

              {messages.map((m, i) => (
                <Bubble key={i} role={m.role} content={m.content} />
              ))}

              {isLoading && <TypingIndicator />}

              {/* Spacer to keep last bubble above composer */}
              <div
                style={{
                  height:
                    "calc(var(--composer-h) + env(safe-area-inset-bottom))",
                }}
              />
              <div ref={bottomRef} />
            </div>
          </div>
        </div>
      </section>

      {/* Fixed Composer */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#241617] bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/95 to-[#0b0b0b]/80 backdrop-blur-md"
        style={{
          paddingBottom: "max(12px, env(safe-area-inset-bottom))",
          WebkitBackdropFilter: "blur(8px)",
        }}
      >
        <div className="mx-auto w-full max-w-4xl px-4 py-2">
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center gap-2 rounded-2xl border border-[#241617] bg-black/70 p-2 shadow-[0_12px_36px_-18px_rgba(244,63,94,0.45),inset_0_0_0_1px_rgba(244,63,94,0.25)]">
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Ask anything... Press Enter to send"
                className="flex-1 rounded-xl bg-transparent px-4 py-3 text-sm text-gray-100 placeholder-gray-500 outline-none"
              />
              <button
                onClick={onSend}
                disabled={isLoading || input.trim() === ""}
                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-br from-[#fb7185] to-[#f43f5e] px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_24px_-12px_rgba(244,63,94,0.55)] transition-transform hover:scale-[1.015] hover:from-[#fda4af] hover:to-[#fb7185] disabled:opacity-50"
                aria-label="Send message"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M4 12L20 4L12 20L11 13L4 12Z"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinejoin="round"
                  />
                </svg>
                Send
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Layout spacer for dvh calc */}
      <footer className="pointer-events-none h-[var(--footer-h)] w-full" />
    </main>
  );
}

/* Components */

function Bubble(props: { role: "user" | "assistant"; content: string }) {
  const isUser = props.role === "user";
  return (
    <div
      className={`flex ${isUser ? "justify-end" : "justify-start"} items-start`}
    >
      {!isUser && (
        <Avatar
          gradient="from-[#fb7185] to-[#f43f5e]"
          ring="ring-1 ring-[rgba(244,63,94,0.25)]"
          label="AI"
        />
      )}
      <div
        className={[
          "max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed md:px-5 md:py-3.5",
          isUser
            ? "bg-gradient-to-br from-[#fb7185] to-[#f43f5e] text-white shadow-[0_12px_34px_-14px_rgba(244,63,94,0.55)]"
            : "border border-[#241617] bg-[rgba(10,10,10,0.75)] text-gray-100 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.18),0_10px_28px_-18px_rgba(244,63,94,0.35)]",
        ].join(" ")}
        style={{ backdropFilter: "saturate(115%) blur(3px)" }}
      >
        {props.content || <span className="text-gray-500">Thinking...</span>}
      </div>
      {isUser && (
        <Avatar
          gradient="from-[#4b5563] to-[#6b7280]"
          ring="ring-1 ring-[rgba(148,163,184,0.25)]"
          label="You"
        />
      )}
    </div>
  );
}

function Avatar(props: { gradient: string; ring: string; label: string }) {
  return (
    <div className="mx-2 mt-1">
      <div
        className={[
          "flex size-8 items-center justify-center rounded-full bg-gradient-to-br text-[10px] font-semibold text-white",
          props.gradient,
          props.ring,
        ].join(" ")}
      >
        {props.label}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex items-center gap-2 pl-1 text-xs text-gray-400">
      <span className="relative inline-flex">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[rgba(244,63,94,0.35)] opacity-75" />
        <span className="relative inline-flex size-2 rounded-full bg-[#f43f5e]" />
      </span>
      Microchip is typing...
      <span className="ml-1 inline-flex gap-1">
        <Dot />
        <Dot delay="150ms" />
        <Dot delay="300ms" />
      </span>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 animate-bounce rounded-full bg-gray-400"
      style={{ animationDelay: delay }}
    />
  );
}

function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative max-w-md text-center">
        <div className="absolute -inset-1 rounded-3xl bg-[radial-gradient(70%_120%_at_50%_0%,rgba(244,63,94,0.18),transparent_60%)] blur-xl" />
        <div className="relative rounded-3xl border border-[#241617] bg-black/60 px-6 py-8 shadow-[inset_0_0_0_1px_rgba(244,63,94,0.22)]">
          <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-[#fb7185] to-[#f43f5e] text-white shadow-[0_12px_34px_-14px_rgba(244,63,94,0.55)]">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
              <path
                d="M4 12L20 4L12 20L11 13L4 12Z"
                stroke="white"
                strokeWidth="2"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-[#fb7185]">
            Chat with Microchip
          </h2>
          <p className="mt-2 text-sm text-gray-400">
            AISoc’s helpful bot—curious, practical, and concise.
          </p>
        </div>
      </div>
    </div>
  );
}
