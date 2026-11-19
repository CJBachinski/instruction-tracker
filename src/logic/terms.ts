import type { Term } from "../model";

/** The one term whose dates contain this date, or null if none or more than one. */
export function termFor(date: string, terms: Term[]): string | null {
  if (!date) return null;
  const matches = terms.filter((t) => t.start && t.end && t.start <= date && date <= t.end);
  return matches.length === 1 ? matches[0].name : null;
}

/** Name of another term whose dates overlap the given one, if any. */
export function overlappingTerm(t: Term, terms: Term[]): string | null {
  for (const o of terms) {
    if (o.name === t.name) continue;
    if (!o.start || !o.end || !t.start || !t.end) continue;
    if (t.start <= o.end && o.start <= t.end) return o.name;
  }
  return null;
}

export function academicYears(terms: Term[]): string[] {
  return [...new Set(terms.map((t) => t.academicYear).filter(Boolean))].sort();
}

export function sortTerms(terms: Term[]): Term[] {
  return [...terms].sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
}

export function isClosed(termName: string, terms: Term[]): boolean {
  return terms.some((t) => t.name === termName && t.status === "Closed");
}
