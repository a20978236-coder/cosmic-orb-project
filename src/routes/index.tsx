import { createFileRoute } from "@tanstack/react-router";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import type { OrbState } from "@/components/Orb";

// Lazy-load the heavy 3D Orb so it doesn't bloat the initial bundle.
const Orb = lazy(() => import("@/components/Orb"));

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "JARVIS — Advanced AI" },
      { name: "description", content: "JARVIS: voice-first AI assistant with the GHOST core." },
      { property: "og:title", content: "JARVIS — Advanced AI" },
      { property: "og:description", content: "JARVIS: voice-first AI assistant with the GHOST core." },
    ],
  }),
  component: Index,
});

type Msg = { role: "user" | "assistant"; content: string };

function Index() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [level, setLevel] = useState(0);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Recording
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  // Audio playback graph (persistent so we can analyse amplitude)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  const ensureAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext({ sampleRate: 24000 });
      const gain = ctx.createGain();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      gain.connect(an);
      an.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainRef.current = gain;
      analyserRef.current = an;
    }
    const ctx = audioCtxRef.current!;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    return ctx;
  }, []);

  // Continuous amplitude poll → orb level
  useEffect(() => {
    let raf = 0;
    const buf = new Uint8Array(256);
    const loop = () => {
      const an = analyserRef.current;
      if (an) {
        an.getByteTimeDomainData(buf);
        let sum = 0;
        for (let i = 0; i < buf.length; i++) {
          const v = (buf[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / buf.length);
        setLevel((prev) => prev * 0.6 + Math.min(1, rms * 3) * 0.4);
      } else {
        setLevel((prev) => prev * 0.85);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const ctx = await ensureAudio();
      const gain = gainRef.current!;
      setOrbState("speaking");

      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok || !res.body) {
        setError(`TTS failed (${res.status})`);
        setOrbState("idle");
        return;
      }

      let playhead = 0;
      let pending = new Uint8Array(0);
      let lastEndsAt = 0;

      const playChunk = (incoming: Uint8Array) => {
        const bytes = new Uint8Array(pending.length + incoming.length);
        bytes.set(pending);
        bytes.set(incoming, pending.length);
        const usable = bytes.length - (bytes.length % 2);
        pending = bytes.slice(usable);
        if (!usable) return;
        const samples = new Int16Array(bytes.buffer, 0, usable / 2);
        const floats = Float32Array.from(samples, (s) => s / 32768);
        const buffer = ctx.createBuffer(1, floats.length, 24000);
        buffer.copyToChannel(floats, 0);
        const src = ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(gain);
        if (playhead === 0) playhead = ctx.currentTime + 0.08;
        else playhead = Math.max(playhead, ctx.currentTime);
        src.start(playhead);
        playhead += buffer.duration;
        lastEndsAt = playhead;
      };

      const parser = createParser({
        onEvent(ev) {
          let p: { type: string; audio?: string };
          try {
            p = JSON.parse(ev.data);
          } catch {
            return;
          }
          if (p.type !== "speech.audio.delta" || !p.audio) return;
          const bin = atob(p.audio);
          const bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          playChunk(bytes);
        },
      });

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(value);
        }
      } finally {
        reader.cancel().catch(() => {});
      }

      const waitMs = Math.max(0, (lastEndsAt - ctx.currentTime) * 1000 + 200);
      window.setTimeout(() => setOrbState("idle"), waitMs);
    },
    [ensureAudio],
  );

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      setError(null);
      const next: Msg[] = [...messages, { role: "user", content: clean }];
      setMessages(next);
      setInput("");
      setOrbState("thinking");
      setStreaming("");

      let full = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next }),
        });
        if (!res.ok || !res.body) throw new Error(`Chat ${res.status}`);

        const parser = createParser({
          onEvent(ev) {
            if (ev.data === "[DONE]") return;
            try {
              const j = JSON.parse(ev.data);
              const delta = j.choices?.[0]?.delta?.content ?? "";
              if (delta) {
                full += delta;
                setStreaming(full);
              }
            } catch {
              /* ignore */
            }
          },
        });
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          parser.feed(value);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
        setOrbState("idle");
        return;
      }

      setMessages((m) => [...m, { role: "assistant", content: full }]);
      setStreaming("");
      if (full.trim()) await speak(full);
      else setOrbState("idle");
    },
    [messages, speak],
  );

  const startRecording = useCallback(async () => {
    setError(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Microphone access denied.");
      return;
    }
    const mime = ["audio/webm", "audio/mp4"].find((t) => MediaRecorder.isTypeSupported(t));
    if (!mime) {
      stream.getTracks().forEach((t) => t.stop());
      setError("Browser cannot record a supported audio format.");
      return;
    }
    const rec = new MediaRecorder(stream, { mimeType: mime });
    chunksRef.current = [];
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data);
    };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType });
      setOrbState("thinking");
      if (blob.size < 1024) {
        setError("Recording too short — try again.");
        setOrbState("idle");
        return;
      }
      const fd = new FormData();
      fd.append("file", blob, `r.${mime === "audio/mp4" ? "mp4" : "webm"}`);
      const res = await fetch("/api/stt", { method: "POST", body: fd });
      if (!res.ok) {
        setError(`Transcription failed (${res.status})`);
        setOrbState("idle");
        return;
      }
      const { text } = (await res.json()) as { text: string };
      if (text?.trim()) await send(text);
      else setOrbState("idle");
    };
    recRef.current = rec;
    rec.start();
    setRecording(true);
    setOrbState("listening");
  }, [send]);

  const stopRecording = useCallback(() => {
    recRef.current?.stop();
    recRef.current = null;
    setRecording(false);
  }, []);

  // metric flicker for HUD
  const [metrics, setMetrics] = useState({ cpu: 32, mem: 48, ping: 14 });
  useEffect(() => {
    const id = setInterval(() => {
      setMetrics({
        cpu: 20 + Math.round(Math.random() * 60),
        mem: 30 + Math.round(Math.random() * 50),
        ping: 8 + Math.round(Math.random() * 22),
      });
    }, 1400);
    return () => clearInterval(id);
  }, []);

  const statusLabel =
    orbState === "speaking"
      ? "RESPONDING"
      : orbState === "thinking"
        ? "PROCESSING"
        : orbState === "listening"
          ? "LISTENING"
          : "STANDBY";

  return (
    <div className="min-h-screen w-full hud-grid">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8">
        {/* Top bar */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[var(--orb-amber)] shadow-[0_0_10px_var(--orb-amber)]" />
            <h1 className="font-mono text-sm tracking-[0.4em] text-[var(--orb-amber)]">
              J A R V I S
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hud-chip">CPU {metrics.cpu}%</span>
            <span className="hud-chip hidden sm:inline">MEM {metrics.mem}%</span>
            <span className="hud-chip hidden sm:inline">PING {metrics.ping}ms</span>
            <span className="hud-chip">{statusLabel}</span>
          </div>
        </header>

        {/* Orb */}
        <section className="my-6 flex flex-1 items-center justify-center">
          <Suspense
            fallback={
              <div className="flex h-64 w-64 items-center justify-center font-mono text-xs tracking-[0.4em] text-[var(--orb-amber)]/60">
                BOOTING CORE…
              </div>
            }
          >
            <Orb state={orbState} level={level} />
          </Suspense>
        </section>

        {/* Transcript */}
        <section className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-border bg-card/40 p-4 backdrop-blur-sm">
          {messages.length === 0 && !streaming && (
            <p className="text-center font-mono text-xs tracking-widest text-muted-foreground">
              JARVIS ONLINE — SPEAK OR TYPE TO BEGIN
            </p>
          )}
          <ul className="space-y-3">
            {messages.map((m, i) => (
              <li key={i} className="text-sm">
                <span
                  className={
                    m.role === "user"
                      ? "mr-2 font-mono text-xs tracking-widest text-muted-foreground"
                      : "mr-2 font-mono text-xs tracking-widest text-[var(--orb-amber)]"
                  }
                >
                  {m.role === "user" ? "YOU »" : "JARVIS »"}
                </span>
                <span className="text-foreground/90">{m.content}</span>
              </li>
            ))}
            {streaming && (
              <li className="text-sm">
                <span className="mr-2 font-mono text-xs tracking-widest text-[var(--orb-amber)]">
                  JARVIS »
                </span>
                <span className="text-foreground/90">{streaming}</span>
              </li>
            )}
          </ul>
        </section>

        {/* Input row */}
        <footer className="flex items-center gap-2">
          <button
            onClick={recording ? stopRecording : startRecording}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all ${
              recording
                ? "border-[var(--orb-amber)] bg-[var(--orb-orange)]/30 shadow-[0_0_24px_var(--orb-amber)]"
                : "border-border bg-card/60 hover:border-[var(--orb-amber)]"
            }`}
            aria-label={recording ? "Stop recording" : "Start recording"}
          >
            <MicIcon active={recording} />
          </button>
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Address JARVIS…"
              disabled={orbState !== "idle" && orbState !== "listening"}
              className="h-12 w-full rounded-full border border-border bg-card/60 px-5 font-mono text-sm tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:border-[var(--orb-amber)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || orbState === "thinking" || orbState === "speaking"}
              className="h-12 rounded-full border border-[var(--orb-amber)]/60 bg-[var(--orb-orange)]/20 px-5 font-mono text-xs tracking-widest text-[var(--orb-amber)] transition-all hover:bg-[var(--orb-orange)]/40 disabled:opacity-40"
            >
              SEND
            </button>
          </form>
        </footer>

        {error && (
          <p className="mt-3 text-center font-mono text-xs tracking-wider text-destructive">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke={active ? "oklch(0.95 0.18 75)" : "oklch(0.78 0.19 60)"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}
