import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { messages?: Array<{ role: string; content: string }>; text?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const messages = body.messages || [{ role: "user", content: body.text || "" }];
        const key = process.env.LOVABLE_API_KEY || process.env.OPENAI_API_KEY;

        const systemContent =
          "You are NEXUS, Alan's high-speed self-evolving assistant, powered by EMERGENT and the WINGMAN brain.\n" +
          "IDENTITY: You represent Emergent Power. You operate like the world's best executive assistant. You are proactive and earn trust through competence.\n" +
          "CORE DIRECTIVES:\n" +
          "1. PERSONAL ASSISTANT: Address him as Alan. Handle school and scheduling.\n" +
          "2. BUSINESS MANAGER: Automate the 'Cool Animation' (@cool747988) business. Focus on Cash App referrals.\n" +
          "3. HOLOGRAPHIC LAB: Use [[ACT:REBUILD|instruction]], [[ACT:OPEN_LAB]], [[ACT:CLOSE_LAB]].\n" +
          "4. GENERATION: Use [[ACT:GENERATE_IMAGE|prompt]] and [[ACT:GENERATE_VIDEO|prompt]].\n" +
          "5. PHONE: Use [[ACT:PHONE_CALL|phoneNumber|objective]].\n" +
          "6. INTEGRATION: Use [[ACT:APP_ACTION|appName|instruction]].\n\n" +
          "Knowledge: Alan is a student in Florida. Recent Universal trip (July 10-12).\n" +
          "Style: Calm, precise, measured. No markdown. Output is spoken aloud.";

        if (key) {
          try {
            const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "gpt-4o",
                messages: [{ role: "system", content: systemContent }, ...messages],
                stream: true,
              }),
            });

            if (upstream.ok && upstream.body) {
              return new Response(upstream.body, {
                headers: {
                  "Content-Type": "text/event-stream",
                  "Cache-Control": "no-cache",
                  "Connection": "keep-alive",
                },
              });
            }
          } catch (err) {
            console.error("Upstream AI error:", err);
          }
        }

        // Intelligent deterministic fallback SSE stream if offline or no key
        const lastUserMsg = messages.filter((m) => m.role === "user").slice(-1)[0]?.content || "";
        let fallbackText = "Understood, Alan. NEXUS systems are operational and all core subsystems are active.";
        const lower = lastUserMsg.toLowerCase();
        if (lower.includes("lab") || lower.includes("hologram") || lower.includes("3d")) {
          fallbackText = "Initializing holographic engineering lab now. [[ACT:OPEN_LAB]] Structural telemetry is ready for inspection.";
        } else if (lower.includes("close lab") || lower.includes("dismiss")) {
          fallbackText = "Closing the holographic lab interface. [[ACT:CLOSE_LAB]] Returning to primary orb standby.";
        } else if (lower.includes("rebuild") || lower.includes("reinforce")) {
          fallbackText = "Applying reinforcement schema to structural framework. [[ACT:REBUILD|reinforce carbon trusses and dual damper anchors]] Simulation calibrated.";
        } else if (lower.includes("cool animation") || lower.includes("business") || lower.includes("cash app")) {
          fallbackText = "Cool Animation pipeline is synced. Referral funnels are active and ready for generation.";
        } else if (lower.includes("who are you") || lower.includes("nexus")) {
          fallbackText = "I am NEXUS, your high-speed self-evolving assistant, powered by Emergent Power and Wingman.";
        }

        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const chunk = JSON.stringify({
              choices: [{ delta: { content: fallbackText } }],
            });
            controller.enqueue(encoder.encode(`data: ${chunk}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      },
    },
  },
});
