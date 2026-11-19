// Dashboard numbers. Pure functions, no UI, so tests can check every figure.
import type { Booking, Term } from "../model";

export type Period =
  | { kind: "term"; term: string }
  | { kind: "year"; year: string }
  | { kind: "range"; from: string; to: string }
  | { kind: "all" };

export interface DashFilters {
  period: Period;
  studentType: string[];
  librarian: string[];
  college: string[];
  sessionFormat: string[];
  sessionType: string[];
}

export const NOT_SET = "Not set";

export const emptyFilters = (period: Period): DashFilters => ({
  period,
  studentType: [],
  librarian: [],
  college: [],
  sessionFormat: [],
  sessionType: [],
});

const valueOrNotSet = (v: string) => v || NOT_SET;

function inPeriod(b: Booking, p: Period, terms: Term[]): boolean {
  switch (p.kind) {
    case "all":
      return true;
    case "term":
      return b.term === p.term;
    case "year": {
      const names = new Set(terms.filter((t) => t.academicYear === p.year).map((t) => t.name));
      return names.has(b.term);
    }
    case "range":
      return !!b.date && (!p.from || b.date >= p.from) && (!p.to || b.date <= p.to);
  }
}

function matches(selected: string[], value: string): boolean {
  return selected.length === 0 || selected.includes(valueOrNotSet(value));
}

/** AND across filters, OR within one. Deleted rows never count. */
export function applyFilters(bookings: Booking[], f: DashFilters, terms: Term[]): Booking[] {
  return bookings.filter(
    (b) =>
      !b.deletedAt &&
      inPeriod(b, f.period, terms) &&
      matches(f.studentType, b.studentType) &&
      matches(f.librarian, b.librarian) &&
      matches(f.college, b.college) &&
      matches(f.sessionFormat, b.sessionFormat) &&
      matches(f.sessionType, b.sessionType),
  );
}

export interface Kpis {
  sessions: number;
  attendance: number;
  avgAttendance: number | null;
  prepHours: number;
  attendanceVsClassSize: number | null; // percent
}

export function kpis(rows: Booking[]): Kpis {
  const withAtt = rows.filter((b) => b.attendance !== null);
  const attendance = withAtt.reduce((s, b) => s + (b.attendance ?? 0), 0);
  const both = rows.filter((b) => b.attendance !== null && b.classSize !== null && b.classSize > 0);
  const sumAtt = both.reduce((s, b) => s + (b.attendance ?? 0), 0);
  const sumSize = both.reduce((s, b) => s + (b.classSize ?? 0), 0);
  const prepMin = rows.reduce((s, b) => s + (b.prepMinutes ?? 0), 0);
  return {
    sessions: rows.length,
    attendance,
    avgAttendance: withAtt.length ? Math.round((attendance / withAtt.length) * 10) / 10 : null,
    prepHours: Math.round((prepMin / 60) * 10) / 10,
    attendanceVsClassSize: sumSize ? Math.round((sumAtt / sumSize) * 100) : null,
  };
}

export interface Bar {
  label: string;
  count: number;
  attendance: number;
  prepHours: number;
}

/** Counts per value of one field, always including a "Not set" bucket when used. */
export function groupBy(
  rows: Booking[],
  field: "librarian" | "college" | "studentType",
  order: string[] = [],
): Bar[] {
  const map = new Map<string, Bar>();
  for (const v of order) map.set(v, { label: v, count: 0, attendance: 0, prepHours: 0 });
  for (const b of rows) {
    const key = valueOrNotSet(b[field]);
    const bar = map.get(key) ?? { label: key, count: 0, attendance: 0, prepHours: 0 };
    bar.count += 1;
    bar.attendance += b.attendance ?? 0;
    bar.prepHours += (b.prepMinutes ?? 0) / 60;
    map.set(key, bar);
  }
  const bars = [...map.values()].map((b) => ({ ...b, prepHours: Math.round(b.prepHours * 10) / 10 }));
  const notSet = bars.filter((b) => b.label === NOT_SET);
  const rest = bars.filter((b) => b.label !== NOT_SET);
  if (order.length === 0) rest.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
  return [...rest, ...notSet];
}

/** Bookings keyed by ISO date, for the calendar. */
export function byDate(rows: Booking[]): Map<string, Booking[]> {
  const m = new Map<string, Booking[]>();
  for (const b of rows) {
    if (!b.date) continue;
    const list = m.get(b.date) ?? [];
    list.push(b);
    m.set(b.date, list);
  }
  return m;
}
