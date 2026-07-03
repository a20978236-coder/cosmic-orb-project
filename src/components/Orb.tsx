import React, { useEffect, useRef } from "react";
export type OrbState = "idle"|"listening"|"thinking"|"speaking"|"rotating"|"vision";

const RINGS = [
  {rx:0,  ry:0,  rz:0,  size:100, speed:0.6, dir: 1},
  {rx:0,  ry:90, rz:0,  size:100, speed:0.8, dir:-1},
  {rx:90, ry:0,  rz:0,  size:100, speed:0.5, dir: 1},
  {rx:30, ry:45, rz:0,  size:95,  speed:1.1, dir:-1},
  {rx:60, ry:20, rz:15, size:92,  speed:0.9, dir: 1},
  {rx:0,  ry:30, rz:60, size:88,  speed:1.3, dir:-1},
  {rx:75, ry:60, rz:30, size:84,  speed:1.0, dir: 1},
  {rx:45, ry:90, rz:45, size:80,  speed:1.5, dir:-1},
  {rx:20, ry:70, rz:80, size:76,  speed:0.7, dir: 1},
  {rx:55, ry:10, rz:55, size:72,  speed:1.7, dir:-1},
  {rx:35, ry:55, rz:25, size:68,  speed:1.2, dir: 1},
  {rx:80, ry:35, rz:10, size:64,  speed:1.4, dir:-1},
];

const SPEED: Record<OrbState,number> = {
  idle:0.9, listening:1.3, thinking:2.0, speaking:3.2, rotating:5.0, vision:2.5,
};

function OrbComponent({ state, level=0 }: { state:OrbState; level?:number }) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const rafRef   = useRef<number|null>(null);
  const yawRef   = useRef(0);
  const pitchRef = useRef(0);
  const tRef     = useRef(0);
  const ringRefs = useRef<Array<HTMLDivElement|null>>([]);
  const phaseRef = useRef<number[]>(RINGS.map(()=>Math.random()*Math.PI*2));
  const levelRef = useRef(0);
  useEffect(()=>{ levelRef.current=level; },[level]);

  useEffect(()=>{
    const speedMul = SPEED[state];
    const isRotating = state==="rotating";
    const tick = ()=>{
      tRef.current+=1;
      // 360° full rotation: fixed 15° pitch tilt so ALL rings are visible as it sweeps
      if (isRotating) {
        yawRef.current  += 0.9;   // fast, steady, full 360°
        pitchRef.current = 15;    // locked tilt — reveals ring depth
      } else {
        yawRef.current  += 0.25*speedMul;
        pitchRef.current = Math.sin(tRef.current*0.01)*12;
      }
      if (wrapRef.current)
        wrapRef.current.style.transform = `rotateX(${pitchRef.current}deg) rotateY(${yawRef.current}deg)`;

      const lvl = levelRef.current;
      RINGS.forEach((r,i)=>{
        const el = ringRefs.current[i]; if(!el) return;
        phaseRef.current[i] += r.speed*r.dir*speedMul*(isRotating?0.02:0.012);
        const spin = (phaseRef.current[i]*180)/Math.PI;
        const wobble =
          state==="speaking" ? 1+lvl*0.18*Math.sin(tRef.current*0.4+i)
          : state==="vision" ? 1+0.06*Math.sin(tRef.current*0.15+i*0.5)
          : 1;
        el.style.transform = `rotateX(${r.rx}deg) rotateY(${r.ry}deg) rotateZ(${r.rz+spin}deg) scale(${wobble})`;
      });
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return ()=>{ if(rafRef.current) cancelAnimationFrame(rafRef.current); };
  },[state]);

  const intensity =
    state==="rotating" ? 1.9 : state==="vision" ? 1.5
    : state==="speaking" ? 1+level*0.6 : state==="listening" ? 0.85
    : state==="thinking" ? 0.7 : 0.5;
  const sparkCount = state==="rotating"?28:state==="vision"?20:18;

  return (
    <div className="orb-stage">
      <div className="orb-halo" style={{opacity:0.35+intensity*0.45}}/>
      <div className="orb-scene" data-state={state}>
        <div className="orb-wrap" ref={wrapRef}>
          {RINGS.map((r,i)=>(
            <div key={i} ref={el=>{ringRefs.current[i]=el;}} className="orb-ring"
              style={{width:`${r.size}%`,height:`${r.size}%`}}>
              <span className="node n1"/><span className="node n2"/>
              <span className="node n3"/><span className="node n4"/>
            </div>
          ))}
          <div className="orb-core" style={{transform:`scale(${1+level*0.4})`}}/>
        </div>
        {(state==="speaking"||state==="rotating"||state==="vision")&&
          Array.from({length:sparkCount}).map((_,i)=>(
            <span key={i} className="orb-spark" style={{
              ["--a" as string]:`${(i/sparkCount)*360}deg`,
              ["--d" as string]:`${(state==="rotating"?0.7:1.4)+(i%5)*0.18}s`,
            }}/>
          ))}
      </div>
    </div>
  );
}

export const Orb = React.memo(OrbComponent, (prev, next) => prev.state === next.state && prev.level === next.level);
