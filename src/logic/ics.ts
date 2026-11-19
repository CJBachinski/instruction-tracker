// One-way "Add to my calendar": builds a standard .ics file for one booking.
import type { Booking } from "../model";
import { parseTimeRange } from "./timeparse";

const pad = (n: number) => String(n).padStart(2, "0");

function esc(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

export interface IcsResult {
  text: string;
  allDay: boolean;
  filename: string;
}

export function buildIcs(b: Booking, now = new Date()): IcsResult | null {
  if (!b.date) return null;
  const d = b.date.replace(/-/g, "");
  const range = parseTimeRange(b.time);
  const stamp =
    `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T` +
    `${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;

  let when: string[];
  if (range) {
    when = [
      `DTSTART:${d}T${pad(range.start.h)}${pad(range.start.m)}00`,
      `DTEND:${d}T${pad(range.end.h)}${pad(range.end.m)}00`,
    ];
  } else {
    const next = new Date(b.date + "T00:00:00");
    next.setDate(next.getDate() + 1);
    const nd = `${next.getFullYear()}${pad(next.getMonth() + 1)}${pad(next.getDate())}`;
    when = [`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${nd}`];
  }

  const desc = [
    b.sessionType && `Session type: ${b.sessionType}`,
    b.sessionFormat && `Format: ${b.sessionFormat}`,
    b.classSize !== null && `# Students: ${b.classSize}`,
    b.notes && `Notes: ${b.notes}`,
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Instruction Tracker//EN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${b.id}@instruction-tracker`,
    `SEQUENCE:${b.version}`,
    `DTSTAMP:${stamp}`,
    ...when,
    `SUMMARY:${esc(`Library instruction: ${b.course}${b.faculty ? ` (${b.faculty})` : ""}`)}`,
    b.location ? `LOCATION:${esc(b.location)}` : "",
    desc ? `DESCRIPTION:${esc(desc)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  const safe = `${b.course || "session"}-${b.date}`.replace(/[^A-Za-z0-9-]+/g, "_");
  return { text: lines.join("\r\n") + "\r\n", allDay: !range, filename: `${safe}.ics` };
}
