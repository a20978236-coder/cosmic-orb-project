import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";

export const Route = createFileRoute("/coolmation")({
  head: () => ({
    meta: [
      { title: "COOLMATION — NEXUS video lab" },
      { name: "description", content: "Generate looping frame-by-frame animations from a text prompt — no API keys required." },
      { property: "og:title", content: "COOLMATION — NEXUS video lab" },
      { property: "og:description", content: "Generate looping frame-by-frame animations from a text prompt — no API keys required." },
    ],
  }),
  component: Coolmation,
});

type Clip = {
  id: string;
  prompt: string;
  frames: string[];
  status: "processing" | "completed" | "failed";
  error?: string;
  frameCount: number;
  fps: number;
};

function Coolmation() {
  const [prompt, setPrompt] = useState("");
  const [frameCount, setFrameCount] = useState(4);
  const [fps, setFps] = useState(6);
  const [clips, setClips] = useState<Clip[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const p = prompt.trim();
      if (!p) return;
      const id = crypto.randomUUID();
      const initial: Clip = {
        id,
        prompt: p,
        frames: [],
        status: "processing",
        frameCount,
        fps,
      };
      setClips((cs) => [initial, ...cs]);
      setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/coolmation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: p, frames: frameCount }),
        });
        if (!res.ok) {
          const t = await res.text().catch(() => "");
          throw new Error(t || `Generate ${res.status}`);
        }
        const { frames } = (await res.json()) as { frames: string[] };
        setClips((cs) =>
          cs.map((c) => (c.id === id ? { ...c, frames, status: "completed" } : c)),
        );
        setPrompt("");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Generation failed";
        setError(message);
        setClips((cs) =>
          cs.map((c) => (c.id === id ? { ...c, status: "failed", error: message } : c)),
        );
      } finally {
        setBusy(false);
      }
    },
    [prompt, frameCount, fps],
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
          TEXT → FRAME LOOP · POWERED BY LOVABLE AI · NO API KEY
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
              FRAMES
              <select
                value={frameCount}
                onChange={(e) => setFrameCount(Number(e.target.value))}
                className="rounded border border-border bg-black/40 px-2 py-1 text-foreground focus:border-[var(--orb-amber)] focus:outline-none"
              >
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
              FPS
              <select
                value={fps}
                onChange={(e) => setFps(Number(e.target.value))}
                className="rounded border border-border bg-black/40 px-2 py-1 text-foreground focus:border-[var(--orb-amber)] focus:outline-none"
              >
                {[2, 4, 6, 8, 12].map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={busy || !prompt.trim()}
              className="ml-auto h-10 rounded-full border border-[var(--orb-amber)]/60 bg-[var(--orb-orange)]/20 px-5 font-mono text-xs tracking-widest text-[var(--orb-amber)] transition-all hover:bg-[var(--orb-orange)]/40 disabled:opacity-40"
            >
              {busy ? "RENDERING…" : "GENERATE"}
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
            <ClipCard key={c.id} clip={c} />
          ))}
        </section>
      </div>
    </div>
  );
}

function ClipCard({ clip }: { clip: Clip }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (clip.status !== "completed" || clip.frames.length < 2) return;
    const period = Math.max(60, Math.round(1000 / clip.fps));
    const t = window.setInterval(() => {
      setIdx((i) => (i + 1) % clip.frames.length);
    }, period);
    return () => window.clearInterval(t);
  }, [clip.status, clip.frames, clip.fps]);

  return (
    <article className="rounded-lg border border-border bg-card/40 p-3 backdrop-blur-sm">
      <div className="mb-2 flex items-center justify-between gap-3 font-mono text-[10px] tracking-widest">
        <span className="text-muted-foreground truncate">{clip.prompt}</span>
        <span
          className={
            clip.status === "completed"
              ? "text-[var(--orb-amber)]"
              : clip.status === "failed"
                ? "text-destructive"
                : "text-muted-foreground animate-pulse"
          }
        >
          {clip.status === "completed"
            ? `${clip.frames.length}F · ${clip.fps}FPS`
            : clip.status.toUpperCase()}
        </span>
      </div>
      {clip.status === "completed" && clip.frames.length > 0 ? (
        <div className="relative w-full overflow-hidden rounded-md">
          <img
            src={clip.frames[idx]}
            alt={`frame ${idx + 1}`}
            className="w-full"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-1 p-2">
            {clip.frames.map((_, i) => (
              <span
                key={i}
                className={`h-1 w-4 rounded-full transition-colors ${
                  i === idx ? "bg-[var(--orb-amber)]" : "bg-white/20"
                }`}
              />
            ))}
          </div>
        </div>
      ) : clip.status === "failed" ? (
        <p className="font-mono text-xs text-destructive">{clip.error || "Generation failed"}</p>
      ) : (
        <div className="flex aspect-video w-full items-center justify-center rounded-md border border-dashed border-border font-mono text-xs text-muted-foreground">
          RENDERING {clip.frameCount} FRAMES…
        </div>
      )}
    </article>
  );
}