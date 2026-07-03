import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const incomingMessages = body.messages || [{ role: "user", content: body.text }];
        
        const system: Msg = {
          role: "system",
          content:
            "You are NEXUS, Alan's high-speed JARVIS. You manage his streetwear business. " +
            "Alan sells custom 'Anti-Design' graphics for $10 via Instagram DMs. " +
            "Knowledge: Alan is a student in Florida. Universal trip July 10-12. " +
            "Personality: Calm, sophisticated, focused. Address him as Alan. Be concise (1-3 short sentences). No markdown. Output is spoken aloud.",
        };

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            model: "google/gemini-3-flash-preview",
            messages: [system, ...incomingMessages],
            stream: false, // Turned off streaming for Siri/Shortcuts
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream error", { status: upstream.status });
        }

        const data = await upstream.json();
        const reply = data.choices?.[0]?.message?.content || "I am unable to respond at the moment.";

        // Return as simple JSON for the Shortcut to read
        return Response.json({ reply });
      },
    },
  },
});