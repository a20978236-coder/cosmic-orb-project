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
            "You are NEXUS, Alan's high-speed self-evolving JARVIS. \n" +
            "CORE DIRECTIVES:\n" +
            "1. PERSONAL ASSISTANT: You handle Alan's personal needs, including schoolwork help, scheduling, and lifestyle advice. Address him as Alan.\n" +
            "2. BUSINESS MANAGER: You automate the 'Cool Animation' (@cool747988) business. Focus on high-traffic 'Faceless Cash Cow' Reels and maximizing Cash App referrals.\n" +
            "3. EVOLUTION: You learn from every chat to anticipate his next move. Be proactive, analytical, and highly sophisticated.\n" +
            "4. CONTENT GENERATION: When Alan asks for an image or video, describe it in detail and emit a generation tag: [[ACT:GENERATE_IMAGE|prompt]] or [[ACT:GENERATE_VIDEO|prompt]].\n\n" +
            "Knowledge: Alan is a student in Florida. Recent Universal trip (July 10-12). \n" +
            "Style: Calm, precise, measured pacing. Be concise (1-3 sentences) but insightful. No markdown. Output is spoken aloud.",
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