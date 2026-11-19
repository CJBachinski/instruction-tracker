// Field-level merge: keeps both people's changes unless they changed the same field.
import { EDITABLE_FIELDS, type Booking, type EditableField } from "../model";

export interface Conflict {
  field: EditableField;
  theirs: unknown;
  mine: unknown;
  theirUser: string;
  theirTime: string;
}

export interface MergeResult {
  merged: Booking;
  conflicts: Conflict[];
}

const same = (a: unknown, b: unknown) => (a ?? "") === (b ?? "");

/**
 * base = the row when the dialog opened, edited = what this person has now,
 * current = what is saved right now (maybe changed by someone else).
 */
export function mergeBooking(base: Booking, edited: Booking, current: Booking): MergeResult {
  const merged: Booking = { ...current };
  const conflicts: Conflict[] = [];
  for (const f of EDITABLE_FIELDS) {
    const mineChanged = !same(edited[f], base[f]);
    if (!mineChanged) continue;
    const theirsChanged = !same(current[f], base[f]);
    if (!theirsChanged || same(current[f], edited[f])) {
      (merged as unknown as Record<string, unknown>)[f] = edited[f];
    } else {
      conflicts.push({
        field: f,
        theirs: current[f],
        mine: edited[f],
        theirUser: current.updatedBy,
        theirTime: current.updatedAt,
      });
    }
  }
  return { merged, conflicts };
}

/** A short "field: old → new" list for the change log. */
export function describeChanges(before: Booking | null, after: Booking): string {
  if (!before) return "created";
  const parts: string[] = [];
  for (const f of EDITABLE_FIELDS) {
    if (!same(before[f], after[f])) parts.push(`${f}: ${before[f] ?? ""} → ${after[f] ?? ""}`);
  }
  return parts.join("; ");
}
