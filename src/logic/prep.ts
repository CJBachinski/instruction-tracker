// Turns the old free-text Prep Time ("updated for ai 2 hrs") into minutes + New/Updated.

export interface PrepParse {
  kind: string; // "New" | "Updated" | ""
  minutes: number | null;
  note: string;
  flagged: boolean;
}

const KIND = /\b(new|updated?)\b/i;
const DURATION = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi;

export function parsePrep(text: string | null | undefined): PrepParse {
  const raw = (text ?? "").toString().trim();
  if (!raw) return { kind: "", minutes: null, note: "", flagged: false };

  const k = raw.match(KIND);
  const kind = k ? (k[1].toLowerCase() === "new" ? "New" : "Updated") : "";

  let minutes = 0;
  let found = false;
  for (const m of raw.matchAll(DURATION)) {
    found = true;
    const n = parseFloat(m[1]);
    minutes += m[2].toLowerCase().startsWith("h") ? n * 60 : n;
  }
  if (!found) return { kind, minutes: null, note: raw, flagged: true };

  const note = raw
    .replace(KIND, "")
    .replace(DURATION, "")
    .replace(/[-–:,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return { kind, minutes: Math.round(minutes), note, flagged: false };
}
