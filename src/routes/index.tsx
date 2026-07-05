import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import { Orb, type OrbState } from "@/components/Orb";
import { EngineeringLab } from "@/components/EngineeringLab";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "NEXUS — Advanced AI" },
      { name: "description", content: "An advanced voice-first AI assistant." },
      { property: "og:title", content: "NEXUS — Advanced AI" },
      { property: "og:description", content: "An advanced voice-first AI assistant." },
    ],
  }),
  component: Index,
});

type Msg = { role: "user" | "assistant"; content: string; imageUrl?: string; hits?: { title: string; url: string; description?: string }[] };
type Attachment = { name: string; mimeType: string; base64: string; url: string };

type Action = { type: "OPEN_LAB" | "CLOSE_LAB" | "REBUILD" | "IMAGE" | "SEARCH"; arg?: string };
const ACTION_RE = /\[\[ACT:([A-Z_]+)(?:\|([^\]]*))?\]\]/g;
function parseActions(text: string): Action[] {
  const out: Action[] = [];
  for (const m of text.matchAll(ACTION_RE)) {
    const type = m[1] as Action["type"];
    if (["OPEN_LAB", "CLOSE_LAB", "REBUILD", "IMAGE", "SEARCH"].includes(type)) {
      out.push({ type, arg: m[2]?.trim() });
    }
  }
  return out;
}
function stripActions(text: string): string {
  return text.replace(ACTION_RE, "").replace(/\s{2,}/g, " ").trim();
}

