import { createFileRoute } from "@tanstack/react-router";
import { submitVideo, type VideoResolution } from "@/lib/seedance";

export const Route = createFileRoute("/api/video")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          prompt?: string;
          aspect_ratio?: string;
          resolution?: VideoResolution;
          duration?: number;
          image_url?: string;
        };

        const prompt = body.prompt?.trim();
        if (!prompt) return new Response("Missing prompt", { status: 400 });

        try {
          const request_id = await submitVideo({
            prompt,
            aspect_ratio: body.aspect_ratio,
            resolution: body.resolution,
            duration: body.duration,
            image_url: body.image_url,
          });
          return Response.json({ request_id });
        } catch (e) {
          const message = e instanceof Error ? e.message : "Video submission failed";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
