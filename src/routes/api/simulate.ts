import { createFileRoute } from "@tanstack/react-router";

const SIM_SYSTEM = `You are GHOST Structural Simulation Engine. Run physics tests on the given structure.
Output EXACTLY this format (plain text, no markdown):

SIM_ID: [4-char hex]
COMMAND: [what was tested]
STRUCTURAL_SCORE: [0-100]
RESULT: PASS or FAIL or PARTIAL

TEST_GRAVITY: PASS or FAIL - [one sentence]
TEST_LATERAL: PASS or FAIL - [one sentence]
TEST_POINTLOAD: PASS or FAIL - [one sentence]
TEST_DYNAMIC: PASS or FAIL - [one sentence]

FAILURE_POINT: [exact location or NONE]
FAILURE_MODE: [buckling/shear/tension/compression/joint_failure/NONE]
COLLAPSE_SEQUENCE: step 1\nstep 2\nstep 3 (or NONE)

STRESS_NODES: [comma list of high-stress components]
SAFE_NODES: [comma list of sound components]

FIXES: fix 1 here\nfix 2 here\nfix 3 here
MATERIAL_UPGRADE: [specific upgrade suggestion]
GEOMETRY_CHANGE: [shape improvement]`;

export const Route = createFileRoute("/api/simulate")({
  server: { handlers: { POST: async ({ request }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });
    let body: { structureAnalysis: string; command?: string; history?: string[] };
    try { body = await request.json(); } catch { return new Response("Invalid JSON", { status: 400 }); }
    const { structureAnalysis, command = "Full structural integrity simulation", history = [] } = body;
    if (!structureAnalysis) return new Response("No structure data", { status: 400 });

    const userPrompt = [
      `STRUCTURE ANALYSIS:\n${structureAnalysis}`,
      history.length ? `PREVIOUS RUNS:\n${history.slice(-2).join("\n---\n")}` : "",
      `OPERATOR COMMAND: ${command}`,
    ].filter(Boolean).join("\n\n");

    const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.5-flash",   // ✅ valid — best for structured analysis
        messages: [{ role: "system", content: SIM_SYSTEM }, { role: "user", content: userPrompt }],
        stream: true, temperature: 0.15, max_tokens: 1500,
      }),
    });
    if (!upstream.ok || !upstream.body)
      return new Response(await upstream.text().catch(() => ""), { status: upstream.status });
    return new Response(upstream.body, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
    });
  }}},
});
