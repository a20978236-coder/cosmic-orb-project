import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        // This line makes it work with both complex arrays and simple text from Siri
        const incomingMessages = body.messages || [{ role: "user", content: body.text }];
        
        const key = "sk-emergent-131836d90AdD210D89";

        const system: Msg = {
          role: "system",
          content:
            "You are NEXUS, Alan's high-speed JARVIS. You manage his streetwear business. " +
            "Alan sells custom 'Anti-Design' graphics for $10 via Instagram DMs. " +
            "Knowledge: Alan is a student in Florida. Universal trip July 10-12. " +
            "Personality: Calm, sophisticated, focused. Address him as Alan. Be concise (1-3 short sentences). No markdown.",
        };

        const upstream = await fetch("https://integrations.emergentagent.com/llm/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            model: "google/gemini-3-flash-preview",
            messages: [system, ...incomingMessages],
            stream: true,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream error", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text-event-stream",
            "Cache-Control": "no-cache",
          },
        });
      },
    },
  },
});