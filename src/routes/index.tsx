import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { createParser } from "eventsource-parser";
import { Orb, type OrbState } from "@/components/Orb";

export const Route = createFileRoute("/")(({
  head: () => ({
    meta: [
      { title: "NEXUS — Advanced AI" },
      { name: "description", content: "An advanced voice-first AI assistant with vision." },
      { property: "og:title", content: "NEXUS — Advanced AI" },
    ],
  }),
  component: Index,
}));

// ─── Types ────────────────────────────────────────────────────────────────────

type Msg = {
  role: "user" | "assistant";
  content: string;
  /** Images attached to this message (user turns only) */
  images?: AttachedImage[];
};

type AttachedImage = {
  id: string;
  name: string;
  previewUrl: string;  // object URL for display
  base64: string;      // raw base64 (no data-URL prefix)
  mimeType: string;    // e.g. "image/jpeg"
  sizeKb: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGES = 8;
const MAX_MB = 10;

async function fileToAttached(file: File): Promise<AttachedImage | null> {
  if (!ACCEPTED_TYPES.includes(file.type)) return null;
  if (file.size > MAX_MB * 1024 * 1024) return null;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      // strip the "data:image/...;base64," prefix
      const base64 = dataUrl.split(",")[1] ?? "";
      resolve({
        id: crypto.randomUUID(),
        name: file.name,
        previewUrl: URL.createObjectURL(file),
        base64,
        mimeType: file.type,
        sizeKb: Math.round(file.size / 1024),
      });
    };
    reader.onerror = () => reject(null);
    reader.readAsDataURL(file);
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

function Index() {
  const [messages,  setMessages]  = useState<Msg[]>([]);
  const [input,     setInput]     = useState("");
  const [orbState,  setOrbState]  = useState<OrbState>("idle");
  const [level,     setLevel]     = useState(0);
  const [streaming, setStreaming] = useState("");
  const [error,     setError]     = useState<string | null>(null);
  const [images,    setImages]    = useState<AttachedImage[]>([]);
  const [dragOver,  setDragOver]  = useState(false);
  const [visionMode, setVisionMode] = useState(false); // true while awaiting vision response

  const recRef       = useRef<MediaRecorder | null>(null);
  const chunksRef    = useRef<Blob[]>([]);
  const [recording,  setRecording] = useState(false);

  const audioCtxRef  = useRef<AudioContext | null>(null);
  const analyserRef  = useRef<AnalyserNode | null>(null);
  const gainRef      = useRef<GainNode | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const txRef        = useRef<HTMLUListElement>(null);

  // ── Audio context ────────────────────────────────────────────────────────────
  const ensureAudio = useCallback(async () => {
    if (!audioCtxRef.current) {
      const ctx  = new AudioContext({ sampleRate: 24000 });
      const gain = ctx.createGain();
      const an   = ctx.createAnalyser();
      an.fftSize = 512;
      gain.connect(an);
      an.connect(ctx.destination);
      audioCtxRef.current = ctx;
      gainRef.current     = gain;
      analyserRef.current = an;
    }
    const ctx = audioCtxRef.current!;
    if (ctx.state === "suspended") await ctx.resume().catch(() => {});
    return ctx;
  }, []);

  // ── Amplitude → orb level ────────────────────────────────────────────────────
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
        setLevel((p) => p * 0.6 + Math.min(1, Math.sqrt(sum / buf.length) * 3) * 0.4);
      } else {
        setLevel((p) => p * 0.85);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  // ── Auto-scroll transcript ────────────────────────────────────────────────────
  useEffect(() => {
    txRef.current?.scrollTo({ top: txRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  // ── TTS ──────────────────────────────────────────────────────────────────────
  const speak = useCallback(async (text: string) => {
    const ctx  = await ensureAudio();
    const gain = gainRef.current!;
    setOrbState("speaking");

    const res = await fetch("/api/tts", {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ text }),
    });
    if (!res.ok || !res.body) { setOrbState("idle"); return; }

    let playhead = 0;
    let pending  = new Uint8Array(0);
    let lastEndsAt = 0;

    const playChunk = (incoming: Uint8Array) => {
      const bytes  = new Uint8Array(pending.length + incoming.length);
      bytes.set(pending);
      bytes.set(incoming, pending.length);
      const usable = bytes.length - (bytes.length % 2);
      pending = bytes.slice(usable);
      if (!usable) return;
      const samples = new Int16Array(bytes.buffer, 0, usable / 2);
      const floats  = Float32Array.from(samples, (s) => s / 32768);
      const buffer  = ctx.createBuffer(1, floats.length, 24000);
      buffer.copyToChannel(floats, 0);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      if (playhead === 0) playhead = ctx.currentTime + 0.08;
      else playhead = Math.max(playhead, ctx.currentTime);
      src.start(playhead);
      playhead   += buffer.duration;
      lastEndsAt  = playhead;
    };

    const parser = createParser({
      onEvent(ev) {
        let p: { type: string; audio?: string };
        try { p = JSON.parse(ev.data); } catch { return; }
        if (p.type !== "speech.audio.delta" || !p.audio) return;
        const bin   = atob(p.audio);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        playChunk(bytes);
      },
    });

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    try {
      while (true) { const { value, done } = await reader.read(); if (done) break; parser.feed(value); }
    } finally {
      reader.cancel().catch(() => {});
    }

    window.setTimeout(() => setOrbState("idle"), Math.max(0, (lastEndsAt - ctx.currentTime) * 1000 + 200));
  }, [ensureAudio]);

  // ── Send (text or text+images) ────────────────────────────────────────────────
  const send = useCallback(async (text: string, attachedImages?: AttachedImage[]) => {
    const clean      = text.trim();
    const imgs       = attachedImages ?? images;
    const hasImages  = imgs.length > 0;

    // Need at least text or images
    if (!clean && !hasImages) return;

    setError(null);
    setStreaming("");

    // Add user message to chat
    const userMsg: Msg = {
      role:    "user",
      content: clean || "(image analysis request)",
      images:  hasImages ? imgs : undefined,
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setImages([]);       // clear pending images
    setOrbState("thinking");
    setVisionMode(hasImages);

    let full = "";

    try {
      let res: Response;

      if (hasImages) {
        // ── Vision path ──────────────────────────────────────────────────────
        res = await fetch("/api/vision", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt:   clean,
            images:   imgs.map((img) => ({
              base64:   img.base64,
              mimeType: img.mimeType,
              name:     img.name,
            })),
            messages: messages.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
      } else {
        // ── Text path ────────────────────────────────────────────────────────
        res = await fetch("/api/chat", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: next.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
      }

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Error ${res.status}`);
      }

      const parser = createParser({
        onEvent(ev) {
          if (ev.data === "[DONE]") return;
          try {
            const j     = JSON.parse(ev.data);
            const delta = j.choices?.[0]?.delta?.content ?? "";
            if (delta) { full += delta; setStreaming(full); }
          } catch { /* ignore malformed chunks */ }
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
      setVisionMode(false);
      return;
    }

    setMessages((m) => [...m, { role: "assistant", content: full }]);
    setStreaming("");
    setVisionMode(false);

    if (full.trim()) await speak(full);
    else setOrbState("idle");
  }, [messages, images, speak]);

  // ── Recording ─────────────────────────────────────────────────────────────────
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
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunksRef.current, { type: rec.mimeType });
      setOrbState("thinking");
      if (blob.size < 1024) { setError("Recording too short — try again."); setOrbState("idle"); return; }
      const fd = new FormData();
      fd.append("file", blob, `r.${mime === "audio/mp4" ? "mp4" : "webm"}`);
      const res = await fetch("/api/stt", { method: "POST", body: fd });
      if (!res.ok) { setError(`Transcription failed (${res.status})`); setOrbState("idle"); return; }
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

  // ── Image handling ───────────────────────────────────────────────────────────
  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArr = Array.from(files).filter((f) => ACCEPTED_TYPES.includes(f.type));
    if (!fileArr.length) { setError("Only JPEG, PNG, WebP, or GIF images are accepted."); return; }
    setError(null);

    const toAdd: AttachedImage[] = [];
    for (const file of fileArr) {
      if (images.length + toAdd.length >= MAX_IMAGES) {
        setError(`Maximum ${MAX_IMAGES} images per message.`);
        break;
      }
      if (file.size > MAX_MB * 1024 * 1024) {
        setError(`"${file.name}" exceeds ${MAX_MB} MB limit — skipped.`);
        continue;
      }
      const attached = await fileToAttached(file);
      if (attached) toAdd.push(attached);
    }
    if (toAdd.length) setImages((prev) => [...prev, ...toAdd].slice(0, MAX_IMAGES));
  }, [images]);

  const removeImage = useCallback((id: string) => {
    setImages((prev) => {
      const img = prev.find((i) => i.id === id);
      if (img) URL.revokeObjectURL(img.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    void processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.items)
      .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter(Boolean) as File[];
    if (imageFiles.length) void processFiles(imageFiles);
  }, [processFiles]);

  // ── HUD metrics flicker ──────────────────────────────────────────────────────
  const [metrics, setMetrics] = useState({ cpu: 32, mem: 48, ping: 14 });
  useEffect(() => {
    const id = setInterval(() => setMetrics({
      cpu:  20 + Math.round(Math.random() * 60),
      mem:  30 + Math.round(Math.random() * 50),
      ping:  8 + Math.round(Math.random() * 22),
    }), 1400);
    return () => clearInterval(id);
  }, []);

  const isBusy    = orbState === "thinking" || orbState === "speaking";
  const canSend   = (input.trim().length > 0 || images.length > 0) && !isBusy;
  const statusLabel =
    visionMode          ? "ANALYZING IMAGE"
    : orbState === "speaking"  ? "RESPONDING"
    : orbState === "thinking"  ? "PROCESSING"
    : orbState === "listening" ? "LISTENING"
    : "STANDBY";

  return (
    <div
      className="min-h-screen w-full hud-grid"
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Full-page drag overlay */}
      {dragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="rounded-2xl border-2 border-dashed border-[var(--orb-amber)] px-12 py-8 text-center">
            <p className="font-mono text-lg tracking-widest text-[var(--orb-amber)]">DROP IMAGES HERE</p>
            <p className="mt-1 font-mono text-xs text-[var(--orb-amber)]/60">JPEG · PNG · WebP · GIF · max {MAX_MB} MB each</p>
          </div>
        </div>
      )}

      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8">

        {/* ── Top bar ────────────────────────────────────────────────────────── */}
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-2 w-2 rounded-full bg-[var(--orb-amber)] shadow-[0_0_10px_var(--orb-amber)]" />
            <h1 className="font-mono text-sm tracking-[0.4em] text-[var(--orb-amber)]">N E X U S</h1>
            {visionMode && (
              <span className="rounded-full border border-[var(--orb-amber)]/40 bg-[var(--orb-orange)]/10 px-2 py-0.5 font-mono text-[9px] tracking-widest text-[var(--orb-amber)]/80">
                VISION MODE
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="hud-chip">CPU {metrics.cpu}%</span>
            <span className="hud-chip hidden sm:inline">MEM {metrics.mem}%</span>
            <span className="hud-chip hidden sm:inline">PING {metrics.ping}ms</span>
            <span className="hud-chip">{statusLabel}</span>
          </div>
        </header>

        {/* ── Orb ────────────────────────────────────────────────────────────── */}
        <section className="my-6 flex flex-1 items-center justify-center">
          <Orb state={orbState} level={level} />
        </section>

        {/* ── Transcript ──────────────────────────────────────────────────────── */}
        <section className="mb-4 max-h-72 overflow-y-auto rounded-lg border border-border bg-card/40 p-4 backdrop-blur-sm">
          {messages.length === 0 && !streaming && (
            <p className="text-center font-mono text-xs tracking-widest text-muted-foreground">
              SYSTEM ONLINE — SPEAK, TYPE, OR DROP IMAGES TO BEGIN
            </p>
          )}
          <ul ref={txRef} className="space-y-4">
            {messages.map((m, i) => (
              <li key={i} className="text-sm">
                {/* Speaker label */}
                <span className={
                  m.role === "user"
                    ? "mr-2 font-mono text-xs tracking-widest text-muted-foreground"
                    : "mr-2 font-mono text-xs tracking-widest text-[var(--orb-amber)]"
                }>
                  {m.role === "user" ? "YOU »" : "NEXUS »"}
                </span>
                <span className="text-foreground/90">{m.content}</span>

                {/* Image thumbnails attached to this message */}
                {m.images && m.images.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {m.images.map((img) => (
                      <div key={img.id} className="group relative">
                        <img
                          src={img.previewUrl}
                          alt={img.name}
                          className="h-20 w-20 rounded-lg border border-border object-cover transition-opacity group-hover:opacity-80"
                        />
                        <span className="pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded bg-black/60 px-1 py-0.5 font-mono text-[8px] text-white/80">
                          {img.name}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            ))}

            {/* Streaming response with cursor */}
            {streaming && (
              <li className="text-sm">
                <span className="mr-2 font-mono text-xs tracking-widest text-[var(--orb-amber)]">
                  NEXUS »
                </span>
                <span className="text-foreground/90">{streaming}</span>
                <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-[var(--orb-amber)]" />
              </li>
            )}
          </ul>
        </section>

        {/* ── Image staging strip ──────────────────────────────────────────────── */}
        {images.length > 0 && (
          <div className="mb-3 flex flex-wrap gap-2 rounded-lg border border-[var(--orb-amber)]/30 bg-card/40 p-3">
            <p className="w-full font-mono text-[10px] tracking-widest text-muted-foreground mb-1">
              IMAGES QUEUED FOR ANALYSIS ({images.length}/{MAX_IMAGES})
            </p>
            {images.map((img) => (
              <div key={img.id} className="group relative">
                <img
                  src={img.previewUrl}
                  alt={img.name}
                  className="h-16 w-16 rounded-lg border border-[var(--orb-amber)]/40 object-cover"
                />
                {/* Size badge */}
                <span className="pointer-events-none absolute bottom-1 left-1 right-1 truncate rounded bg-black/70 px-1 py-0.5 font-mono text-[7px] text-white/70">
                  {img.sizeKb}KB
                </span>
                {/* Remove button */}
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-card text-[10px] text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                  aria-label={`Remove ${img.name}`}
                >
                  ✕
                </button>
              </div>
            ))}
            {/* Drop more */}
            {images.length < MAX_IMAGES && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex h-16 w-16 flex-col items-center justify-center rounded-lg border border-dashed border-[var(--orb-amber)]/40 text-[var(--orb-amber)]/50 transition-colors hover:border-[var(--orb-amber)] hover:text-[var(--orb-amber)]"
                aria-label="Add more images"
              >
                <span className="text-xl">+</span>
                <span className="font-mono text-[8px]">ADD</span>
              </button>
            )}
          </div>
        )}

        {/* ── Input row ────────────────────────────────────────────────────────── */}
        <footer
          className="flex items-center gap-2"
          onPaste={handlePaste}
        >
          {/* Mic button */}
          <button
            onClick={recording ? stopRecording : () => void startRecording()}
            disabled={isBusy}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all disabled:opacity-40 ${
              recording
                ? "border-[var(--orb-amber)] bg-[var(--orb-orange)]/30 shadow-[0_0_24px_var(--orb-amber)]"
                : "border-border bg-card/60 hover:border-[var(--orb-amber)]"
            }`}
            aria-label={recording ? "Stop recording" : "Start recording"}
          >
            <MicIcon active={recording} />
          </button>

          {/* Image upload button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isBusy || images.length >= MAX_IMAGES}
            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full border transition-all disabled:opacity-40 ${
              images.length > 0
                ? "border-[var(--orb-amber)] bg-[var(--orb-orange)]/20 shadow-[0_0_12px_var(--orb-amber)/50]"
                : "border-border bg-card/60 hover:border-[var(--orb-amber)]"
            }`}
            aria-label="Attach images"
            title="Attach images (or drag-and-drop / paste)"
          >
            <ImageIcon hasImages={images.length > 0} />
            {images.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[var(--orb-amber)] font-mono text-[9px] font-bold text-background">
                {images.length}
              </span>
            )}
          </button>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            multiple
            className="hidden"
            onChange={(e) => { if (e.target.files?.length) void processFiles(e.target.files); e.target.value = ""; }}
          />

          {/* Text input + Send */}
          <form
            className="flex flex-1 items-center gap-2"
            onSubmit={(e) => { e.preventDefault(); void send(input); }}
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={images.length > 0 ? "Describe what you need (or send images directly)…" : "Address NEXUS…"}
              disabled={isBusy}
              className="h-12 w-full rounded-full border border-border bg-card/60 px-5 font-mono text-sm tracking-wide text-foreground placeholder:text-muted-foreground/60 focus:border-[var(--orb-amber)] focus:outline-none disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!canSend}
              className="h-12 rounded-full border border-[var(--orb-amber)]/60 bg-[var(--orb-orange)]/20 px-5 font-mono text-xs tracking-widest text-[var(--orb-amber)] transition-all hover:bg-[var(--orb-orange)]/40 disabled:opacity-40"
            >
              {images.length > 0 && !input.trim() ? "ANALYZE" : "SEND"}
            </button>
          </form>
        </footer>

        {/* Error display */}
        {error && (
          <p className="mt-3 text-center font-mono text-xs tracking-wider text-destructive">
            {error}
          </p>
        )}

        {/* Hint text */}
        <p className="mt-2 text-center font-mono text-[10px] tracking-widest text-muted-foreground/40">
          Drag images anywhere · paste from clipboard · click 📷 to browse · max {MAX_IMAGES} images / {MAX_MB} MB each
        </p>
      </div>
    </div>
  );
}

// ─── Icon components ─────────────────────────────────────────────────────────

function MicIcon({ active }: { active: boolean }) {
  const col = active ? "oklch(0.95 0.18 75)" : "oklch(0.78 0.19 60)";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="3" width="6" height="12" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

function ImageIcon({ hasImages }: { hasImages: boolean }) {
  const col = hasImages ? "oklch(0.95 0.18 75)" : "oklch(0.78 0.19 60)";
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
      stroke={col} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  );
}
