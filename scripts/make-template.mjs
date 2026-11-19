// Builds template/InstructionTracker-DB.xlsx: the empty database IT uploads to SharePoint.
// One sheet + one named Excel table per kind of record. Columns are formatted as text so
// Excel doesn't turn "1-2" or "2026-09-15" into something else.
import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";

const TABLES = {
  Bookings: {
    headers: [
      "ID", "Term", "Date", "Time", "Course #", "Faculty Name", "Faculty Email", "College/School",
      "Student Type", "Librarian Assigned", "Session Type", "Session Format", "Location",
      "Room Reservation Status", "# Students", "Assessment", "Notes", "Prep Time (min)", "Prep Type",
      "Prep Notes", "Actual Student Attendance", "Source", "Request ID", "Import Key", "Created At",
      "Created By", "Updated At", "Updated By", "Version", "Deleted At",
    ],
    numbers: ["# Students", "Prep Time (min)", "Actual Student Attendance", "Version"],
    rows: [],
  },
  Requests: {
    headers: [
      "Request ID", "Submitted At", "Term", "Faculty Name", "Faculty Email", "Course #", "College/School",
      "Student Type", "# Students", "Session Format", "Preferred Date 1", "Preferred Time 1",
      "Preferred Date 2", "Preferred Time 2", "Location", "Notes", "Status", "Booking ID", "Handled By",
      "Handled At", "Reject Reason",
    ],
    numbers: ["# Students"],
    rows: [],
  },
  Terms: {
    headers: ["Term", "Academic Year", "Start", "End", "Status"],
    numbers: [],
    rows: [
      ["Fall 26", "2026-2027", "2026-08-01", "2026-12-20", "Open"],
      ["Winter 26", "2026-2027", "2026-12-21", "2027-01-17", "Open"],
      ["Spring 27", "2026-2027", "2027-01-18", "2027-05-15", "Open"],
      ["Summer 27", "2026-2027", "2027-05-16", "2027-07-31", "Open"],
    ],
  },
  Lists: {
    headers: ["List", "Value"],
    numbers: [],
    rows: [
      ...["Kathleen", "Lisa", "Michele"].map((v) => ["librarian", v]),
      ...["Undergraduate", "Graduate", "Adult Studies"].map((v) => ["studentType", v]),
      ...["One shot", "Embedded", "Workshop", "Presentation", "Orientation", "Tour"].map((v) => ["sessionType", v]),
      ...["Face to face", "Synchronous", "Asynchronous"].map((v) => ["sessionFormat", v]),
      ...["Confirmed", "Pending"].map((v) => ["roomStatus", v]),
      ...["Yes", "No"].map((v) => ["yesNo", v]),
      ...["New", "Updated"].map((v) => ["prepKind", v]),
    ],
  },
  AuditLog: {
    headers: ["At", "User", "Action", "Booking ID", "Changes"],
    numbers: [],
    rows: [],
  },
};

const wb = new ExcelJS.Workbook();
wb.creator = "Instruction Tracker";
for (const [name, t] of Object.entries(TABLES)) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  t.headers.forEach((h, i) => {
    const col = ws.getColumn(i + 1);
    col.width = Math.max(12, h.length + 4);
    if (!t.numbers.includes(h)) col.numFmt = "@";
  });
  // An Excel table needs at least one data row; the app fills that empty row first.
  const rows = t.rows.length ? t.rows : [t.headers.map(() => "")];
  ws.addTable({
    name,
    ref: "A1",
    headerRow: true,
    style: { theme: "TableStyleLight9", showRowStripes: true },
    columns: t.headers.map((h) => ({ name: h, filterButton: true })),
    rows,
  });
}
mkdirSync("template", { recursive: true });
await wb.xlsx.writeFile("template/InstructionTracker-DB.xlsx");
console.log("Wrote template/InstructionTracker-DB.xlsx");
