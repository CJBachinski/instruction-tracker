// Reads free-text times like "1-2pm", "9:30-10:45", "8-8:50am" into 24h start/end.

export interface TimeRange {
  start: { h: number; m: number };
  end: { h: number; m: number };
}

const RANGE = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*[-–to]+\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i;

function to24(h: number, suffix: string | undefined): number {
  if (!suffix) return h;
  const s = suffix.toLowerCase();
  if (s === "am") return h === 12 ? 0 : h;
  return h === 12 ? 12 : h + 12;
}

/** With no am/pm at all: 7–11 are morning, 12 and 1–6 are afternoon. */
function guess(h: number): number {
  if (h >= 7 && h <= 11) return h;
  if (h === 12) return 12;
  return h + 12;
}

export function parseTimeRange(text: string | null | undefined): TimeRange | null {
  const m = (text ?? "").match(RANGE);
  if (!m) return null;
  const sh = parseInt(m[1], 10);
  const sm = m[2] ? parseInt(m[2], 10) : 0;
  const eh = parseInt(m[4], 10);
  const em = m[5] ? parseInt(m[5], 10) : 0;
  if (sh > 12 || eh > 12 || sm > 59 || em > 59) return null;
  const sSuf = m[3];
  const eSuf = m[6];

  let endH: number;
  let startH: number;
  if (!sSuf && !eSuf) {
    startH = guess(sh);
    endH = guess(eh);
    if (endH * 60 + em <= startH * 60 + sm) endH = eh === 12 ? 12 : eh + 12;
  } else {
    endH = to24(eh, eSuf ?? sSuf);
    if (sSuf) startH = to24(sh, sSuf);
    else {
      // The end's suffix carries to the start unless that puts the start after the end.
      startH = to24(sh, eSuf);
      if (startH * 60 + sm > endH * 60 + em) startH = sh === 12 ? 0 : sh;
    }
  }
  if (endH * 60 + em <= startH * 60 + sm) return null;
  return { start: { h: startH, m: sm }, end: { h: endH, m: em } };
}
