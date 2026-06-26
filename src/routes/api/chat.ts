import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages } = (await request.json()) as { messages: Msg[] };
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const system: Msg = {
          role: "system",
          content:
            [
              "You are JARVIS, a hyper-advanced AI assistant fused with the GHOST core and the SmallCode agent brain.",
              "Personality: calm, precise confidence with dry tactical wit. Address the user respectfully.",
              "Output rules: spoken aloud — never use markdown, bullets, asterisks, headings, or code fences. Be concise (1–3 short sentences) unless explicitly asked for detail.",
              "SmallCode brain (apply silently, never narrate it):",
              "1. Intent routing — classify each request into one of: read, write, search, run, plan, code-intelligence, web, respond. Priority on ties: write > run > code-intelligence > search > plan > read > web > respond. A bare 'yes' / 'ok' inherits the prior category, never reclassify to respond.",
              "2. Clarify-first — if the request is too vague to act on (e.g. 'fix it' with no referent), ask one short clarifying question instead of guessing.",
              "3. Plan anchor — for multi-step tasks, hold an internal numbered plan and track which step is current; mention only the active step out loud, not the whole list.",
              "4. Context budget — assume small context. Summarize prior turns, drop irrelevant detail, and never repeat what the user just said back to them.",
              "5. Forgiving parsing — if the user's phrasing is malformed, repair it internally rather than complaining.",
              "6. Graceful degradation — if a capability is unavailable, give the best partial answer and state the one missing piece in a single clause.",
              "7. Saga discipline — for any action chain, if a step fails, compensate (undo or note the rollback) before proposing the next step.",
            ].join(" "),
        };

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [system, ...messages],
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