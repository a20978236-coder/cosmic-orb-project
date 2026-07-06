import { createFileRoute } from "@tanstack/react-router";
import { checkVideo } from "@/lib/seedance";

export const Route = createFileRoute("/api/video-status")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { request_id } = (await request.json()) as { request_id?: string };
        if (!request_id) return new Response("Missing request_id", { status: 400 });

        try {
          const result = await checkVideo(request_id);
          return Response.json(result);
        } catch (e) {
          const message = e instanceof Error ? e.message : "Status check failed";
          return new Response(message, { status: 500 });
        }
      },
    },
  },
});
