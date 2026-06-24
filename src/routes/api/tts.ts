import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/tts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { text } = (await request.json()) as { text: string };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
        if (!text?.trim()) return new Response("Empty text", { status: 400 });

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/audio/speech", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "openai/gpt-4o-mini-tts",
            input: text,
            voice: "ash",
            instructions:
              "Speak as a calm, confident, sophisticated AI butler. Refined British-leaning accent, measured pacing, warm but precise.",
            stream_format: "sse",
            response_format: "pcm",
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const t = await upstream.text().catch(() => "");
          return new Response(t || "TTS error", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});