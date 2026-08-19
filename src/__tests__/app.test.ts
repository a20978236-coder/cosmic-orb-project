import { describe, it, expect } from "bun:test";
import { parseComponents, parseDiagnosis } from "../lib/engineering-parser";
import { cn } from "../lib/utils";
import { consumeLastCapturedError } from "../lib/error-capture";
import { renderErrorPage } from "../lib/error-page";

describe("Cosmic Orb Core Logic & Action Parser", () => {
  it("should extract actions from NEXUS assistant responses correctly", () => {
    const text = "Initializing engineering lab now. [[ACT:OPEN_LAB]] Telemetry is calibrated.";
    const match = text.match(/\[\[ACT:([^\]]+)\]\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("OPEN_LAB");
  });

  it("should parse parametric rebuild actions with instructions", () => {
    const text =
      "Applying reinforcement. [[ACT:REBUILD|carbon-fiber-reinforce-truss]] Structural integrity nominal.";
    const match = text.match(/\[\[ACT:REBUILD\|([^\]]+)\]\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("carbon-fiber-reinforce-truss");
  });

  it("should clean spoken text from embedded act tokens for TTS", () => {
    const text = "Systems online. [[ACT:OPEN_LAB]] Ready for command.";
    const cleaned = text.replace(/\[\[ACT:[^\]]+\]\]/g, "").trim();
    expect(cleaned).toBe("Systems online.  Ready for command.");
  });

  it("should format SSE event stream chunks accurately", () => {
    const delta = "Hello Alan";
    const payload = JSON.stringify({ choices: [{ delta: { content: delta } }] });
    const sseChunk = `data: ${payload}\n\n`;
    expect(sseChunk.startsWith("data: ")).toBe(true);
    expect(sseChunk.endsWith("\n\n")).toBe(true);
  });
});

describe("Engineering Lab Component & Diagnosis Parsers", () => {
  it("should parse components string into structured 3D parts", () => {
    const analysis = `
ANALYSIS: Structural load distribution verified.
COMPONENTS: 4 carbon pillars, 2 support deck, 6 joint nodes, 1 exhaust nozzle
DIAGNOSIS:
Tension exceeds threshold on lower brackets.
    `.trim();

    const parts = parseComponents(analysis);
    expect(parts.length).toBe(4);
    expect(parts[0]).toEqual({ kind: "cylinder", count: 4, label: "carbon pillars" });
    expect(parts[1]).toEqual({ kind: "box", count: 2, label: "support deck" });
    expect(parts[2]).toEqual({ kind: "sphere", count: 6, label: "joint nodes" });
    expect(parts[3]).toEqual({ kind: "cone", count: 1, label: "exhaust nozzle" });
  });

  it("should cap count between 1 and 12 for components", () => {
    const analysis = "COMPONENTS: 50 pillars, 0 deck, -3 joints";
    const parts = parseComponents(analysis);
    expect(parts[0].count).toBe(12);
    expect(parts[1].count).toBe(1);
    expect(parts[2].count).toBe(1);
  });

  it("should extract diagnosis points from analysis text", () => {
    const analysis = `
COMPONENTS: 2 pillar
DIAGNOSIS:
Shear stress at node 4
Oscillation frequency mismatch
    `.trim();

    const diagnosis = parseDiagnosis(analysis);
    expect(diagnosis.length).toBe(2);
    expect(diagnosis[0]).toBe("Shear stress at node 4");
    expect(diagnosis[1]).toBe("Oscillation frequency mismatch");
  });

  it("should return empty arrays gracefully when sections are absent", () => {
    const emptyAnalysis = "Just general telemetry text with no markers.";
    expect(parseComponents(emptyAnalysis)).toEqual([]);
    expect(parseDiagnosis(emptyAnalysis)).toEqual([]);
  });
});

describe("Core Utilities & Error Handling", () => {
  it("should merge tailwind class names with cn utility", () => {
    expect(cn("px-2 py-1", "bg-blue-500", { "text-white": true, "opacity-50": false })).toBe(
      "px-2 py-1 bg-blue-500 text-white",
    );
    expect(cn("px-2", "px-4")).toBe("px-4");
  });

  it("should handle error capture queue consumption gracefully", () => {
    expect(consumeLastCapturedError()).toBeUndefined();
  });

  it("should render fallback error page HTML structure with recovery actions", () => {
    const html = renderErrorPage();
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("This page didn't load");
    expect(html).toContain("location.reload()");
    expect(html).toContain('href="/"');
  });
});
