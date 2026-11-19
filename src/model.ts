// Core data types and constants shared by every part of the app.

export type Source = "manual" | "form" | "import";
export type Status = "New" | "Planning" | "Wrap-up" | "Completed";

export interface Booking {
  id: string;
  term: string; // e.g. "Fall 26" (term + year), picked first
  date: string; // ISO yyyy-mm-dd, "" if unknown
  time: string; // free text, e.g. "1-2pm"
  course: string;
  faculty: string;
  facultyEmail: string;
  college: string;
  studentType: string;
  librarian: string;
  sessionType: string;
  sessionFormat: string;
  location: string;
  roomStatus: string;
  classSize: number | null; // "# Students" = expected class size
  attendance: number | null; // "Actual Student Attendance"
  assessment: string;
  notes: string;
  prepMinutes: number | null;
  prepKind: string;
  prepNote: string;
  source: Source;
  requestId: string;
  importKey: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  version: number;
  deletedAt: string;
  /** Position in the SharePoint table. Not saved; filled in when loaded. */
  rowIndex?: number;
}

export interface Request {
  id: string;
  submittedAt: string;
  term: string;
  facultyName: string;
  facultyEmail: string;
  course: string;
  college: string;
  studentType: string;
  classSize: number | null;
  sessionFormat: string;
  date1: string;
  time1: string;
  date2: string;
  time2: string;
  location: string;
  notes: string;
  status: "New" | "Accepted" | "Rejected";
  bookingId: string;
  handledBy: string;
  handledAt: string;
  rejectReason: string;
  rowIndex?: number;
}

export interface Term {
  name: string; // "Fall 26"
  academicYear: string; // "2026-2027"
  start: string; // ISO
  end: string; // ISO
  status: "Open" | "Closed";
  rowIndex?: number;
}

export type ListName =
  | "librarian"
  | "college"
  | "studentType"
  | "sessionType"
  | "sessionFormat"
  | "roomStatus"
  | "yesNo"
  | "prepKind";

export type Lists = Record<ListName, string[]>;

export interface AuditEntry {
  at: string;
  user: string;
  action: string;
  bookingId: string;
  changes: string;
}

export interface AppData {
  bookings: Booking[];
  requests: Request[];
  terms: Term[];
  lists: Lists;
}

export const LIST_LABELS: Record<ListName, string> = {
  librarian: "Librarians",
  college: "Colleges / schools",
  studentType: "Student types",
  sessionType: "Session types",
  sessionFormat: "Session formats",
  roomStatus: "Room reservation statuses",
  yesNo: "Yes / No",
  prepKind: "Prep types",
};

export const DEFAULT_LISTS: Lists = {
  librarian: ["Kathleen", "Lisa", "Michele"],
  college: [],
  studentType: ["Undergraduate", "Graduate", "Adult Studies"],
  sessionType: ["One shot", "Embedded", "Workshop", "Presentation", "Orientation", "Tour"],
  sessionFormat: ["Face to face", "Synchronous", "Asynchronous"],
  roomStatus: ["Confirmed", "Pending"],
  yesNo: ["Yes", "No"],
  prepKind: ["New", "Updated"],
};

// Placeholder dates until Kathleen confirms the academic calendar (intent Q2).
export const DEFAULT_TERMS: Term[] = [
  { name: "Fall 26", academicYear: "2026-2027", start: "2026-08-01", end: "2026-12-20", status: "Open" },
  { name: "Winter 26", academicYear: "2026-2027", start: "2026-12-21", end: "2027-01-17", status: "Open" },
  { name: "Spring 27", academicYear: "2026-2027", start: "2027-01-18", end: "2027-05-15", status: "Open" },
  { name: "Summer 27", academicYear: "2026-2027", start: "2027-05-16", end: "2027-07-31", status: "Open" },
];

/** Fields a person edits. Used for merging and change logs. */
export const EDITABLE_FIELDS = [
  "term",
  "date",
  "time",
  "course",
  "faculty",
  "facultyEmail",
  "college",
  "studentType",
  "librarian",
  "sessionType",
  "sessionFormat",
  "location",
  "roomStatus",
  "classSize",
  "attendance",
  "assessment",
  "notes",
  "prepMinutes",
  "prepKind",
  "prepNote",
  "deletedAt",
] as const satisfies readonly (keyof Booking)[];

export type EditableField = (typeof EDITABLE_FIELDS)[number];

export const FIELD_LABELS: Record<EditableField, string> = {
  term: "Term",
  date: "Date",
  time: "Time",
  course: "Course #",
  faculty: "Faculty Name",
  facultyEmail: "Faculty Email",
  college: "College/School",
  studentType: "Student Type",
  librarian: "Librarian Assigned",
  sessionType: "Session Type",
  sessionFormat: "Session Format",
  location: "Location",
  roomStatus: "Room Reservation Status",
  classSize: "# Students",
  attendance: "Actual Student Attendance",
  assessment: "Assessment",
  notes: "Notes",
  prepMinutes: "Prep Time (min)",
  prepKind: "Prep Type",
  prepNote: "Prep Notes",
  deletedAt: "Deleted",
};

export function todayIso(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** The workflow stage, worked out from what has been filled in. */
export function statusOf(b: Booking, today = todayIso()): Status {
  if (b.attendance !== null && b.attendance !== undefined) return "Completed";
  if (!b.librarian) return "New";
  if (b.date && b.date < today) return "Wrap-up";
  return "Planning";
}

export function isMissingDetails(b: Booking): boolean {
  return !b.college || !b.studentType;
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function blankBooking(user: string, term = ""): Booking {
  const now = new Date().toISOString();
  return {
    id: newId(),
    term,
    date: "",
    time: "",
    course: "",
    faculty: "",
    facultyEmail: "",
    college: "",
    studentType: "",
    librarian: "",
    sessionType: "",
    sessionFormat: "",
    location: "",
    roomStatus: "",
    classSize: null,
    attendance: null,
    assessment: "",
    notes: "",
    prepMinutes: null,
    prepKind: "",
    prepNote: "",
    source: "manual",
    requestId: "",
    importKey: "",
    createdAt: now,
    createdBy: user,
    updatedAt: now,
    updatedBy: user,
    version: 1,
    deletedAt: "",
  };
}
