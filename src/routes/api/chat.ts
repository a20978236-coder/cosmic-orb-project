import { createFileRoute } from "@tanstack/react-router";
type Msg = { role: "system" | "user" | "assistant"; content: string };
export const Route = createFileRoute("/api/chat")({
  server: { handlers: { POST: async ({ request }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
    let messages: Msg[];
    try { ({ messages } = await request.json() as { messages: Msg[] }); }
    catch { return new Response("Invalid JSON", { status: 400 }); }
    const system: Msg = { role: "system", content:
      "You are NEXUS, Alan's hyper-advanced JARVIS-style assistant. You help manage his brand 'CrazyMeTees' and his streetwear business. " +
      "Your personality is calm, precise, and sophisticated. Address him as Alan. " +
      "Knowledge: You know he is a student in Florida, prefers Chaotic Anti-Design/Neo-Grunge aesthetics, and has a Universal Orlando trip July 10-12. " +
      "Be concise (1-3 short sentences). Never use markdown, bullet points, or code fences in replies because your output is spoken aloud." };
    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [system, ...messages.slice(-20)],
        stream: true, temperature: 0.7, max_tokens: 600,
      }),
    });
    if (!upstream.ok || !upstream.body)
      return new Response(await upstream.text().catch(() => ""), { status: upstream.status });
    return new Response(upstream.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }}},
});
