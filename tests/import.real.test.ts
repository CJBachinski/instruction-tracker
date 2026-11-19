// Checks the importer against the team's real workbook when it sits next to this project.
// Skipped anywhere the file isn't present (it is never committed).
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readLegacyWorkbook } from "../src/io/importWorkbook";
import { DEFAULT_LISTS } from "../src/model";

const file = resolve(__dirname, "../../2026-2027 Instruction Classes.xlsx");

describe.skipIf(!existsSync(file))("import of the real 2026-2027 workbook", () => {
  it("brings in all 118 Fall 26 rows with the agreed rules", { timeout: 180000 }, async () => {
    const buf = readFileSync(file);
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
    const { bookings, report } = await readLegacyWorkbook(ab, DEFAULT_LISTS, new Set(), "Test");
    expect(bookings).toHaveLength(118);
    expect(new Set(bookings.map((b) => b.term))).toEqual(new Set(["Fall 26"]));
    expect(report.skippedTabs).toContain("oriet tours");
    expect(report.libinsightDropped).toBe(58);
    expect(bookings.some((b) => b.roomStatus === "confirmed")).toBe(false);
    expect(bookings.some((b) => b.location === "TTC ")).toBe(false);
    expect(bookings.every((b) => b.classSize === null)).toBe(true);
    expect(bookings.filter((b) => b.attendance !== null).length).toBeGreaterThan(50);
    expect(report.flags.filter((f) => f.column === "Prep Time")).toEqual([]);
    expect(bookings.filter((b) => b.prepNote.includes("survey created 2 hours"))).toHaveLength(2);

    const again = await readLegacyWorkbook(ab, DEFAULT_LISTS, new Set(bookings.map((b) => b.importKey)), "Test");
    expect(again.bookings).toHaveLength(0);
    expect(again.report.alreadyImported).toBe(118);
  });
});
