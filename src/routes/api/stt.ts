import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/stt")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const incoming = await request.formData();
        const file = incoming.get("file");
        if (!(file instanceof File)) return new Response("No file", { status: 400 });

        const ext =
          ({
            "audio/webm": "webm",
            "audio/mp4": "mp4",
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
          } as Record<string, string>)[file.type.split(";")[0]] ?? "webm";

        const out = new FormData();
        out.append("model", "openai/gpt-4o-mini-transcribe");
        out.append("file", file, `recording.${ext}`);

        const upstream = await fetch(
          "https://ai.gateway.lovable.dev/v1/audio/transcriptions",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${key}` },
            body: out,
          },
        );

        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          return new Response(t || "STT error", { status: upstream.status });
        }
        const data = await upstream.json();
        return Response.json({ text: data.text ?? "" });
      },
    },
  },
});