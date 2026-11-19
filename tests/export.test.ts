import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildExport } from "../src/io/exportWorkbook";
import { blankBooking, DEFAULT_LISTS, DEFAULT_TERMS } from "../src/model";

describe("Excel export", () => {
  it("puts Term Field first, drops LibInsight, and makes one sheet per term", async () => {
    const a = { ...blankBooking("T", "Fall 26"), date: "2026-09-15", course: "EN 103", attendance: 20, classSize: 22 };
    const b = { ...blankBooking("T", "Spring 27"), date: "2027-02-01", course: "PA517" };
    const gone = { ...blankBooking("T", "Fall 26"), course: "DELETED", deletedAt: "2026-10-01" };
    const buf = await buildExport([a, b, gone], DEFAULT_TERMS, DEFAULT_LISTS);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["All Terms", "FALL 26", "SPRING 27"]);
    const header = (wb.getWorksheet("All Terms")!.getRow(1).values as string[]).slice(1);
    expect(header[0]).toBe("Term Field");
    expect(header).not.toContain("Entered into LibInsight");
    expect(header).toContain("Actual Student Attendance");
    expect(header.slice(0, 13)).toEqual([
      "Term Field", "Date", "Time", "Course #", "Faculty Name", "Librarian Assigned", "Session Type",
      "Session Format", "Location", "Room Reservation Status", "# Students", "Assessment", "Notes",
    ]);
    const ws = wb.getWorksheet("All Terms")!;
    const filled = [2, 3, 4].filter((r) => ws.getCell(`D${r}`).value);
    expect(filled).toEqual([2, 3]); // header + 2 live rows; the deleted one is left out
    expect(wb.getWorksheet("All Terms")!.getCell("F2").dataValidation?.type).toBe("list");
  });
});
