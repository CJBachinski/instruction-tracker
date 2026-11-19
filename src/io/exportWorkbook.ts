// Excel export in the team's familiar layout: Term Field first, LibInsight cut,
// Actual Student Attendance added. Also used for closed-term archives and the dashboard export.
import ExcelJS from "exceljs";
import type { Booking, Lists, Term } from "../model";
import { sortTerms } from "../logic/terms";

interface ExportCol {
  header: string;
  value: (b: Booking) => string | number | Date | null;
  list?: keyof Lists;
  width?: number;
}

export const EXPORT_COLUMNS: ExportCol[] = [
  { header: "Term Field", value: (b) => b.term },
  { header: "Date", value: (b) => (b.date ? new Date(b.date + "T12:00:00") : null) },
  { header: "Time", value: (b) => b.time },
  { header: "Course #", value: (b) => b.course },
  { header: "Faculty Name", value: (b) => b.faculty },
  { header: "Librarian Assigned", value: (b) => b.librarian, list: "librarian" },
  { header: "Session Type", value: (b) => b.sessionType, list: "sessionType" },
  { header: "Session Format", value: (b) => b.sessionFormat, list: "sessionFormat" },
  { header: "Location", value: (b) => b.location },
  { header: "Room Reservation Status", value: (b) => b.roomStatus, list: "roomStatus" },
  { header: "# Students", value: (b) => b.classSize },
  { header: "Assessment", value: (b) => b.assessment, list: "yesNo" },
  { header: "Notes", value: (b) => b.notes },
  { header: "Prep Time (min)", value: (b) => b.prepMinutes },
  { header: "Actual Student Attendance", value: (b) => b.attendance },
  { header: "College/School", value: (b) => b.college, list: "college" },
  { header: "Student Type", value: (b) => b.studentType, list: "studentType" },
  { header: "Prep Type", value: (b) => b.prepKind, list: "prepKind" },
  { header: "Prep Notes", value: (b) => b.prepNote },
  { header: "Faculty Email", value: (b) => b.facultyEmail },
];

function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function addBookingSheet(wb: ExcelJS.Workbook, name: string, rows: Booking[], lists: Lists) {
  const ws = wb.addWorksheet(name.slice(0, 31), { views: [{ state: "frozen", ySplit: 1 }] });
  ws.addRow(EXPORT_COLUMNS.map((c) => c.header));
  ws.getRow(1).font = { bold: true };
  for (const b of rows) ws.addRow(EXPORT_COLUMNS.map((c) => c.value(b)));
  EXPORT_COLUMNS.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    const longest = Math.max(c.header.length, ...rows.map((b) => String(c.value(b) ?? "").length));
    col.width = Math.min(50, Math.max(10, longest + 2));
    if (c.header === "Date") col.numFmt = "m/d/yyyy";
    const values = c.list ? lists[c.list] : [];
    const formula = `"${values.join(",")}"`;
    if (c.list && values.length && formula.length <= 255) {
      const L = colLetter(i + 1);
      // A dropdown on every row below the header, so the export stays easy to edit by hand.
      for (let r = 2; r <= Math.max(rows.length + 1, 2) + 200; r++) {
        ws.getCell(`${L}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [formula] };
      }
    }
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };
  return ws;
}

/** "All Terms" plus one sheet per term that has rows, named like today's tabs (FALL 26). */
export async function buildExport(bookings: Booking[], terms: Term[], lists: Lists): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const live = bookings.filter((b) => !b.deletedAt).sort((a, b) => a.date.localeCompare(b.date));
  addBookingSheet(wb, "All Terms", live, lists);
  const ordered = sortTerms(terms).map((t) => t.name);
  const extra = [...new Set(live.map((b) => b.term))].filter((t) => t && !ordered.includes(t));
  for (const t of [...ordered, ...extra]) {
    const rows = live.filter((b) => b.term === t);
    if (rows.length) addBookingSheet(wb, t.toUpperCase(), rows, lists);
  }
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

export interface SummaryTable {
  title: string;
  rows: { label: string; count: number; attendance: number; prepHours: number }[];
}

export async function buildDashboardExport(
  filtersText: string[],
  kpiRows: [string, string | number][],
  tables: SummaryTable[],
  rows: Booking[],
  lists: Lists,
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Summary");
  ws.addRow(["Instruction Tracker dashboard"]).font = { bold: true, size: 14 };
  ws.addRow([`Exported ${new Date().toLocaleString()}`]);
  ws.addRow([]);
  ws.addRow(["Filters"]).font = { bold: true };
  for (const f of filtersText) ws.addRow([f]);
  ws.addRow([]);
  ws.addRow(["Totals"]).font = { bold: true };
  for (const k of kpiRows) ws.addRow(k);
  for (const t of tables) {
    ws.addRow([]);
    ws.addRow([t.title, "Sessions", "Attendance", "Prep hours"]).font = { bold: true };
    for (const r of t.rows) ws.addRow([r.label, r.count, r.attendance, r.prepHours]);
  }
  ws.getColumn(1).width = 36;
  [2, 3, 4].forEach((c) => (ws.getColumn(c).width = 14));
  addBookingSheet(wb, "Rows", rows, lists);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
