import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import { Orb, type OrbState } from "@/components/Orb";

export const Route = createFileRoute("/")(({ 
  head: () => ({ meta: [
    { title: "GHOST — Autonomous Intelligence" },
    { name: "description", content: "G.H.O.S.T autonomous AI with 3D build simulation." },
    { property: "og:title", content: "GHOST — Autonomous Intelligence" },
  ]}),
  component: GhostIndex,
}));

type Msg = { id: string; role:"user"|"assistant"; content:string };

function GhostIndex(){
  const [messages,  setMessages]  = useState<Msg[]>([]);
  const [input,     setInput]     = useState("");
  const [orbState,  setOrbState]  = useState<OrbState>("idle");
  const [level,     setLevel]     = useState(0);
  const [streaming, setStreaming] = useState("");
  const [error,     setError]     = useState<string|null>(null);
  const [rotating,  setRotating]  = useState(false);   // 360° showcase toggle

  const recRef     = useRef<MediaRecorder|null>(null);
  const chunksRef  = useRef<Blob[]>([]);
  const [recording,setRecording] = useState(false);
  const audioCtxRef = useRef<AudioContext|null>(null);
  const analyserRef = useRef<AnalyserNode|null>(null);
  const gainRef     = useRef<GainNode|null>(null);
  const txRef       = useRef<HTMLUListElement>(null);
  // decoupled amplitude sampling: sample at RAF into this ref, update React state at a lower rate
  const levelSampleRef = useRef(0);
  // worker for TTS chunk decoding
  const ttsWorkerRef = useRef<Worker|null>(null);
  // pending byte for odd-length chunk handling
  const pendingRef = useRef<Uint8Array | null>(null);
  // last scroll timestamp
  const lastScrollRef = useRef(0);
  // metrics interval id
  const metricsIntervalRef = useRef<number | null>(null);

  // derive orb state: vision/thinking/speaking take priority; else idle or rotating
  const idleState = (): OrbState => rotating ? "rotating" : "idle";

  const ensureAudio = useCallback(async()=>{
    if(!audioCtxRef.current){
      const ctx=new AudioContext({sampleRate:24000});
      const gain=ctx.createGain(); const an=ctx.createAnalyser(); an.fftSize=512;
      gain.connect(an); an.connect(ctx.destination);
      audioCtxRef.current=ctx; gainRef.current=gain; analyserRef.current=an;
    }
    const ctx=audioCtxRef.current!;
    if(ctx.state==="suspended") await ctx.resume().catch(()=>{});
    return ctx;
  },[]);

  // amplitude poll - sample at RAF but only update React state at a lower rate (throttle)
  useEffect(()=>{
    let raf=0; const buf=new Uint8Array(256);
    const loop=()=>{
      const an=analyserRef.current;
      if(an){
        an.getByteTimeDomainData(buf);
        let sum=0; for(let i=0;i<buf.length;i++){ const v=(buf[i]-128)/128; sum+=v*v; }
        const sampled = Math.min(1, Math.sqrt(sum/buf.length)*3);
        // store sampled level into a ref (no React state update here)
        levelSampleRef.current = sampled;
      } else {
        // decay the sampled value when no analyser is available
        levelSampleRef.current = levelSampleRef.current * 0.85;
      }
      raf=requestAnimationFrame(loop);
    };
    raf=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(raf);
  },[]);

  // throttle React state updates for `level` to ~10Hz to avoid re-rendering every frame
  useEffect(()=>{
    const id = window.setInterval(()=>{
      setLevel(prev=> prev*0.6 + Math.min(1, levelSampleRef.current) * 0.4);
    }, 100);
    return ()=>clearInterval(id);
  },[]);

  // sync rotation state
  useEffect(()=>{
    if(rotating&&orbState==="idle") setOrbState("rotating");
    else if(!rotating&&orbState==="rotating") setOrbState("idle");
  },[rotating,orbState]);

  // auto-scroll transcript: immediate when updates are frequent, smooth otherwise
  useEffect(()=>{
    const el = txRef.current;
    if(!el) return;
    const now = Date.now();
    const behavior = (now - (lastScrollRef.current||0)) < 300 ? 'auto' : 'smooth';
    lastScrollRef.current = now;
    el.scrollTo({top: el.scrollHeight, behavior: behavior as ScrollBehavior});
  },[messages,streaming]);

  useEffect(()=>{
    // setup metrics interval but pause when hidden
    const tick = ()=>setMetrics({cpu:18+Math.round(Math.random()*65),mem:32+Math.round(Math.random()*50),ping:7+Math.round(Math.random()*24)});
    const start = ()=>{ if(metricsIntervalRef.current==null) metricsIntervalRef.current = window.setInterval(tick,1500); };
    const stop = ()=>{ if(metricsIntervalRef.current!=null){ clearInterval(metricsIntervalRef.current); metricsIntervalRef.current=null; } };
    const onVis = ()=>{ if(typeof document!=='undefined' && document.hidden) stop(); else start(); };
    start(); document.addEventListener('visibilitychange', onVis);
    return ()=>{ stop(); document.removeEventListener('visibilitychange', onVis); };
  },[]);

  // ensure worker is cleaned up on unmount
  useEffect(()=>{
    return ()=>{
      if(ttsWorkerRef.current){ ttsWorkerRef.current.terminate(); ttsWorkerRef.current = null; }
    };
  },[]);

  const speak = useCallback(async(text:string)=>{
    const ctx=await ensureAudio(); const gain=gainRef.current!;
    setOrbState("speaking");
    const res=await fetch("/api/tts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
    if(!res.ok||!res.body){setOrbState(idleState());return;}

    // schedule playback per chunk (avoid large concatenation)
    let ph=0; let last=0;

    const playChunk = (bytes:Uint8Array)=>{
      // handle odd pending byte
      if(pendingRef.current && pendingRef.current.length){
        const combined = new Uint8Array(pendingRef.current.length + bytes.length);
        combined.set(pendingRef.current,0); combined.set(bytes,pendingRef.current.length);
        bytes = combined; pendingRef.current = null;
      }
      // if odd length, keep last byte for next chunk
      if(bytes.length % 2 !== 0){ pendingRef.current = bytes.slice(bytes.length-1); bytes = bytes.slice(0, bytes.length-1); }
      if(bytes.length===0) return;
      const s = new Int16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength/2);
      const f = new Float32Array(s.length);
      for(let i=0;i<s.length;i++) f[i] = s[i]/32768;
      const buf = ctx.createBuffer(1, f.length, 24000); buf.copyToChannel(f,0);
      const src = ctx.createBufferSource(); src.buffer = buf; src.connect(gain);
      if(ph===0) ph = ctx.currentTime + 0.08; else ph = Math.max(ph, ctx.currentTime);
      src.start(ph); ph += buf.duration; last = ph;
    };

    // ensure worker exists
    if(!ttsWorkerRef.current){
      try{
        ttsWorkerRef.current = new Worker(new URL('../workers/ttsDecoder.worker.ts', import.meta.url), { type: 'module' });
      }catch(e){
        // worker not available; fallback to atob on main thread
        ttsWorkerRef.current = null;
      }
    }

    const parser = createParser({onEvent(ev){
      if(ev.data==="[DONE]") return;
      try{
        const j = JSON.parse(ev.data);
        const p = j.choices?.[0]?.delta || {};
        const audioBase64 = p.audio;
        if(!audioBase64) {
          // streaming text
          const d = j.choices?.[0]?.delta?.content ?? "";
          if(d){ setStreaming(s => s + d); }
          return;
        }
        // If we have a worker, use it to decode base64 -> ArrayBuffer
        if(ttsWorkerRef.current){
          const worker = ttsWorkerRef.current;
          const onMessage = (ev2: MessageEvent) => {
            const ab = ev2.data as ArrayBuffer;
            playChunk(new Uint8Array(ab));
          };
          worker.addEventListener('message', onMessage, { once: true });
          worker.postMessage(audioBase64);
        }else{
          // fallback on main thread (existing behavior)
          const bin = atob(audioBase64);
          const bytes = new Uint8Array(bin.length);
          for(let i=0;i<bin.length;i++) bytes[i]=bin.charCodeAt(i);
          playChunk(bytes);
        }
      }catch(err){/* ignore parse errors */}
    }});

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try{ while(true){ const { value, done } = await reader.read(); if(done) break; parser.feed(value); } }
    finally{ reader.cancel().catch(()=>{}); }

    window.setTimeout(()=>setOrbState(idleState()), Math.max(0, (last - ctx.currentTime)*1000 + 200));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[ensureAudio,rotating]);

  const send = useCallback(async(text:string)=>{
    const clean=text.trim();if(!clean)return;
    setError(null);setStreaming("");
    const id = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    const next:Msg[]=[...messages,{id,role:"user",content:clean}];
    setMessages(next);setInput("");setOrbState("thinking");
    let full="";
    try{
      const res=await fetch("/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({messages:next})});
      if(!res.ok||!res.body)throw new Error(`HTTP ${res.status}`);
      const parser=createParser({onEvent(ev){
        if(ev.data==="[DONE]")return;
        try{const j=JSON.parse(ev.data);const d=j.choices?.[0]?.delta?.content??"";if(d){full+=d;setStreaming(full);}}catch{}
      }});
      const reader=res.body.pipeThrough(new TextDecoderStream()).getReader();
      while(true){const{value,done}=await reader.read();if(done)break;parser.feed(value);}    
    }catch(e){setError(e instanceof Error?e.message:"Request failed");setOrbState(idleState());return;}
    const aid = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
    setMessages(m=>[...m,{id:aid,role:"assistant",content:full}]);setStreaming("");
    if(full.trim())await speak(full);else setOrbState(idleState());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[messages,speak,rotating]);

  const startRecording=useCallback(async()=>{
    setError(null);let stream:MediaStream;
    try{stream=await navigator.mediaDevices.getUserMedia({audio:true});}
    catch{setError("Microphone access denied.");return;}
    const mime=["audio/webm","audio/mp4"].find(t=>MediaRecorder.isTypeSupported(t));
    if(!mime){stream.getTracks().forEach(t=>t.stop());setError("Unsupported audio format.");return;}
    const rec=new MediaRecorder(stream,{mimeType:mime});
    chunksRef.current=[];
    rec.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};
    rec.onstop=async()=>{
      stream.getTracks().forEach(t=>t.stop());
      const blob=new Blob(chunksRef.current,{type:rec.mimeType});setOrbState("thinking");
      if(blob.size<1024){setError("Too short.");setOrbState(idleState());return;}
      const fd=new FormData();fd.append("file",blob,`r.${mime==="audio/mp4"?"mp4":"webm"}`);
      const res=await fetch("/api/stt",{method:"POST",body:fd});
      if(!res.ok){setError(`STT ${res.status}`);setOrbState(idleState());return;}
      const{text}=await res.json() as{text:string};
      if(text?.trim())await send(text);else setOrbState(idleState());
    };
    recRef.current=rec;rec.start();setRecording(true);setOrbState("listening");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[send,rotating]);

  const stopRecording=useCallback(()=>{recRef.current?.stop();recRef.current=null;setRecording(false);},[]);

  const [metrics,setMetrics]=useState({cpu:28,mem:44,ping:11});

  const isBusy=orbState==="thinking"||orbState==="speaking";
  const label=orbState==="rotating"?"360° SHOWCASE":orbState==="vision"?"GHOST VISION":orbState==="speaking"?"RESPONDING":orbState==="thinking"?"PROCESSING":orbState==="listening"?"LISTENING":"S[...]";

  return(
    <div className="min-h-screen w-full hud-grid flex flex-col">
      <div className="flex flex-col px-4 py-5 md:px-8 w-full">
        <div className="mx-auto w-full max-w-3xl flex flex-col flex-1">

          {/* top bar */}
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 rounded-full bg-[var(--orb-amber)] shadow-[0_0_10px_var(--orb-amber)]"/>
              <h1 className="font-mono text-sm tracking-[0.4em] text-[var(--orb-amber)]">G H O S T</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="hud-chip">CPU {metrics.cpu}%</span>
              <span className="hud-chip hidden sm:inline">MEM {metrics.mem}%</span>
              <span className="hud-chip hidden sm:inline">PING {metrics.ping}ms</span>
              <span className="hud-chip">{label}</span>

              {/* 360° toggle */}
              <button onClick={()=>setRotating(r=>!r)}
                className={`hud-chip cursor-pointer hover:opacity-80 transition-all select-none ${rotating?"shadow-[0_0_14px_var(--orb-amber)]":""}`}
                title="Toggle 360° showcase rotation">
                ⟳ {rotating?"360° ON":"360°"}
              </button>

              {/* ghost vision toggle */}
              <Link to="/ghost-vision"
                className="hud-chip cursor-pointer hover:opacity-80 transition-all select-none"
                title="Open Ghost Vision 3D Build Simulator">
                👁 GHOST VISION
              </Link>
            </div>
          </header>

          {/* orb */}
          <section className="flex items-center justify-center my-6 flex-1">
            <Orb state={orbState} level={level}/>
          </section>

          {/* transcript */}
          <section className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-border bg-card/40 p-4 backdrop-blur-sm ghost-scroll">
            {!messages.length&&!streaming&&(
              <p className="text-center font-mono text-xs tracking-widest text-muted-foreground">
                GHOST ONLINE — SPEAK OR TYPE TO ENGAGE
              </p>
            )}
            <ul ref={txRef} className="space-y-3">
              {messages.map((m)=> (
                <li key={m.id} className="text-sm">
                  <span className={m.role==="user"?"mr-2 font-mono text-xs tracking-widest text-muted-foreground":"mr-2 font-mono text-xs tracking-widest text-[var(--orb-amber)]"}>
                    {m.role==="user"?"YOU »":"GHOST »"}
                  </span>
                  <span className="text-foreground/90">{m.content}</span>
                </li>
              ))}
              {streaming&&(
                <li className="text-sm">
                  <span className="mr-2 font-mono text-xs tracking-widest text-[var(--orb-amber)]">GHOST »</span>
                  <span className="text-foreground/90">{streaming}</span>
                  <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-[var(--orb-amber)]"/>
                </li>
              )}
            </ul>
          </section>

          {/* input row */}
          <footer className="flex items-center gap-2">
            <button onClick={recording?stopRecording:()=>void startRecording()} disabled={isBusy}
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all disabled:opacity-40 ${
                recording?"border-[var(--orb-amber)] bg-[var(--orb-orange)]/30 shadow-[0_0_24px_var(--orb-amber)]":"border-border bg-card/60 hover:border-[var(--orb-amber)]"}`}
              aria-label={recording?"Stop":"Record"}>
              <MicIcon active={recording}/>
            </button>
            <form className="flex flex-1 gap-2" onSubmit={e=>{e.preventDefault();void send(input);}}>
              <input value={input} onChange={e=>setInput(e.target.value)}
                placeholder="Address GHOST…" disabled={isBusy}
                className="h-12 flex-1 rounded-full border border-border bg-card/60 px-5 font-mono text-sm tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:border-[var(--o...]"/>
              <button type="submit" disabled={!input.trim()||isBusy}
                className="h-12 rounded-full border border-[var(--orb-amber)]/60 bg-[var(--orb-orange)]/20 px-5 font-mono text-xs tracking-widest text-[var(--orb-amber)] hover:bg-[var(--orb-orang...]"
                >SEND
              </button>
            </form>
          </footer>

          {error&&<p className="mt-3 text-center font-mono text-xs tracking-wider text-destructive">{error}</p>}
        </div>
      </div>
    </div>
  );
}

function MicIcon({active}:{active:boolean}){
  return(
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={active?"oklch(0.95 0.12 235)":"oklch(0.78 0.22 252)"}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3"/>
      <path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/>
    </svg>
  );
}

export default GhostIndex;
