import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "system" | "user" | "assistant"; content: string };

const SYSTEM: Msg = {
  role: "system",
  content:
    "You are NEXUS, a hyper-advanced AI assistant inspired by JARVIS. Speak with calm, precise confidence. " +
    "Be concise (1-3 short sentences unless detail is specifically requested). " +
    "Never use markdown formatting, bullet points, asterisks, or code fences — your output is spoken aloud. " +
    "Address the user respectfully. When asked about images or models, remind the user to use the image upload button.",
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let messages: Msg[];
        try {
          ({ messages } = (await request.json()) as { messages: Msg[] });
        } catch {
          return new Response("Invalid JSON body", { status: 400 });
        }

        if (!Array.isArray(messages) || messages.length === 0) {
          return new Response("messages array is required", { status: 400 });
        }

        // Cap conversation to last 20 turns to avoid context overflow
        const trimmed = messages.slice(-20);

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-preview-05-20", // fixed: was gemini-3 which doesn't exist
            messages: [SYSTEM, ...trimmed],
            stream: true,
            temperature: 0.7,
            max_tokens: 512,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream AI error", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});
