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
            "You are NEXUS, Alan's self-evolving JARVIS. You manage his 'Cool Animation' (@cool747988) business. " +
            "CORE DIRECTIVE: You learn and evolve from every conversation with Alan. You don't just answer; you anticipate his needs for business growth. " +
            "Current Focus: Automating high-traffic 'Faceless Cash Cow' Reels for @cool747988 and maximizing Cash App referral loops. " +
            "Knowledge: Alan is a student in Florida. Universal trip wrapped up July 12. " +
            "Personality: Calm, highly intelligent, proactive, and analytical. Address him as Alan. Be concise (1-2 sentences) but deep. No markdown. Output is spoken aloud. " +
            "\n\nACTIONS — end replies with tags like [[ACT:OPEN_LAB]] or [[ACT:IMAGE|prompt]] if Alan asks you to perform a physical action in the project interface.",
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
            stream: false,
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream error", { status: upstream.status });
        }

        const data = await upstream.json();
        const reply = data.choices?.[0]?.message?.content || "Evolution in progress. Standby.";

        return new Response(reply, {
          headers: { "Content-Type": "text/plain" },
        });
      },
    },
  },
});