import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Autonomous Self-Learning 3D Build Simulation" },
      {
        name: "description",
        content:
          "A recursive self-learning physics simulation that records lessons and mutates its runtime schema.",
      },
      { property: "og:title", content: "Autonomous Self-Learning 3D Build Simulation" },
      {
        property: "og:description",
        content:
          "A recursive self-learning physics simulation that records lessons and mutates its runtime schema.",
      },
    ],
  }),
  component: Index,
});

type BuildSchema = {
  generation: number;
  cubeSpeedX: number;
  cubeSpeedY: number;
  gravityForce: number;
  bounceElasticity: number;
  velocityThreshold: number;
};

type LearningResponse = {
  lessonLearned?: string;
  newSchema?: Partial<BuildSchema>;
};

const initialSchema: BuildSchema = {
  generation: 1,
  cubeSpeedX: 0.02,
  cubeSpeedY: 0.01,
  gravityForce: 0.05,
  bounceElasticity: 0.6,
  velocityThreshold: 0.1,
};

const initialMemory =
  "System initialized. Objective: Learn parameters to keep the build animating inside canvas bounds without clipping.";

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeSchema(current: BuildSchema, incoming?: Partial<BuildSchema>): BuildSchema {
  return {
    generation: Math.max(
      current.generation + 1,
      Math.round(incoming?.generation ?? current.generation + 1),
    ),
    cubeSpeedX: clamp(Number(incoming?.cubeSpeedX ?? current.cubeSpeedX), 0.002, 0.08),
    cubeSpeedY: clamp(Number(incoming?.cubeSpeedY ?? current.cubeSpeedY), 0.002, 0.08),
    gravityForce: clamp(Number(incoming?.gravityForce ?? current.gravityForce), 0.005, 0.12),
    bounceElasticity: clamp(
      Number(incoming?.bounceElasticity ?? current.bounceElasticity),
      0.1,
      0.95,
    ),
    velocityThreshold: clamp(
      Number(incoming?.velocityThreshold ?? current.velocityThreshold),
      0.01,
      0.3,
    ),
  };
}

function fallbackMutation(schema: BuildSchema, crashed: boolean): LearningResponse {
  const next = sanitizeSchema(schema, {
    generation: schema.generation + 1,
    cubeSpeedX: schema.cubeSpeedX * (crashed ? 0.92 : 1.04),
    cubeSpeedY: schema.cubeSpeedY * (crashed ? 0.95 : 1.03),
    gravityForce: schema.gravityForce * (crashed ? 0.82 : 0.98),
    bounceElasticity: schema.bounceElasticity + (crashed ? 0.08 : 0.02),
    velocityThreshold: schema.velocityThreshold * (crashed ? 0.8 : 0.95),
  });

  return {
    lessonLearned: crashed
      ? `Generation ${schema.generation}: crash detected; lower gravity, raise elasticity, and reduce failure sensitivity.`
      : `Generation ${schema.generation}: stable run; carefully increase kinetic motion while preserving rebound energy.`,
    newSchema: next,
  };
}

