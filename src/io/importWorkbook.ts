// One-time import of the team's existing "2026-2027 Instruction Classes.xlsx".
// Reads FALL/WINTER/SPRING/SUMMER tabs, cleans values, and reports anything odd.
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { blankBooking, type Booking, type Lists, type ListName } from "../model";
import { parsePrep } from "../logic/prep";
import { toIsoDate } from "../data/tables";
import { cellText } from "./cell";

export interface ImportFlag {
  tab: string;
  row: number;
  column: string;
  value: string;
  reason: string;
}

export interface ImportReport {
  perTab: { tab: string; rows: number }[];
  skippedTabs: string[];
  alreadyImported: number;
  libinsightDropped: number;
  missingDetails: number;
  flags: ImportFlag[];
}

const TAB = /^(FALL|WINTER|SPRING|SUMMER)\s+(\d{2})$/i;

const LEGACY: Record<string, keyof Booking | "libinsight" | "prep"> = {
  "date": "date",
  "time": "time",
  "course #": "course",
  "faculty name": "faculty",
  "librarian assigned": "librarian",
  "session type": "sessionType",
  "session format": "sessionFormat",
  "location": "location",
  "room reservation status": "roomStatus",
  "# students": "attendance", // old J was "how many show up" (intent Q9)
  "assessment": "assessment",
  "notes": "notes",
  "entered into libinsight": "libinsight",
  "prep time": "prep",
};

const LIST_FIELDS: Partial<Record<keyof Booking, ListName>> = {
  librarian: "librarian",
  sessionType: "sessionType",
  sessionFormat: "sessionFormat",
  roomStatus: "roomStatus",
  assessment: "yesNo",
};

export function termFromTab(tab: string): string | null {
  const m = tab.trim().match(TAB);
  if (!m) return null;
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase() + " " + m[2];
}

/**
 * The old workbook puts dropdowns on whole columns (E1:E1048576). ExcelJS expands those
 * cell by cell, which takes many seconds, so drop the dropdown definitions before reading.
 */
async function stripValidations(data: ArrayBuffer): Promise<ArrayBuffer> {
  const zip = await JSZip.loadAsync(data);
  const sheets = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n));
  for (const name of sheets) {
    const xml = await zip.file(name)!.async("string");
    const cleaned = xml
      .replace(/<dataValidations\b[\s\S]*?<\/dataValidations>/g, "")
      .replace(/<x14:dataValidations\b[\s\S]*?<\/x14:dataValidations>/g, "");
    if (cleaned !== xml) zip.file(name, cleaned);
  }
  return zip.generateAsync({ type: "arraybuffer" });
}

export async function readLegacyWorkbook(
  data: ArrayBuffer,
  lists: Lists,
  existingKeys: Set<string>,
  user: string,
): Promise<{ bookings: Booking[]; report: ImportReport }> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await stripValidations(data));
  const report: ImportReport = {
    perTab: [],
    skippedTabs: [],
    alreadyImported: 0,
    libinsightDropped: 0,
    missingDetails: 0,
    flags: [],
  };
  const bookings: Booking[] = [];

  wb.eachSheet((ws) => {
    const term = termFromTab(ws.name);
    if (!term) {
      report.skippedTabs.push(ws.name);
      return;
    }
    const header = ws.getRow(1);
    const colMap = new Map<number, string>();
    let lastKnown = 0;
    header.eachCell((cell, col) => {
      const key = cellText(cell.value).toLowerCase();
      if (LEGACY[key]) {
        colMap.set(col, LEGACY[key]);
        lastKnown = Math.max(lastKnown, col);
      }
    });
    let count = 0;
    ws.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const values: Record<string, unknown> = {};
      const extras: string[] = [];
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const f = colMap.get(col);
        if (f) values[f] = cell.value;
        else if (col > lastKnown) {
          const t = cellText(cell.value);
          if (t) extras.push(t);
        }
      });
      const filled = [...colMap.values()].some((f) => cellText(values[f]) !== "");
      if (!filled) return;

      const b = blankBooking(user, term);
      b.source = "import";
      b.date = toIsoDate(values.date instanceof Date ? values.date : cellText(values.date) || values.date);
      if (b.date && !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) {
        report.flags.push({ tab: ws.name, row: rowNumber, column: "Date", value: b.date, reason: "not a real date" });
        b.date = "";
      }
      b.time = cellText(values.time);
      b.course = cellText(values.course);
      b.faculty = cellText(values.faculty);
      b.location = cellText(values.location);
      b.notes = cellText(values.notes);
      for (const [field, list] of Object.entries(LIST_FIELDS) as [keyof Booking, ListName][]) {
        const raw = cellText(values[field]);
        if (!raw) continue;
        const match = lists[list].find((v) => v.toLowerCase() === raw.toLowerCase());
        (b as unknown as Record<string, unknown>)[field] = match ?? raw;
        if (!match) {
          report.flags.push({ tab: ws.name, row: rowNumber, column: field, value: raw, reason: "not in the dropdown list" });
        }
      }
      const att = cellText(values.attendance);
      if (att) {
        const n = parseInt(att, 10);
        if (Number.isFinite(n)) b.attendance = n;
        else report.flags.push({ tab: ws.name, row: rowNumber, column: "# Students", value: att, reason: "not a number" });
      }
      if (cellText(values.libinsight)) report.libinsightDropped++;
      const prep = parsePrep(cellText(values.prep));
      b.prepKind = prep.kind;
      b.prepMinutes = prep.minutes;
      b.prepNote = [prep.note, ...extras].filter(Boolean).join("; ");
      if (prep.flagged) {
        report.flags.push({ tab: ws.name, row: rowNumber, column: "Prep Time", value: cellText(values.prep), reason: "no duration found" });
      }
      b.importKey = `${ws.name}|${rowNumber}|${b.date}|${b.course}|${b.faculty}`;
      if (existingKeys.has(b.importKey)) {
        report.alreadyImported++;
        return;
      }
      if (!b.college || !b.studentType) report.missingDetails++;
      bookings.push(b);
      count++;
    });
    report.perTab.push({ tab: ws.name, rows: count });
  });

  return { bookings, report };
}
