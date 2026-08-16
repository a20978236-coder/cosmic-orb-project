export type Part = {
  kind: "cylinder" | "box" | "sphere" | "cone";
  count: number;
  label: string;
};

export function parseComponents(analysis: string): Part[] {
  const line = analysis.split("\n").find((l) => l.toUpperCase().startsWith("COMPONENTS:"));
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

export function parseDiagnosis(analysis: string): string[] {
  const index = analysis.toUpperCase().indexOf("DIAGNOSIS:");
  if (index === -1) return [];
  const body = analysis.slice(index + 10).trim();
  return body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.toUpperCase().startsWith("COMPONENTS:"));
}
