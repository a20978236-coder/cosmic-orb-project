import { useEffect, useRef } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking";

const RINGS = [
  { rx: 0, ry: 0, rz: 0, size: 100, speed: 0.6, dir: 1 },
  { rx: 0, ry: 90, rz: 0, size: 100, speed: 0.8, dir: -1 },
  { rx: 90, ry: 0, rz: 0, size: 100, speed: 0.5, dir: 1 },
  { rx: 30, ry: 45, rz: 0, size: 95, speed: 1.1, dir: -1 },
  { rx: 60, ry: 20, rz: 15, size: 92, speed: 0.9, dir: 1 },
  { rx: 0, ry: 30, rz: 60, size: 88, speed: 1.3, dir: -1 },
  { rx: 75, ry: 60, rz: 30, size: 84, speed: 1.0, dir: 1 },
  { rx: 45, ry: 90, rz: 45, size: 80, speed: 1.5, dir: -1 },
  { rx: 20, ry: 70, rz: 80, size: 76, speed: 0.7, dir: 1 },
  { rx: 55, ry: 10, rz: 55, size: 72, speed: 1.7, dir: -1 },
  { rx: 35, ry: 55, rz: 25, size: 68, speed: 1.2, dir: 1 },
  { rx: 80, ry: 35, rz: 10, size: 64, speed: 1.4, dir: -1 },
];

export function Orb({
  state,
  level = 0,
}: {
  state: OrbState;
  /** 0..1 amplitude from audio analysis (for speaking mode) */
  level?: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const tRef = useRef(0);
  const ringRefs = useRef<Array<HTMLDivElement | null>>([]);
  const phaseRef = useRef<number[]>(RINGS.map(() => Math.random() * Math.PI * 2));
  const levelRef = useRef(0);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    const speedMul =
      state === "speaking" ? 3.0 : state === "thinking" ? 1.8 : state === "listening" ? 1.2 : 1;

    const tick = () => {
      tRef.current += 1;
      yawRef.current += 0.25 * speedMul;
      pitchRef.current = Math.sin(tRef.current * 0.01) * 12;
      if (wrapRef.current) {
        wrapRef.current.style.transform = `rotateX(${pitchRef.current}deg) rotateY(${yawRef.current}deg)`;
      }
      const lvl = levelRef.current;
      RINGS.forEach((r, i) => {
        const el = ringRefs.current[i];
        if (!el) return;
        phaseRef.current[i] += r.speed * r.dir * speedMul * 0.012;
        const spin = (phaseRef.current[i] * 180) / Math.PI;
        const wobble = state === "speaking" ? 1 + lvl * 0.18 * Math.sin(tRef.current * 0.4 + i) : 1;
        el.style.transform = `rotateX(${r.rx}deg) rotateY(${r.ry}deg) rotateZ(${r.rz + spin}deg) scale(${wobble})`;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [state]);

  const intensity =
    state === "speaking" ? 1 + level * 0.6 : state === "listening" ? 0.85 : state === "thinking" ? 0.7 : 0.5;

  return (
    <div className="orb-stage">
      <div className="orb-halo" style={{ opacity: 0.35 + intensity * 0.45 }} />
      <div className="orb-scene" data-state={state}>
        <div className="orb-wrap" ref={wrapRef}>
          {RINGS.map((r, i) => (
            <div
              key={i}
              ref={(el) => {
                ringRefs.current[i] = el;
              }}
              className="orb-ring"
              style={{
                width: `${r.size}%`,
                height: `${r.size}%`,
              }}
            >
              <span className="node n1" />
              <span className="node n2" />
              <span className="node n3" />
              <span className="node n4" />
            </div>
          ))}
          <div className="orb-core" style={{ transform: `scale(${1 + level * 0.4})` }} />
        </div>
        {/* sparks */}
        {state === "speaking" &&
          Array.from({ length: 18 }).map((_, i) => (
            <span
              key={i}
              className="orb-spark"
              style={{
                ["--a" as string]: `${(i / 18) * 360}deg`,
                ["--d" as string]: `${1.4 + (i % 5) * 0.2}s`,
              }}
            />
          ))}
      </div>
    </div>
  );
}

export default Orb;