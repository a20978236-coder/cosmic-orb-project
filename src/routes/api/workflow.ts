import { createFileRoute } from "@tanstack/react-router";

type Step = { name?: string; prompt: string; system?: string };
type StepResult = { name: string; prompt: string; output: string; error?: string };

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const DEFAULT_SYSTEM =
  "You are NEXUS, executing one step of a multi-step workflow for Alan. " +
  "Each step receives prior step outputs as context. Produce ONLY the deliverable " +
  "for the current step. Be concise, direct, and actionable.";

export const Route = createFileRoute("/api/workflow")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        let body: { steps?: Step[]; model?: string };
        try {
          body = await request.json();
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const steps = Array.isArray(body.steps) ? body.steps : [];
        if (!steps.length) return new Response("No steps provided", { status: 400 });
        if (steps.length > 12) return new Response("Too many steps (max 12)", { status: 400 });

        const model = body.model || "google/gemini-3-flash-preview";
        const results: StepResult[] = [];

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          const name = step.name?.trim() || `Step ${i + 1}`;
          const prompt = (step.prompt || "").trim();
          if (!prompt) {
            results.push({ name, prompt: "", output: "", error: "empty prompt" });
            continue;
          }

          const contextBlock = results.length
            ? "Prior workflow outputs:\n\n" +
              results
                .map((r) => `[${r.name}]\n${r.output || r.error || "(no output)"}`)
                .join("\n\n---\n\n")
            : "This is the first step of the workflow.";

          const messages = [
            { role: "system", content: step.system?.trim() || DEFAULT_SYSTEM },
            { role: "user", content: `${contextBlock}\n\n=== CURRENT STEP: ${name} ===\n${prompt}` },
          ];

          try {
            const upstream = await fetch(GATEWAY, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${key}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({ model, messages, stream: false }),
            });

            if (!upstream.ok) {
              const text = await upstream.text().catch(() => "");
              results.push({
                name,
                prompt,
                output: "",
                error: `Upstream ${upstream.status}: ${text.slice(0, 200)}`,
              });
              // stop the chain on hard failures
              if (upstream.status === 402 || upstream.status === 429) break;
              continue;
            }

            const data = await upstream.json();
            const output = data.choices?.[0]?.message?.content || "";
            results.push({ name, prompt, output });
          } catch (err) {
            results.push({
              name,
              prompt,
              output: "",
              error: err instanceof Error ? err.message : "unknown error",
            });
          }
        }

        return Response.json({ steps: results });
      },
    },
  },
});