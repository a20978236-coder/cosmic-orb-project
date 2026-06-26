import { createFileRoute } from "@tanstack/react-router";

// ─── Image message type ───────────────────────────────────────────────────────
type ImagePayload = {
  base64: string;
  mimeType: string; // "image/jpeg" | "image/png" | "image/webp" | "image/gif"
  name: string;
};

type TextMsg = { role: "user" | "assistant"; content: string };

// ─── Vision system prompt ─────────────────────────────────────────────────────
const VISION_SYSTEM = `You are NEXUS, a hyper-advanced AI with full vision capabilities.

When analyzing images for model construction:
- Identify all visible components, materials, and structural elements with precision.
- If this is a physical object, describe how to reconstruct or replicate it step by step.
- If this is a blueprint, schematic, or diagram, extract key measurements, labels, and assembly logic.
- If multiple images are provided, compare and cross-reference them to build a complete picture.
- Flag any defects, misalignments, or improvements you notice.
- If asked to fix code or text visible in an image, reproduce the corrected version cleanly.

Speak with calm authority. No markdown, no bullet points — your output is rendered as text and spoken aloud.
Address the user as you normally would. Be precise and practical.`;

export const Route = createFileRoute("/api/vision")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: { messages: TextMsg[]; images: ImagePayload[]; prompt: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const { messages = [], images = [], prompt = "" } = body;

        // ── Validate ─────────────────────────────────────────────────────────
        if (!prompt.trim() && images.length === 0) {
          return new Response("No prompt or images provided", { status: 400 });
        }
        if (images.length > 8) {
          return new Response("Maximum 8 images per request", { status: 400 });
        }
        for (const img of images) {
          if (!img.base64 || !img.mimeType?.startsWith("image/")) {
            return new Response("Invalid image payload", { status: 400 });
          }
          // Reject base64 strings that are too large (> 10 MB decoded ≈ ~13.5 MB base64)
          if (img.base64.length > 14_000_000) {
            return new Response(`Image "${img.name}" exceeds 10 MB limit`, { status: 413 });
          }
        }

        // ── Build vision message ──────────────────────────────────────────────
        // OpenAI-compatible multi-modal content array
        type ContentPart =
          | { type: "text"; text: string }
          | { type: "image_url"; image_url: { url: string } };

        const visionContent: ContentPart[] = [];

        // Attach each image as a base64 data URL
        for (const img of images) {
          visionContent.push({
            type: "image_url",
            image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
          });
        }

        // Append the text prompt
        if (prompt.trim()) {
          visionContent.push({ type: "text", text: prompt.trim() });
        }

        // ── Build full conversation history (prior text turns + new vision turn)
        type UpstreamMsg =
          | { role: "system" | "user" | "assistant"; content: string }
          | { role: "user"; content: ContentPart[] };

        const upstreamMessages: UpstreamMsg[] = [
          { role: "system", content: VISION_SYSTEM },
          // Previous text-only turns for context (capped to last 10)
          ...messages.slice(-10).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          // Current vision turn
          { role: "user" as const, content: visionContent },
        ];

        // ── Call upstream AI ─────────────────────────────────────────────────
        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            // Gemini 2.5 Flash supports vision via Lovable gateway
            model: "google/gemini-2.5-flash-preview-05-20",
            messages: upstreamMessages,
            stream: true,
            temperature: 0.4,
            max_tokens: 1500,
          }),
        });

        if (!upstream.ok || !upstream.body) {
          const errText = await upstream.text().catch(() => "");
          return new Response(errText || "Vision upstream error", { status: upstream.status });
        }

        return new Response(upstream.body, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "X-NEXUS-Mode": "vision",
          },
        });
      },
    },
  },
});
