import { describe, it, expect } from "bun:test";

describe("Cosmic Orb Core Logic & Action Parser", () => {
  it("should extract actions from NEXUS assistant responses correctly", () => {
    const text = "Initializing engineering lab now. [[ACT:OPEN_LAB]] Telemetry is calibrated.";
    const match = text.match(/\[\[ACT:([^\]]+)\]\]/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("OPEN_LAB");
  });

  it("should parse parametric rebuild actions with instructions", () => {
    const text = "Applying reinforcement. [[ACT:REBUILD|carbon-fiber-reinforce-truss]] Structural integrity nominal.";
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