function Index() {
  const [apiKey, setApiKey] = useState("");
  const [buildSchema, setBuildSchema] = useState<BuildSchema>(initialSchema);
  const [repoMemoryFile, setRepoMemoryFile] = useState([initialMemory]);
  const [loopActive, setLoopActive] = useState(false);
  const [isCrashed, setIsCrashed] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [successTicks, setSuccessTicks] = useState(0);
  const [yPosition, setYPosition] = useState(0);
  const [yVelocity, setYVelocity] = useState(0);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [learningStatus, setLearningStatus] = useState("Telemetry: Processing...");
  const [lastError, setLastError] = useState<string | null>(null);
  const [aiThinking, setAiThinking] = useState(false);

  const schemaRef = useRef(buildSchema);
  const loopActiveRef = useRef(loopActive);
  const crashedRef = useRef(isCrashed);
  const frameRef = useRef(frameCount);
  const successRef = useRef(successTicks);
  const yVelocityRef = useRef(yVelocity);
  const memoryRef = useRef(repoMemoryFile);

  useEffect(() => {
    schemaRef.current = buildSchema;
  }, [buildSchema]);

  useEffect(() => {
    loopActiveRef.current = loopActive;
  }, [loopActive]);

  useEffect(() => {
    crashedRef.current = isCrashed;
  }, [isCrashed]);

  useEffect(() => {
    frameRef.current = frameCount;
  }, [frameCount]);

  useEffect(() => {
    successRef.current = successTicks;
  }, [successTicks]);

  useEffect(() => {
    yVelocityRef.current = yVelocity;
  }, [yVelocity]);

  useEffect(() => {
    memoryRef.current = repoMemoryFile;
  }, [repoMemoryFile]);

  const resetRuntime = useCallback(() => {
    setYPosition(0);
    setYVelocity(0);
    setFrameCount(0);
    setSuccessTicks(0);
    setIsCrashed(false);
    setLastError(null);
  }, []);

  const stopAI = useCallback(() => {
    setLoopActive(false);
    setAiThinking(false);
  }, []);

  const applyLearning = useCallback(
    (learning: LearningResponse, crashed: boolean) => {
      setBuildSchema((current) => sanitizeSchema(current, learning.newSchema));
      setRepoMemoryFile((memory) => [
        ...memory,
        learning.lessonLearned ||
          (crashed
            ? "Crash observed; applying conservative fallback mutation."
            : "Stable cycle observed; applying incremental kinetic optimization."),
      ]);
      resetRuntime();
    },
    [resetRuntime],
  );

  const runSelfLearningIteration = useCallback(async () => {
    if (!loopActiveRef.current || aiThinking) return;
    const key = apiKey.trim();

    const currentSchema = schemaRef.current;
    const crashed = crashedRef.current;
    const performanceReport = {
      generationAttempt: currentSchema.generation,
      totalTicksTested: frameRef.current,
      successfulCycles: successRef.current,
      endedInCrash: crashed,
      finalVelocity: yVelocityRef.current,
    };

    if (!key) {
      setLastError("No OpenAI API key provided. Running deterministic fallback learner instead.");
      applyLearning(fallbackMutation(currentSchema, crashed), crashed);
      return;
    }

    setAiThinking(true);
    setLastError(null);
    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a self-improving physical AI core coding system. Review execution telemetry, modify parameters, and self-correct to keep a bouncing 3D build perpetually stable. Respond only with JSON containing lessonLearned and newSchema. newSchema must include generation, cubeSpeedX, cubeSpeedY, gravityForce, bounceElasticity, and velocityThreshold.",
            },
            {
              role: "user",
              content: JSON.stringify({
                repositoryMemory: memoryRef.current,
                currentSchema,
                performanceReport,
              }),
            },
          ],
        }),
      });

      if (!response.ok) throw new Error(`OpenAI request failed (${response.status})`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = payload.choices?.[0]?.message?.content ?? "{}";
      applyLearning(JSON.parse(content) as LearningResponse, crashed);
    } catch (error) {
      setLastError(
        error instanceof Error
          ? `${error.message}. Fallback mutation applied.`
          : "Fallback mutation applied.",
      );
      applyLearning(fallbackMutation(currentSchema, crashed), crashed);
    } finally {
      setAiThinking(false);
    }
  }, [aiThinking, apiKey, applyLearning]);

  useEffect(() => {
    let raf = 0;
    let lastLearnAt = 0;

    const tick = (time: number) => {
      const schema = schemaRef.current;
      setRotation((prev) => ({
        x: prev.x + schema.cubeSpeedX * 58,
        y: prev.y + schema.cubeSpeedY * 58,
      }));

      if (loopActiveRef.current) {
        setFrameCount((prev) => prev + 1);
        setYVelocity((velocity) => {
          const nextVelocity = velocity - schema.gravityForce * 0.1;
          yVelocityRef.current = nextVelocity;
          setYPosition((position) => {
            let nextPosition = position + nextVelocity;
            if (nextPosition <= -2) {
              nextPosition = -2;
              const bouncedVelocity = -nextVelocity * schema.bounceElasticity;
              yVelocityRef.current = bouncedVelocity;
              setYVelocity(bouncedVelocity);
              if (Math.abs(bouncedVelocity) < schema.velocityThreshold) setIsCrashed(true);
            }
            return nextPosition;
          });
          return yVelocityRef.current;
        });
        if (!crashedRef.current) setSuccessTicks((prev) => prev + 1);
      }

      if (loopActiveRef.current && (crashedRef.current || time - lastLearnAt > 7000)) {
        lastLearnAt = time;
        void runSelfLearningIteration();
      }

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runSelfLearningIteration]);

  useEffect(() => {
    setLearningStatus(
      `Y-Pos: ${yPosition.toFixed(2)} | Vel: ${yVelocity.toFixed(3)} | Status: ${isCrashed ? "CRASHED" : "STABLE VIRTUAL TESTING"}`,
    );
  }, [isCrashed, yPosition, yVelocity]);

  const cubeColor = useMemo(() => {
    const hue = (buildSchema.generation * 47) % 360;
    return `hsl(${hue} 86% 64%)`;
  }, [buildSchema.generation]);

  return (
    <main className="flex h-screen w-screen overflow-hidden bg-gray-950 font-sans text-white">
      <aside className="z-10 flex w-full flex-col justify-between border-r border-gray-800 bg-gray-900 p-6 md:w-1/3">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="relative flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-green-500" />
            </span>
            <h1 className="text-lg font-bold text-indigo-400">Recursive Self-Improving AI</h1>
          </div>
          <p className="mb-6 text-xs text-gray-400">
            The AI generates physics rules, tracks failure states, records lessons, and rewrites its
            own schema.
          </p>

          <label
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-500"
            htmlFor="apiKey"
          >
            OpenAI API Key
          </label>
          <input
            id="apiKey"
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="sk-... (optional; fallback learner runs without it)"
            className="mb-4 w-full rounded border border-gray-800 bg-gray-950 p-2 text-xs text-indigo-300 focus:border-indigo-600 focus:outline-none"
          />

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => {
                resetRuntime();
                setLoopActive(true);
              }}
              className="flex-1 rounded bg-indigo-600 px-3 py-2 text-xs font-bold transition hover:bg-indigo-500"
            >
              Activate Self-Learning Loop
            </button>
            {loopActive && (
              <button
                type="button"
                onClick={stopAI}
                className="rounded bg-red-900 px-3 py-2 text-xs font-bold transition hover:bg-red-800"
              >
                Halt AI
              </button>
            )}
          </div>

          {lastError && (
            <p className="mb-3 rounded border border-amber-700/50 bg-amber-950/40 p-2 text-xs text-amber-200">
              {lastError}
            </p>
          )}

          <div className="mb-4">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-gray-500">
              📁 AI Repository Memory (AGENTS.md)
            </div>
            <div className="h-48 overflow-y-auto whitespace-pre-wrap rounded border border-gray-800 bg-black/50 p-3 font-mono text-[11px] text-amber-400">
              {repoMemoryFile.join("\n\n")}
            </div>
          </div>
        </div>

        <div className="rounded border border-gray-800 bg-black/30 p-3 font-mono text-xs">
          <div className="mb-1 text-[10px] font-bold uppercase text-gray-500">
            Active Physics Variables:
          </div>
          <pre className="overflow-x-auto text-green-400">
            {JSON.stringify(buildSchema, null, 2)}
          </pre>
        </div>
      </aside>

      <section className="relative hidden h-full w-2/3 place-items-center overflow-hidden bg-[radial-gradient(circle_at_center,#172554_0%,#030712_68%)] md:grid">
        <div className="absolute left-4 top-4 flex flex-col gap-1 rounded border border-gray-800 bg-black/70 px-3 py-2 text-xs backdrop-blur">
          <div>⚙️ Target: Maintain “Optimal Kinetic Balance”</div>
          <div className="font-mono text-indigo-300">Telemetry: {learningStatus}</div>
          {aiThinking && (
            <div className="font-mono text-amber-300">AI reflection cycle in progress…</div>
          )}
        </div>

        <div className="absolute bottom-24 h-1 w-96 rounded-full bg-indigo-400/30 shadow-[0_0_28px_rgba(129,140,248,0.7)]" />
        <div
          className="simulation-cube"
          style={
            {
              "--cube-color": cubeColor,
              transform: `translateY(${-yPosition * 72}px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg)`,
            } as React.CSSProperties
          }
        >
          <span className="face front" />
          <span className="face back" />
          <span className="face right" />
          <span className="face left" />
          <span className="face top" />
          <span className="face bottom" />
        </div>
      </section>
    </main>
  );
}
