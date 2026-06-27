import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BuildSimulator } from "@/components/ghost/BuildSimulator";

export const Route = createFileRoute("/ghost-vision")({
  head: () => ({ meta: [
    { title: "GHOST Vision — 3D Build Simulator" },
    { name: "description", content: "Ghost Vision live 3D structural build simulator." },
  ]}),
  component: GhostVisionPage,
});

function GhostVisionPage() {
  const [clock, setClock] = useState("--:--:--");
  const [telemetry, setTelemetry] = useState({ scan: 0, mesh: 0, latency: 0 });

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      setClock(d.toISOString().slice(11, 19));
      setTelemetry({
        scan: 60 + Math.round(Math.random() * 38),
        mesh: 1200 + Math.round(Math.random() * 800),
        latency: 8 + Math.round(Math.random() * 22),
      });
    };
    tick();
    const id = setInterval(tick, 1200);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative min-h-screen w-full vision-shell flex flex-col overflow-hidden">
      {/* scanline + sweep overlay */}
      <div className="vision-scan" aria-hidden />

      {/* top command bar */}
      <header className="relative z-10 flex items-center justify-between px-4 md:px-8 py-3 border-b border-[var(--orb-amber)]/25 bg-[oklch(0.08_0.04_254/.6)] backdrop-blur-sm">
        <div className="flex items-center gap-4">
          <span className="vision-dot" />
          <h1 className="font-mono text-[11px] tracking-[0.55em] text-[var(--orb-amber)]">
            G H O S T &nbsp;//&nbsp; V I S I O N&nbsp;&nbsp;<span className="text-muted-foreground/70">v2.4 BRIDGE</span>
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="hud-chip">UTC {clock}</span>
          <span className="hud-chip hidden sm:inline">SCAN {telemetry.scan}%</span>
          <span className="hud-chip hidden md:inline">MESH {telemetry.mesh}</span>
          <span className="hud-chip hidden md:inline">LAT {telemetry.latency}ms</span>
          <Link to="/" className="hud-chip cursor-pointer hover:opacity-80">← ORB</Link>
        </div>
      </header>

      {/* main grid */}
      <main className="relative z-10 flex-1 grid grid-cols-[28px_1fr_28px] md:grid-cols-[44px_1fr_44px] gap-2 md:gap-4 px-2 md:px-4 py-3 md:py-5">
        {/* left rail */}
        <div className="flex items-center justify-center">
          <span className="vision-rail">VISION ENGINE · STRUCTURAL ANALYSIS · LIVE</span>
        </div>

        {/* center column */}
        <div className="flex flex-col gap-3 md:gap-4 min-h-0">
          {/* stat strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3">
            <div className="vision-stat">
              <span className="vision-stat-label">Module</span>
              <span className="vision-stat-val">3D BUILDER</span>
            </div>
            <div className="vision-stat">
              <span className="vision-stat-label">Pipeline</span>
              <span className="vision-stat-val">GEMINI · THREE</span>
            </div>
            <div className="vision-stat">
              <span className="vision-stat-label">Integrity</span>
              <span className="vision-stat-val flex items-center gap-2"><span className="vision-dot" /> NOMINAL</span>
            </div>
            <div className="vision-stat">
              <span className="vision-stat-label">Operator</span>
              <span className="vision-stat-val">GHOST-01</span>
            </div>
          </div>

          {/* simulator surface */}
          <section className="vision-bracket flex-1 min-h-[520px] flex flex-col p-3 md:p-4 border border-[var(--orb-amber)]/25 bg-[oklch(0.07_0.03_254/.65)] backdrop-blur-sm">
            <BuildSimulator />
          </section>

          {/* footer hint */}
          <p className="text-center font-mono text-[10px] tracking-[0.35em] text-muted-foreground/60">
            STRUCTURAL SIMULATION ACTIVE · DRAG · SCROLL · TYPE DIRECTIVES IN PANEL
          </p>
        </div>

        {/* right rail */}
        <div className="flex items-center justify-center">
          <span className="vision-rail" style={{ transform: "rotate(180deg)" }}>
            BUILD SIMULATOR · PHYSICS · FAILURE MODES
          </span>
        </div>
      </main>
    </div>
  );
}