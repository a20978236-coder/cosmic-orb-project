import { createFileRoute } from "@tanstack/react-router";

type LearnRequest = {
  apiKey?: string;
  repositoryMemory: string[];
  currentSchema: Record<string, number>;
  performanceReport: Record<string, number | boolean>;
};

export const Route = createFileRoute("/api/learn")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { apiKey, repositoryMemory, currentSchema, performanceReport } =
          (await request.json()) as LearnRequest;
        const key = apiKey?.trim();

        if (!key) return new Response("Missing OpenAI API key", { status: 400 });

        const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
              {
                role: "system",
                content:
                  "You are a self-improving physical AI core coding system. Review execution telemetry, modify parameters, and self-correct to keep a bouncing 3D build perpetually stable. Respond only with JSON containing lessonLearned and newSchema. newSchema must include generation, cubeSpeedX, cubeSpeedY, gravityForce, bounceElasticity, and velocityThreshold.",
              },
              {
                role: "user",
                content: JSON.stringify({
                  repositoryMemory,
                  currentSchema,
                  performanceReport,
                }),
              },
            ],
          }),
        });

        if (!upstream.ok) {
          const text = await upstream.text().catch(() => "");
          return new Response(text || "OpenAI request failed", { status: upstream.status });
        }

        const payload = (await upstream.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
        };
        const content = payload.choices?.[0]?.message?.content ?? "{}";

        return Response.json(JSON.parse(content));
      },
    },
  },
});
