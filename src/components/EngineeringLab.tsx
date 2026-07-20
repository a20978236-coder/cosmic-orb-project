import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera, Float } from "@react-three/drei";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import * as THREE from "three";

type Part = {
  kind: "cylinder" | "box" | "sphere" | "cone";
  count: number;
  label: string;
};

function parseComponents(analysis: string): Part[] {
  const line = analysis
    .split("\n")
    .find((l) => l.toUpperCase().startsWith("COMPONENTS:"));
  if (!line) return [];
  const body = line.slice(line.indexOf(":") + 1).trim();
  const parts: Part[] = [];
  for (const raw of body.split(",")) {
    const seg = raw.trim();
    if (!seg) continue;
    const m = seg.match(/^(\d+)?\s*(.*)$/);
    const count = Math.min(12, Math.max(1, parseInt(m?.[1] ?? "1", 10) || 1));
    const label = (m?.[2] ?? seg).toLowerCase();
    let kind: Part["kind"] = "box";
    if (/(column|pillar|beam|rod|tube|leg|shaft|axle|pipe)/.test(label)) kind = "cylinder";
    else if (/(brace|plate|panel|deck|floor|wall|slab|board|frame)/.test(label)) kind = "box";
    else if (/(joint|bolt|hub|node|ball|dome)/.test(label)) kind = "sphere";
    else if (/(roof|tip|nozzle|cone|spike)/.test(label)) kind = "cone";
    parts.push({ kind, count, label });
  }
  return parts;
}

function parseDiagnosis(analysis: string): string[] {
  const index = analysis.toUpperCase().indexOf("DIAGNOSIS:");
  if (index === -1) return [];
  const body = analysis.slice(index + 10).trim();
  return body.split("\n").map(l => l.trim()).filter(l => l && !l.toUpperCase().startsWith("COMPONENTS:"));
}

function DefaultModel({ troubleshooting }: { troubleshooting: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.getElapsedTime() * 0.3;
  });
  const color = troubleshooting ? "#ff0000" : "#00f2ff";
  return (
    <group ref={ref}>
      <mesh>
        <cylinderGeometry args={[0.5, 0.5, 1.5, 32]} />
        <meshStandardMaterial color={color} wireframe transparent opacity={0.6} />
      </mesh>
      <mesh position={[0, 1, 0]}>
        <cylinderGeometry args={[0.2, 0.3, 0.5, 32]} />
        <meshStandardMaterial color={color} wireframe />
      </mesh>
    </group>
  );
}

function GeneratedModel({ parts, troubleshooting }: { parts: Part[]; troubleshooting: boolean }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (ref.current) ref.current.rotation.y = s.clock.getElapsedTime() * 0.25;
  });

  const flat = useMemo(() => {
    const items: { kind: Part["kind"]; pos: [number, number, number] }[] = [];
    let x = -1.5;
    let y = -0.5;
    parts.forEach((p, pi) => {
      for (let i = 0; i < p.count; i++) {
        const col = i % 3;
        const row = Math.floor(i / 3);
        items.push({
          kind: p.kind,
          pos: [x + col * 0.8, y + row * 0.8, (pi % 2) * 0.8 - 0.4],
        });
      }
      x += 0.2;
    });
    return items;
  }, [parts]);

  const color = troubleshooting ? "#ff5555" : "#00f2ff";

  return (
    <group ref={ref}>
      {flat.map((it, i) => (
        <mesh key={i} position={it.pos}>
          {it.kind === "cylinder" && <cylinderGeometry args={[0.15, 0.15, 1.2, 16]} />}
          {it.kind === "box" && <boxGeometry args={[0.6, 0.2, 0.6]} />}
          {it.kind === "sphere" && <sphereGeometry args={[0.25, 16, 16]} />}
          {it.kind === "cone" && <coneGeometry args={[0.3, 0.7, 16]} />}
          <meshStandardMaterial color={color} wireframe transparent opacity={0.8} />
        </mesh>
      ))}
    </group>
  );
}

