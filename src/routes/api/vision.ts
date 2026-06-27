import { createFileRoute } from "@tanstack/react-router";

const VISION_SYSTEM = `You are GHOST Vision — structural analysis intelligence.
Analyze the image for physical construction and output EXACTLY this format (plain text only):

STRUCTURE_TYPE: [name]
COMPLEXITY: [LOW/MEDIUM/HIGH/COMPLEX]
COMPONENTS: [comma list with counts, e.g. "4 vertical columns, 2 main beams, 6 cross-braces"]
MATERIALS: [identified materials]
DIMENSIONS_RATIO: [relative proportions, e.g. "height:width = 3:1"]
CONNECTION_TYPES: [joint types visible]
WEAK_POINTS: [structural vulnerabilities]
LOAD_PATH: [how loads travel through the structure]
BUILD_STEPS: step 1 here\nstep 2 here\nstep 3 here
ENGINEER_NOTES: [critical observations]`;

type Img = { base64: string; mimeType: string; name: string };

export const Route = createFileRoute("/api/vision")({
  server: { handlers: { POST: async ({ request }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
    let body: { images: Img[]; prompt?: string };
    try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const { images = [], prompt = "" } = body;
    if (!images.length) return new Response("No images", { status: 400 });
    if (images.length > 4) return new Response("Max 4 images", { status: 400 });

    type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
    const content: Part[] = [];
    for (const img of images) {
      if (!img.base64 || !img.mimeType?.startsWith("image/")) return new Response("Invalid image", { status: 400 });
      content.push({ type: "image_url", image_url: { url: `data:${img.mimeType};base64,${img.base64}` } });
    }
    if (prompt.trim()) content.push({ type: "text", text: prompt });

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-image",   // ✅ valid vision model
        messages: [{ role: "system", content: VISION_SYSTEM }, { role: "user", content }],
        stream: true, temperature: 0.25, max_tokens: 2000,
      }),
    });
    if (!upstream.ok || !upstream.body)
      return new Response(await upstream.text().catch(() => ""), { status: upstream.status });
    return new Response(upstream.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }}},
});