function Index() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [level, setLevel] = useState(0);
  const [streaming, setStreaming] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showLab, setShowLab] = useState(false);
  const [labCommand, setLabCommand] = useState<{ prompt: string; seq: number } | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Recording
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [recording, setRecording] = useState(false);

  // Audio playback graph (persistent so we can analyse amplitude)
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const levelSampleRef = useRef(0);

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
        levelSampleRef.current = Math.min(1, rms * 3);
      } else {
        levelSampleRef.current = levelSampleRef.current * 0.85;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setLevel((prev) => prev * 0.6 + levelSampleRef.current * 0.4);
    }, 100);
    return () => clearInterval(id);
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
      if (!clean && attachments.length === 0) return;
      setError(null);
      const displayContent =
        clean + (attachments.length ? ` [${attachments.length} image${attachments.length > 1 ? "s" : ""}]` : "");
      const next: Msg[] = [...messages, { role: "user", content: displayContent || "(image)" }];
      setMessages(next);
      setInput("");
      setOrbState("thinking");
      setStreaming("");

      // Check if user is asking to open the lab
      if (clean.toLowerCase().includes("open the lab") || clean.toLowerCase().includes("show the build")) {
        setShowLab(true);
      }

      // Build the outbound messages: if there are attachments, promote the last
      // user turn to multimodal content so the vision-capable model sees them.
      let outbound: Array<{ role: string; content: unknown }> = next.map((m) => ({
        role: m.role,
        content: m.content,
      }));
      if (attachments.length) {
        const parts: Array<
          { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } }
        > = [];
        if (clean) parts.push({ type: "text", text: clean });
        for (const a of attachments) {
          parts.push({
            type: "image_url",
            image_url: { url: `data:${a.mimeType};base64,${a.base64}` },
          });
        }
        outbound[outbound.length - 1] = { role: "user", content: parts };
      }
      setAttachments([]);

      let full = "";
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: outbound }),
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
                setStreaming(stripActions(full));
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

      const spoken = stripActions(full).trim();
      setMessages((m) => [...m, { role: "assistant", content: spoken || "(action)" }]);
      setStreaming("");

      // Execute any action tags emitted by NEXUS.
      const actions = parseActions(full);
      for (const a of actions) {
        if (a.type === "OPEN_LAB") setShowLab(true);
        else if (a.type === "CLOSE_LAB") setShowLab(false);
        else if (a.type === "REBUILD") {
          setShowLab(true);
          setLabCommand({ prompt: a.arg || "", seq: Date.now() });
        } else if (a.type === "IMAGE" && a.arg) {
          void generateImage(a.arg);
        } else if (a.type === "SEARCH" && a.arg) {
          void runSearch(a.arg);
        }
      }

      if (spoken) await speak(spoken);
      else setOrbState("idle");
    },
    [messages, speak, attachments],
  );

  const generateImage = useCallback(async (prompt: string) => {
    try {
      const res = await fetch("/api/image", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });
      if (!res.ok) throw new Error(`Image ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      setMessages((m) => [...m, { role: "assistant", content: `[image] ${prompt}`, imageUrl: url }]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Image generation failed");
    }
  }, []);

  const runSearch = useCallback(async (query: string) => {
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const j = (await res.json()) as { hits?: { title: string; url: string; description?: string }[]; error?: string };
      if (j.error && !j.hits?.length) {
        setMessages((m) => [...m, { role: "assistant", content: j.error! }]);
        return;
      }
      setMessages((m) => [
        ...m,
        { role: "assistant", content: `Search: ${query}`, hits: j.hits ?? [] },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    }
  }, []);

  const onFilesPicked = useCallback(async (files: FileList | null) => {
    if (!files || !files.length) return;
    const picked: Attachment[] = [];
    for (const file of Array.from(files).slice(0, 4)) {
      if (!file.type.startsWith("image/")) continue;
      const buf = await file.arrayBuffer();
      let bin = "";
      const bytes = new Uint8Array(buf);
      for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
      const base64 = btoa(bin);
      picked.push({
        name: file.name,
        mimeType: file.type,
        base64,
        url: URL.createObjectURL(file),
      });
    }
    setAttachments((prev) => [...prev, ...picked].slice(0, 4));
  }, []);

  const removeAttachment = useCallback((idx: number) => {
    setAttachments((prev) => {
      const a = prev[idx];
      if (a) URL.revokeObjectURL(a.url);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

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
              N E X U S
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="hud-chip">CPU {metrics.cpu}%</span>
            <span className="hud-chip hidden sm:inline">MEM {metrics.mem}%</span>
            <span className="hud-chip hidden sm:inline">PING {metrics.ping}ms</span>
            <span className="hud-chip">{statusLabel}</span>
            
            <button 
              onClick={() => setShowLab(!showLab)}
              className="hud-chip cursor-pointer hover:opacity-80 transition-all select-none"
            >
              {showLab ? "✕ CLOSE LAB" : "⚙️ OPEN LAB"}
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <section className="my-6 flex flex-1 flex-col items-center justify-center gap-6">
          {showLab ? (
            <div className="w-full max-w-2xl aspect-square md:aspect-video">
              <EngineeringLab command={labCommand ?? undefined} />
            </div>
          ) : (
            <Orb state={orbState} level={level} />
          )}
        </section>

        {/* Transcript */}
        <section className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-border bg-card/40 p-4 backdrop-blur-sm">
          {messages.length === 0 && !streaming && (
            <p className="text-center font-mono text-xs tracking-widest text-muted-foreground">
              SYSTEM ONLINE — SPEAK OR TYPE TO BEGIN
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
                  {m.role === "user" ? "YOU »" : "NEXUS »"}
                </span>
                <span className="text-foreground/90">{m.content}</span>
              </li>
            ))}
            {streaming && (
              <li className="text-sm">
                <span className="mr-2 font-mono text-xs tracking-widest text-[var(--orb-amber)]">
                  NEXUS »
                </span>
                <span className="text-foreground/90">{streaming}</span>
              </li>
            )}
          </ul>
        </section>

        {/* Input row */}
        <footer className="flex flex-col gap-2">
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {attachments.map((a, i) => (
                <div
                  key={i}
                  className="group relative h-16 w-16 overflow-hidden rounded-md border border-border bg-card/60"
                >
                  <img src={a.url} alt={a.name} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removeAttachment(i)}
                    className="absolute right-0 top-0 flex h-5 w-5 items-center justify-center rounded-bl-md bg-black/70 font-mono text-xs text-[var(--orb-amber)] opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="Remove image"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
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
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              void onFilesPicked(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-border bg-card/60 transition-all hover:border-[var(--orb-amber)]"
            aria-label="Attach image"
            title="Attach image"
          >
            <ImageIcon />
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
              placeholder={attachments.length ? "Ask about the image…" : "Address NEXUS…"}
              disabled={orbState !== "idle" && orbState !== "listening"}
              className="h-12 w-full rounded-full border border-border bg-card/60 px-5 font-mono text-sm tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:border-[var(--orb-amber)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={
                (!input.trim() && attachments.length === 0) ||
                orbState === "thinking" ||
                orbState === "speaking"
              }
              className="h-12 rounded-full border border-[var(--orb-amber)]/60 bg-[var(--orb-orange)]/20 px-5 font-mono text-xs tracking-widest text-[var(--orb-amber)] transition-all hover:bg-[var(--orb-orange)]/40 disabled:opacity-40"
            >
              SEND
            </button>
          </form>
          </div>
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

function ImageIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="oklch(0.78 0.19 60)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-5-5L5 21" />
    </svg>
  );
}