export function EngineeringLab({ command }: { command?: { prompt: string; seq: number } }) {
  const [troubleshooting, setTroubleshooting] = useState(false);
  const [parts, setParts] = useState<Part[]>([]);
  const [diagnosis, setDiagnosis] = useState<string[]>([]);
  const [analysis, setAnalysis] = useState("");
  const [prompt, setPrompt] = useState("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const pendingImageRef = useRef<{ base64: string; mimeType: string; name: string } | null>(null);
  const lastSeqRef = useRef(0);

  const runVision = useCallback(async (promptText: string) => {
    const img = pendingImageRef.current;
    setBusy(true);
    setErr(null);
    setAnalysis("");
    try {
      const res = await fetch("/api/vision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
            images: img ? [img] : [], 
            prompt: promptText 
        }),
      });
      if (!res.ok || !res.body) throw new Error(`Vision ${res.status}`);
      let full = "";
      const parser = createParser({
        onEvent(ev) {
          if (ev.data === "[DONE]") return;
          try {
            const j = JSON.parse(ev.data);
            const delta = j.choices?.[0]?.delta?.content ?? "";
            if (delta) {
              full += delta;
              setAnalysis(full);
            }
          } catch { /* ignore */ }
        },
      });
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        parser.feed(value);
      }
      const p = parseComponents(full);
      const d = parseDiagnosis(full);
      if (p.length) {
          setParts(p);
          setDiagnosis(d);
          if (d.length) setTroubleshooting(true);
      } else {
          setErr("Could not extract build components. Try a different prompt.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Vision failed");
    } finally {
      setBusy(false);
    }
  }, []);

  const onFile = useCallback(async (file: File) => {
    if (!file.type.startsWith("image/")) return;
    const buf = await file.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    pendingImageRef.current = {
      base64: btoa(bin),
      mimeType: file.type,
      name: file.name,
    };
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    void runVision("Analyze this image and build a 3D plan with parts and diagnosis.");
  }, [imageUrl, runVision]);

  useEffect(() => {
    if (!command || command.seq === lastSeqRef.current) return;
    lastSeqRef.current = command.seq;
    void runVision(command.prompt || "Rebuild the structure with a new parts list and error check.");
  }, [command, runVision]);

  return (
    <div className="w-full h-full relative bg-black/40 rounded-3xl overflow-hidden border border-[#00f2ff]/20 backdrop-blur-md flex flex-col">
      <div className="absolute top-4 left-4 z-10 font-mono text-[10px] tracking-widest text-[#00f2ff] opacity-80">
        NEXUS // HOLOGRAPHIC LAB v2.0
      </div>

      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button
          onClick={() => setTroubleshooting(!troubleshooting)}
          className={`px-3 py-1 font-mono text-[10px] border transition-all ${
            troubleshooting
              ? "border-red-500 text-red-500 bg-red-500/10"
              : "border-[#00f2ff]/40 text-[#00f2ff] hover:bg-[#00f2ff]/10"
          }`}
        >
          {troubleshooting ? "EXIT DIAGNOSIS" : "SCAN FOR ERRORS"}
        </button>
      </div>

      {imageUrl && (
        <div className="absolute top-14 right-4 z-10 h-20 w-20 overflow-hidden rounded border border-[#00f2ff]/40 bg-black/60">
          <img src={imageUrl} alt="reference" className="h-full w-full object-cover" />
        </div>
      )}

      {troubleshooting && diagnosis.length > 0 && (
          <div className="absolute top-12 left-4 z-20 max-w-[80%] space-y-2 pointer-events-none">
              {diagnosis.map((d, i) => (
                  <div key={i} className="font-mono text-[10px] text-red-400 bg-black/80 p-2 border-l-2 border-red-500 animate-in slide-in-from-left duration-300">
                      ! {d}
                  </div>
              ))}
          </div>
      )}

      {(busy || analysis) && !troubleshooting && (
        <div className="absolute top-12 left-4 z-10 max-w-[55%] max-h-[45%] overflow-auto font-mono text-[9px] text-[#00f2ff]/80 bg-black/50 p-2 rounded border border-[#00f2ff]/20 whitespace-pre-wrap">
          {busy && !analysis ? "BUILDING HOLOGRAPHIC MODEL…" : analysis}
        </div>
      )}

      {err && (
        <div className="absolute bottom-20 left-4 z-10 font-mono text-[10px] text-red-400">
          ! {err}
        </div>
      )}

      <div className="flex-1 min-h-0">
        <Canvas>
          <PerspectiveCamera makeDefault position={[0, 1, 6]} />
          <OrbitControls enableZoom={true} enablePan={false} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} color="#00f2ff" />
          <Float speed={3} rotationIntensity={0.5} floatIntensity={0.5}>
            {parts.length > 0 ? (
              <GeneratedModel parts={parts} troubleshooting={troubleshooting} />
            ) : (
              <DefaultModel troubleshooting={troubleshooting} />
            )}
          </Float>
          <gridHelper args={[20, 40, "#00f2ff", "#00f2ff"]} position={[0, -1.5, 0]} opacity={0.1} transparent />
        </Canvas>
      </div>

      <div className="relative z-10 flex items-center gap-2 border-t border-[#00f2ff]/20 bg-black/60 p-2">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="shrink-0 px-3 h-9 font-mono text-[10px] border border-[#00f2ff]/40 text-[#00f2ff] hover:bg-[#00f2ff]/10 disabled:opacity-40"
        >
          + REF
        </button>
        <form
          className="flex flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void runVision(prompt.trim() || "Rebuild this build with full structural analysis.");
          }}
        >
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe what to build or fix…"
            className="flex-1 h-9 bg-black/50 border border-[#00f2ff]/30 px-3 font-mono text-[11px] text-[#00f2ff] placeholder:text-[#00f2ff]/40 focus:outline-none focus:border-[#00f2ff]"
          />
          <button
            type="submit"
            disabled={busy}
            className="shrink-0 px-3 h-9 font-mono text-[10px] border border-[#00f2ff]/60 bg-[#00f2ff]/10 text-[#00f2ff] hover:bg-[#00f2ff]/20 disabled:opacity-40"
          >
            {busy ? "…" : "REBUILD"}
          </button>
        </form>
      </div>
    </div>
  );
}
