import { createFileRoute } from "@tanstack/react-router";

type SearchHit = { title: string; url: string; description?: string };

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { query } = (await request.json()) as { query?: string };
        if (!query) return new Response("Missing query", { status: 400 });
        const key = process.env.FIRECRAWL_API_KEY;
        if (!key) {
          return Response.json(
            { hits: [], error: "Search is offline — connect Firecrawl to enable live web search." },
            { status: 200 },
          );
        }
        const upstream = await fetch("https://api.firecrawl.dev/v2/search", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query, limit: 5 }),
        });
        if (!upstream.ok) {
          const t = await upstream.text().catch(() => "");
          return Response.json({ hits: [], error: `Search failed (${upstream.status}) ${t}` });
        }
        const j = (await upstream.json()) as {
          data?: { web?: Array<{ title?: string; url?: string; description?: string }> } | Array<{ title?: string; url?: string; description?: string }>;
          web?: Array<{ title?: string; url?: string; description?: string }>;
        };
        const arr =
          (Array.isArray(j.data) ? j.data : j.data?.web) ??
          j.web ??
          [];
        const hits: SearchHit[] = arr.slice(0, 5).map((r) => ({
          title: r.title ?? r.url ?? "result",
          url: r.url ?? "",
          description: r.description,
        }));
        return Response.json({ hits });
      },
    },
  },
});