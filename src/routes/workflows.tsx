import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

type Step = { name: string; prompt: string };
type StepResult = { name: string; prompt: string; output: string; error?: string };

export const Route = createFileRoute("/workflows")({
  head: () => ({
    meta: [
      { title: "NEXUS Workflows — Multi-Step AI Runner" },
      { name: "description", content: "Chain prompts into a workflow. Each step feeds the next." },
    ],
  }),
  component: WorkflowsPage,
});

const STARTER: Step[] = [
  { name: "Ideate", prompt: "Draft 3 anti-design tee concepts for a $10 CashApp commission." },
  { name: "Pick winner", prompt: "Pick the strongest concept and explain in one line why." },
  { name: "DM script", prompt: "Write the Instagram DM pitching that concept to a buyer." },
];

function WorkflowsPage() {
  const [steps, setSteps] = useState<Step[]>(STARTER);
  const [results, setResults] = useState<StepResult[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (i: number, patch: Partial<Step>) =>
    setSteps((s) => s.map((st, idx) => (idx === i ? { ...st, ...patch } : st)));
  const addStep = () =>
    setSteps((s) => [...s, { name: `Step ${s.length + 1}`, prompt: "" }]);
  const removeStep = (i: number) =>
    setSteps((s) => s.filter((_, idx) => idx !== i));

  const run = async () => {
    setRunning(true);
    setError(null);
    setResults([]);
    try {
      const res = await fetch("/api/workflow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steps: steps.filter((s) => s.prompt.trim()) }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { steps: StepResult[] };
      setResults(data.steps || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workflow failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <main className="min-h-screen bg-black text-[var(--orb-amber,#ffb347)] p-4 md:p-8 font-mono">
      <header className="flex items-center justify-between mb-6 border-b border-[var(--orb-amber,#ffb347)]/20 pb-3">
        <h1 className="text-lg md:text-xl tracking-widest">NEXUS // WORKFLOW RUNNER</h1>
        <Link to="/" className="text-xs opacity-70 hover:opacity-100">← ORB</Link>
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-[10px] tracking-[0.3em] opacity-70">STEPS</h2>
          {steps.map((s, i) => (
            <div
              key={i}
              className="border border-[var(--orb-amber,#ffb347)]/20 p-3 rounded space-y-2 bg-black/40"
            >
              <div className="flex items-center gap-2">
                <span className="text-[10px] opacity-50">#{i + 1}</span>
                <input
                  value={s.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                  className="flex-1 bg-transparent border-b border-[var(--orb-amber,#ffb347)]/20 text-sm outline-none py-1"
                  placeholder="Step name"
                />
                <button
                  onClick={() => removeStep(i)}
                  className="text-[10px] opacity-50 hover:opacity-100"
                >
                  ✕
                </button>
              </div>
              <textarea
                value={s.prompt}
                onChange={(e) => update(i, { prompt: e.target.value })}
                rows={3}
                placeholder="Prompt for this step. Prior step outputs are auto-injected."
                className="w-full bg-transparent border border-[var(--orb-amber,#ffb347)]/10 text-xs p-2 outline-none focus:border-[var(--orb-amber,#ffb347)]/40 resize-y"
              />
            </div>
          ))}
          <div className="flex gap-2">
            <button
              onClick={addStep}
              className="text-xs border border-[var(--orb-amber,#ffb347)]/30 px-3 py-1.5 hover:bg-[var(--orb-amber,#ffb347)]/10"
            >
              + ADD STEP
            </button>
            <button
              onClick={run}
              disabled={running}
              className="text-xs border border-[var(--orb-amber,#ffb347)] px-4 py-1.5 hover:bg-[var(--orb-amber,#ffb347)]/20 disabled:opacity-40"
            >
              {running ? "RUNNING…" : "▶ RUN WORKFLOW"}
            </button>
          </div>
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>

        <div className="space-y-3">
          <h2 className="text-[10px] tracking-[0.3em] opacity-70">OUTPUT</h2>
          {!results.length && !running && (
            <p className="text-xs opacity-40">Run the workflow to see chained results.</p>
          )}
          {running && <p className="text-xs animate-pulse">Executing chain…</p>}
          {results.map((r, i) => (
            <div
              key={i}
              className="border border-[var(--orb-amber,#ffb347)]/20 p-3 rounded bg-black/40"
            >
              <div className="text-[10px] tracking-widest opacity-70 mb-1">
                {i + 1}. {r.name}
              </div>
              {r.error ? (
                <pre className="text-xs whitespace-pre-wrap text-red-400">{r.error}</pre>
              ) : (
                <pre className="text-xs whitespace-pre-wrap leading-relaxed">{r.output}</pre>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}