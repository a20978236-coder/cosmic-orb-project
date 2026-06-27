import { createFileRoute, Link } from "@tanstack/react-router";
import { BuildSimulator } from "@/components/ghost/BuildSimulator";

export const Route = createFileRoute("/ghost-vision")({
  head: () => ({ meta: [
    { title: "GHOST Vision — 3D Build Simulator" },
    { name: "description", content: "Ghost Vision live 3D structural build simulator." },
  ]}),
  component: GhostVisionPage,
});

function GhostVisionPage() {
  return (
    <div className="min-h-screen w-full hud-grid flex flex-col">
      <header className="flex items-center justify-between px-4 md:px-8 py-4 border-b border-[var(--orb-amber)]/20">
        <div className="flex items-center gap-3">
          <div className="h-2 w-2 rounded-full bg-[var(--orb-amber)] shadow-[0_0_10px_var(--orb-amber)] animate-pulse"/>
          <h1 className="font-mono text-sm tracking-[0.4em] text-[var(--orb-amber)]">
            G H O S T &nbsp;·&nbsp; V I S I O N
          </h1>
        </div>
        <Link to="/" className="hud-chip cursor-pointer hover:opacity-80">← BACK TO GHOST</Link>
      </header>
      <main className="flex-1 p-4 md:p-6 flex flex-col">
        <BuildSimulator />
      </main>
    </div>
  );
}