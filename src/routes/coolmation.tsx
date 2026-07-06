import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/coolmation")({
  head: () => ({
    meta: [
      { title: "COOLMATION — NEXUS video lab" },
      { name: "description", content: "Generate short cool animations from a text prompt via Seedance 2 Mini." },
      { property: "og:title", content: "COOLMATION — NEXUS video lab" },
      { property: "og:description", content: "Generate short cool animations from a text prompt via Seedance 2 Mini." },
    ],
  }),
  component: Coolmation,
});

type Clip = { id: string; prompt: string; url?: string; status: "processing" | "completed" | "failed"; error?: string };

function Coolmation() {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("16:9");
  const [duration, setDuration] = useState(5);
  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollersRef = useRef<Record<string, number>>({});

  const pollClip = useCallback((id: string) => {
    const tick = async () => {
      try {
        const res = await fetch("/api/video-status", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ request_id: id }),
        });
        if (!res.ok) throw new Error(`Status ${res.status}`);
        const j = (await res.json()) as
          | { status: "processing" }
          | { status: "completed"; url: string }
          | { status: "failed"; error: string };
        setClips((cs) => cs.map((c) => (c.id === id ? { ...c, ...j } : c)));
        if (j.status === "processing") {
          pollersRef.current[id] = window.setTimeout(tick, 4000);
        } else {
          delete pollersRef.current[id];
        }
      } catch (e) {
        setClips((cs) =>
          cs.map((c) =>
            c.id === id ? { ...c, status: "failed", error: e instanceof Error ? e.message : "poll failed" } : c,
          ),
        );
        delete pollersRef.current[id];
      }
    };
    tick();
  }, []);

  useEffect(() => {
    return () => {
      Object.values(pollersRef.current).forEach((t) => window.clearTimeout(t));
    };
  }, []);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const p = prompt.trim();
      if (!p) return;
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/video", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p, aspect_ratio: aspect, duration }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Submit ${res.status}`);
        }
        const { request_id } = (await res.json()) as { request_id: string };
        setClips((cs) => [{ id: request_id, prompt: p, status: "processing" }, ...cs]);
        pollClip(request_id);
        setPrompt("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Submission failed");
      } finally {
        setBusy(false);
      }
    },
    [prompt, aspect, duration, pollClip],
  );

  return (
    <div className="min-h-screen w-full hud-grid">
      <div className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 md:px-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[var(--orb-amber)] shadow-[0_0_10px_var(--orb-amber)]" />
            <h1 className="font-mono text-sm tracking-[0.4em] text-[var(--orb-amber)]">
              C O O L M A T I O N
            </h1>
          </div>
          <Link to="/" className="hud-chip">← NEXUS</Link>
        </header>

        <p className="mt-4 font-mono text-xs tracking-widest text-muted-foreground">
          TEXT → SHORT ANIMATION · SEEDANCE 2 MINI · ~$0.07 / SEC
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card/40 p-4 backdrop-blur-sm">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the animation… e.g. 'A neon skateboard glides through a foggy Tokyo alley, cinematic'"
            rows={3}
            className="rounded-md border border-border bg-black/40 p-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-[var(--orb-amber)] focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              ASPECT
              <select
                value={aspect}
                onChange={(e) => setAspect(e.target.value)}
                className="rounded border border-border bg-black/40 px-2 py-1 text-foreground focus:border-[var(--orb-amber)] focus:outline-none"
              >
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </select>
            </label>
            <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              DURATION
              <select
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="rounded border border-border bg-black/40 px-2 py-1 text-foreground focus:border-[var(--orb-amber)] focus:outline-none"
              >
                <option value={5}>5s</option>
                <option value={10}>10s</option>
              </select>
            </label>
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="ml-auto h-10 rounded-full border border-[var(--orb-amber)]/60 bg-[var(--orb-orange)]/20 px-5 font-mono text-xs tracking-widest text-[var(--orb-amber)] transition-all hover:bg-[var(--orb-orange)]/40 disabled:opacity-40"
            >
              {busy ? "SUBMITTING…" : "GENERATE"}
            </button>
          </div>
          {error && (
            <p className="font-mono text-xs text-destructive">{error}</p>
          )}
        </form>

        <section className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {clips.length === 0 && (
            <p className="col-span-full text-center font-mono text-xs tracking-widest text-muted-foreground">
              NO CLIPS YET — DESCRIBE ONE ABOVE
            </p>
          )}
          {clips.map((c) => (
            <article key={c.id} className="rounded-lg border border-border bg-card/40 p-3 backdrop-blur-sm">
              <div className="mb-2 flex items-center justify-between font-mono text-[10px] tracking-widest">
                <span className="text-muted-foreground truncate max-w-[70%]">{c.prompt}</span>
                <span
                  className={
                    c.status === "completed"
                      ? "text-[var(--orb-amber)]"
                      : c.status === "failed"
                        ? "text-destructive"
                        : "text-muted-foreground animate-pulse"
                  }
                >
                  {c.status.toUpperCase()}
                </span>
              </div>
              {c.status === "completed" && c.url ? (
                <video src={c.url} controls playsInline className="w-full rounded-md" />
              ) : c.status === "failed" ? (
                <p className="font-mono text-xs text-destructive">{c.error || "Generation failed"}</p>
              ) : (
                <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border font-mono text-xs text-muted-foreground">
                  RENDERING…
                </div>
              )}
            </article>
          ))}
        </section>
      </div>
    </div>
  );
}