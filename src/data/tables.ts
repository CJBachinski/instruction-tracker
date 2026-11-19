// How each record maps to a row in the SharePoint workbook's Excel tables.
// Headers are plain English so the file is readable when opened in Excel.
import type { AuditEntry, Booking, Request, Term } from "../model";

type Kind = "text" | "number" | "date";
interface Col<T> {
  header: string;
  key: keyof T;
  kind?: Kind;
}

export const BOOKING_COLUMNS: Col<Booking>[] = [
  { header: "ID", key: "id" },
  { header: "Term", key: "term" },
  { header: "Date", key: "date", kind: "date" },
  { header: "Time", key: "time" },
  { header: "Course #", key: "course" },
  { header: "Faculty Name", key: "faculty" },
  { header: "Faculty Email", key: "facultyEmail" },
  { header: "College/School", key: "college" },
  { header: "Student Type", key: "studentType" },
  { header: "Librarian Assigned", key: "librarian" },
  { header: "Session Type", key: "sessionType" },
  { header: "Session Format", key: "sessionFormat" },
  { header: "Location", key: "location" },
  { header: "Room Reservation Status", key: "roomStatus" },
  { header: "# Students", key: "classSize", kind: "number" },
  { header: "Assessment", key: "assessment" },
  { header: "Notes", key: "notes" },
  { header: "Prep Time (min)", key: "prepMinutes", kind: "number" },
  { header: "Prep Type", key: "prepKind" },
  { header: "Prep Notes", key: "prepNote" },
  { header: "Actual Student Attendance", key: "attendance", kind: "number" },
  { header: "Source", key: "source" },
  { header: "Request ID", key: "requestId" },
  { header: "Import Key", key: "importKey" },
  { header: "Created At", key: "createdAt" },
  { header: "Created By", key: "createdBy" },
  { header: "Updated At", key: "updatedAt" },
  { header: "Updated By", key: "updatedBy" },
  { header: "Version", key: "version", kind: "number" },
  { header: "Deleted At", key: "deletedAt" },
];

// Power Automate fills this table from the faculty form, matching these headers.
export const REQUEST_COLUMNS: Col<Request>[] = [
  { header: "Request ID", key: "id" },
  { header: "Submitted At", key: "submittedAt" },
  { header: "Term", key: "term" },
  { header: "Faculty Name", key: "facultyName" },
  { header: "Faculty Email", key: "facultyEmail" },
  { header: "Course #", key: "course" },
  { header: "College/School", key: "college" },
  { header: "Student Type", key: "studentType" },
  { header: "# Students", key: "classSize", kind: "number" },
  { header: "Session Format", key: "sessionFormat" },
  { header: "Preferred Date 1", key: "date1", kind: "date" },
  { header: "Preferred Time 1", key: "time1" },
  { header: "Preferred Date 2", key: "date2", kind: "date" },
  { header: "Preferred Time 2", key: "time2" },
  { header: "Location", key: "location" },
  { header: "Notes", key: "notes" },
  { header: "Status", key: "status" },
  { header: "Booking ID", key: "bookingId" },
  { header: "Handled By", key: "handledBy" },
  { header: "Handled At", key: "handledAt" },
  { header: "Reject Reason", key: "rejectReason" },
];

export const TERM_COLUMNS: Col<Term>[] = [
  { header: "Term", key: "name" },
  { header: "Academic Year", key: "academicYear" },
  { header: "Start", key: "start", kind: "date" },
  { header: "End", key: "end", kind: "date" },
  { header: "Status", key: "status" },
];

export const AUDIT_COLUMNS: Col<AuditEntry>[] = [
  { header: "At", key: "at" },
  { header: "User", key: "user" },
  { header: "Action", key: "action" },
  { header: "Booking ID", key: "bookingId" },
  { header: "Changes", key: "changes" },
];

export const LIST_HEADERS = ["List", "Value"];

/** Excel stores dates as day numbers; turn either form into yyyy-mm-dd. */
export function toIsoDate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString().slice(0, 10);
  }
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) {
    const y = us[3].length === 2 ? "20" + us[3] : us[3];
    return `${y}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  }
  return s;
}

function cellOut(v: unknown, kind?: Kind): string | number {
  if (v === null || v === undefined) return "";
  if (kind === "number") return typeof v === "number" ? v : "";
  return String(v);
}

function cellIn(v: unknown, kind?: Kind): unknown {
  if (kind === "number") {
    if (v === "" || v === null || v === undefined) return null;
    const n = typeof v === "number" ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
  }
  if (kind === "date") return toIsoDate(v);
  return v === null || v === undefined ? "" : String(v);
}

/** Row values in the order the table's own headers come in. Unknown columns keep `existing`. */
export function toRow<T>(cols: Col<T>[], obj: T, headers: string[], existing?: unknown[]): (string | number)[] {
  return headers.map((h, i) => {
    const col = cols.find((c) => c.header === h);
    if (!col) return (existing?.[i] as string | number) ?? "";
    return cellOut(obj[col.key], col.kind);
  });
}

export function fromRow<T>(cols: Col<T>[], headers: string[], row: unknown[], defaults: T): T {
  const out = { ...defaults } as Record<string, unknown>;
  headers.forEach((h, i) => {
    const col = cols.find((c) => c.header === h);
    if (col) out[col.key as string] = cellIn(row[i], col.kind);
  });
  return out as T;
}

export const isBlankRow = (row: unknown[]) => row.every((v) => v === "" || v === null || v === undefined);
