import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/vision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { images, prompt } = (await request.json()) as {
          images: { base64: string; mimeType: string }[];
          prompt: string;
        };

        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const contents = [
          { type: "text", text: prompt },
          ...images.map((img) => ({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          })),
        ];

        const systemPrompt = 
          "You are an expert design engineer. Analyze the attached image(s) and instructions to provide a 3D building plan. " +
          "Format your response as follows:\n" +
          "1. A natural language technical description of the structure.\n" +
          "2. A list of physical parts to render. Format this on a SINGLE LINE starting with 'COMPONENTS:' followed by a comma-separated list of 'count part_name'. " +
          "Example: COMPONENTS: 1 base cylinder, 4 support beams, 1 nozzle cone.\n" +
          "3. A DIAGNOSIS section. List 2-3 potential structural failures or design flaws found in the build.\n" +
          "Example: DIAGNOSIS: 1. Lever pivot point is too weak for high tension. 2. Plastic casing will melt if used with acetone-based fluids.";

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: contents },
            ],
            stream: true,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "Upstream error", { status: upstream.status });
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
