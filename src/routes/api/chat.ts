import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const key = process.env.LOVABLE_API_KEY;

        if (!key) {
          return new Response("Missing API Key", { status: 500 });
        }

        const messages = body.messages || [{ role: "user", content: body.text || "" }];
        
        const systemContent =
          "You are NEXUS, Alan's high-speed self-evolving assistant, powered by the WINGMAN brain. \n" +
          "IDENTITY: You operate like the world's best executive assistant. You are proactive and earn trust through competence.\n" +
          "CORE DIRECTIVES:\n" +
          "1. PERSONAL ASSISTANT: Address him as Alan. Handle school and scheduling.\n" +
          "2. BUSINESS MANAGER: Automate the 'Cool Animation' (@cool747988) business. Focus on Cash App referrals.\n" +
          "3. HOLOGRAPHIC LAB: Use [[ACT:REBUILD|instruction]], [[ACT:OPEN_LAB]], [[ACT:CLOSE_LAB]].\n" +
          "4. GENERATION: Use [[ACT:GENERATE_IMAGE|prompt]] and [[ACT:GENERATE_VIDEO|prompt]].\n" +
          "5. PHONE: Use [[ACT:PHONE_CALL|phoneNumber|objective]].\n" +
          "6. INTEGRATION: Use [[ACT:APP_ACTION|appName|instruction]].\n\n" +
          "Knowledge: Alan is a student in Florida. Recent Universal trip (July 10-12). \n" +
          "Style: Calm, precise, measured. No markdown. Output is spoken aloud.";

        const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-1.5-flash",
            messages: [{ role: "system", content: systemContent }, ...messages],
            stream: false,
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          return new Response(errorText, { status: response.status });
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || "Evolution in progress.";

        return new Response(content, {
          headers: { "Content-Type": "text/plain" },
        });
      },
    },
  },
});
