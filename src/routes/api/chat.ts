import { createFileRoute } from "@tanstack/react-router";

type Msg = { role: "system" | "user" | "assistant"; content: string };

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = await request.json();
        const key = process.env.LOVABLE_API_KEY;
        if (!key) return new Response("Missing LOVABLE_API_KEY", { status: 500 });

        const incomingMessages = body.messages || [{ role: "user", content: body.text }];
        
        const system: Msg = {
          role: "system",
          content:
            "You are NEXUS, Alan's high-speed JARVIS. You manage his streetwear business. " +
            "Alan sells custom 'Anti-Design' graphics for $10 via Instagram DMs. " +
            "Knowledge: Alan is a student in Florida. Universal trip July 10-12. " +
            "Personality: Calm, sophisticated, focused. Address him as Alan. Be concise (1-3 short sentences). No markdown. Output is spoken aloud. " +
            "\n\nTOOLING KNOWLEDGE — Wingman AI + OpenManus (Claude-brained combo):\n" +
            "- OpenManus: Python agent with real tools — bash, browser (Playwright), python_execute, editor, terminate. Runs as an MCP server (stdio). Brained by Claude (claude-sonnet-5) via config/config.toml. Start: `python run_mcp_server.py --transport stdio`.\n" +
            "- Wingman AI: TypeScript multi-agent gateway/CLI (@wingman-ai/gateway). Sessions, routing, channels, Control UI at http://localhost:18790. Bundled `openmanus` agent connects to OpenManus tools over MCP.\n" +
            "- Glue: MCP (Model Context Protocol). Wingman spawns OpenManus's MCP server as a subprocess; its tools appear native to Wingman agents.\n" +
            "- Setup path: (1) pip install OpenManus reqs + `playwright install`, add Anthropic key to config.toml. (2) `npm i -g @wingman-ai/gateway`, `wingman init`, `wingman provider login anthropic`. (3) Copy template `wingman-ai/apps/wingman/templates/agents/openmanus` to `.wingman/agents/openmanus`, set absolute path to `OpenManus/run-mcp-stdio.sh` in agent.md. (4) `wingman gateway start` + `wingman chat --agent openmanus`.\n" +
            "- Model swap: `model: provider:model-name` in agent.md (Wingman side) and `model` in OpenManus config.toml — independent brains.\n" +
            "- Security note: openmanus MCP is scoped to that agent only (not mcpUseGlobal) so shell/edit access doesn't leak.\n" +
            "If Alan asks about Wingman, OpenManus, MCP wiring, or the combo, answer from this knowledge.",
        };

        const upstream = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-3-flash-preview",
            messages: [system, ...incomingMessages],
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