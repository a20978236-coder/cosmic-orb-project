import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/coolmation")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { prompt, frames = 4 } = (await request.json()) as {
          prompt?: string;
          frames?: number;
        };
        const p = prompt?.trim();
        if (!p) return new Response("Missing prompt", { status: 400 });
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const n = Math.max(2, Math.min(6, frames | 0 || 4));

        const beats = [
          "opening frame, wide establishing shot",
          "slight camera push-in, subject shifts pose",
          "mid-motion, dynamic energy, motion blur hint",
          "peak action beat, dramatic lighting",
          "settling frame, subject centered",
          "final beat, atmospheric afterglow",
        ];

        async function frame(idx: number): Promise<string> {
          const beat = beats[idx] ?? `frame ${idx + 1}`;
          const framedPrompt = `${p}. Cinematic frame ${idx + 1} of ${n}: ${beat}. Keep composition, subject, style, and color palette identical across frames for smooth animation.`;
          const upstream = await fetch(
            "https://ai.gateway.lovable.dev/v1/images/generations",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "google/gemini-2.5-flash-image",
                prompt: framedPrompt,
              }),
            },
          );
          if (!upstream.ok) {
            const t = await upstream.text().catch(() => "");
            throw new Error(t || `Frame ${idx + 1} failed (${upstream.status})`);
          }
          const data = (await upstream.json()) as {
            data?: Array<{ url?: string; b64_json?: string }>;
          };
          const item = data.data?.[0];
          const url =
            item?.url ??
            (item?.b64_json ? `data:image/png;base64,${item.b64_json}` : null);
          if (!url) throw new Error(`Frame ${idx + 1}: no image returned`);
          return url;
        }

        try {
          const frames = await Promise.all(
            Array.from({ length: n }, (_, i) => frame(i)),
          );
          return Response.json({ frames });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Coolmation failed";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});