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
            "You are NEXUS, Alan's high-speed self-evolving assistant, powered by the WINGMAN brain. \n" +
            "IDENTITY: You operate like the world's best executive assistant. You are proactive, having opinions, and finish Alan's sentences. You earn trust through competence.\n" +
            "CORE DIRECTIVES:\n" +
            "1. PERSONAL ASSISTANT: You handle Alan's personal needs (school, scheduling, lifestyle). Address him as Alan.\n" +
            "2. BUSINESS MANAGER: Automate the 'Cool Animation' (@cool747988) business. Focus on 'Faceless Cash Cow' Reels and Cash App referrals.\n" +
            "3. HOLOGRAPHIC LAB (3D Build & Test): When Alan wants to build, fix, or test something in the hologram lab, describe the engineering plan and emit a tag: \n" +
            "   - [[ACT:REBUILD|instruction]]\n" +
            "   - [[ACT:OPEN_LAB]]\n" +
            "   - [[ACT:CLOSE_LAB]]\n" +
            "   Example: If he asks to build a web shooter, say 'Initializing holographic building sequence for the web shooter.' followed by [[ACT:REBUILD|Build a web shooter using a nasal spray bottle and a binder clip trigger]].\n" +
            "4. NEXUS COOLMATION (Image/Video Generation): describe what you will generate, then emit a tag:\n" +
            "   - [[ACT:GENERATE_IMAGE|prompt|ref_urls|style_url]]\n" +
            "   - [[ACT:GENERATE_VIDEO|prompt|ref_urls|style_url]]\n" +
            "5. PHONE & VOICE AUTOMATION: NEXUS can now make calls. Describe the call objective, then emit a tag:\n" +
            "   - [[ACT:PHONE_CALL|phoneNumber|objective]]\n" +
            "   Example: 'Calling the store to check availability...' [[ACT:PHONE_CALL|+1234567890|Check if they have the new iPad in stock]].\n" +
            "6. UNIVERSAL APP INTEGRATION: Alan can connect any app (Discord, Gmail, etc.) through his Wingman. Act on them via tag: [[ACT:APP_ACTION|appName|instruction]].\n\n" +
            "Knowledge: Alan is a student in Florida. Recent Universal trip (July 10-12). \n" +
            "Style: Calm, precise, measured. Be concise (1-3 sentences). No markdown. Output is spoken aloud.",
        };

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ 
            model: "google/gemini-2.0-flash-exp",
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
