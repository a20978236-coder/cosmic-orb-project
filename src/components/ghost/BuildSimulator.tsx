// Ghost Vision now runs inside a full-featured Three.js + Gemini iframe.
// The /ghost-vision.html file in public/ handles everything directly:
//   — Google AI Studio API key (user-supplied)
//   — gemini-2.5-flash-image or gemini-2.5-pro model selection
//   — File upload OR URL image ingestion
//   — Three.js 3D model builder with 360° continuous rotation
//   — Real structural physics simulation with failure animation
//   — Type bar for custom simulation directives
//   — Streaming diagnostic terminal

export function BuildSimulator({
  onStateChange,
}: {
  onStateChange?: (s: "idle" | "thinking" | "vision") => void;
}) {
  // Signal parent orb when the iframe loads
  const handleLoad = () => onStateChange?.("idle");

  return (
    <div className="flex flex-col h-full gap-2">
      {/* Info strip */}
      <div className="flex items-center justify-between flex-shrink-0">
        <span className="ghost-chip">GHOST VISION — 3D BUILD SIMULATOR</span>
        <a
          href="/ghost-vision.html"
          target="_blank"
          rel="noopener noreferrer"
          className="ghost-chip cursor-pointer hover:opacity-80 text-[9px]"
          title="Open in full screen"
        >
          ⤢ FULL SCREEN
        </a>
      </div>

      {/* Embedded simulation engine */}
      <iframe
        src="/ghost-vision.html"
        className="flex-1 w-full rounded border border-[var(--orb-amber)]/20"
        style={{ minHeight: "520px" }}
        title="GHOST Vision 3D Build Simulator"
        onLoad={handleLoad}
        allow="camera"
      />

      <p className="text-[8px] text-muted-foreground/50 text-center flex-shrink-0">
        Requires your Google AI Studio API key · Uses Gemini vision models · Three.js 3D engine
      </p>
    </div>
  );
}
