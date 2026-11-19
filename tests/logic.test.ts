import { describe, expect, it } from "vitest";
import { parsePrep } from "../src/logic/prep";
import { parseTimeRange } from "../src/logic/timeparse";
import { overlappingTerm, termFor } from "../src/logic/terms";
import { mergeBooking } from "../src/logic/merge";
import { applyFilters, emptyFilters, groupBy, kpis, NOT_SET } from "../src/logic/metrics";
import { buildIcs } from "../src/logic/ics";
import { blankBooking, DEFAULT_TERMS, statusOf, type Booking } from "../src/model";
import { fromRow, toIsoDate, toRow, BOOKING_COLUMNS } from "../src/data/tables";
import { termFromTab } from "../src/io/importWorkbook";

const bk = (patch: Partial<Booking>): Booking => ({ ...blankBooking("T", "Fall 26"), ...patch });

describe("parsePrep (every distinct value in the real FALL 26 tab)", () => {
  const cases: [string, string, number, string][] = [
    ["updated 1 hour", "Updated", 60, ""],
    ["New - 8 hours", "New", 480, ""],
    ["New - 4 hours", "New", 240, ""],
    ["New 2 hours ", "New", 120, ""],
    ["Updated 3 hrs", "Updated", 180, ""],
    ["Updated 30 minutes", "Updated", 30, ""],
    ["Updated 4 hours", "Updated", 240, ""],
    ["new - 2 hours", "New", 120, ""],
    ["new 3 hours", "New", 180, ""],
    ["new 5 hours", "New", 300, ""],
    ["new cards 1 hour", "New", 60, "cards"],
    ["updated 2 hours ", "Updated", 120, ""],
    ["updated for ai 2 hrs", "Updated", 120, "for ai"],
  ];
  it.each(cases)("%s", (input, kind, minutes, note) => {
    const r = parsePrep(input);
    expect(r).toEqual({ kind, minutes, note, flagged: false });
  });
  it("flags text with no duration", () => {
    expect(parsePrep("survey created")).toMatchObject({ minutes: null, flagged: true, note: "survey created" });
  });
  it("blank is fine", () => expect(parsePrep("")).toMatchObject({ minutes: null, flagged: false }));
  it("decimal hours", () => expect(parsePrep("new 1.5 hours").minutes).toBe(90));
});

describe("parseTimeRange", () => {
  const t = (s: string) => {
    const r = parseTimeRange(s);
    return r ? `${r.start.h}:${String(r.start.m).padStart(2, "0")}-${r.end.h}:${String(r.end.m).padStart(2, "0")}` : null;
  };
  it.each([
    ["1-2pm", "13:00-14:00"],
    ["9:30-10:45", "9:30-10:45"],
    ["8-8:50am", "8:00-8:50"],
    ["2-2:40pm", "14:00-14:40"],
    ["5:30-8pm", "17:30-20:00"],
    ["11-12:15", "11:00-12:15"],
    ["1-4pm", "13:00-16:00"],
    ["11-1pm", "11:00-13:00"],
    ["11am-1pm", "11:00-13:00"],
    ["8-9:15", "8:00-9:15"],
  ])("%s → %s", (input, out) => expect(t(input)).toBe(out));
  it.each(["Online", "", "TBA"])("%s is unreadable", (s) => expect(parseTimeRange(s)).toBeNull());
});

describe("terms", () => {
  it("assigns by date", () => {
    expect(termFor("2026-09-15", DEFAULT_TERMS)).toBe("Fall 26");
    expect(termFor("2027-03-01", DEFAULT_TERMS)).toBe("Spring 27");
    expect(termFor("2026-12-20", DEFAULT_TERMS)).toBe("Fall 26");
    expect(termFor("2026-12-21", DEFAULT_TERMS)).toBe("Winter 26");
    expect(termFor("2028-01-01", DEFAULT_TERMS)).toBeNull();
  });
  it("detects overlaps", () => {
    const t = { name: "X", academicYear: "", start: "2026-12-01", end: "2026-12-30", status: "Open" as const };
    expect(overlappingTerm(t, [...DEFAULT_TERMS, t])).toBe("Fall 26");
  });
  it("names terms from old tabs", () => {
    expect(termFromTab("FALL 26")).toBe("Fall 26");
    expect(termFromTab("SPRING 27")).toBe("Spring 27");
    expect(termFromTab("oriet tours")).toBeNull();
  });
});

describe("status (the workflow stage)", () => {
  const today = "2026-11-19";
  it("New when nobody is assigned", () => expect(statusOf(bk({ date: "2026-12-01" }), today)).toBe("New"));
  it("Planning when assigned and ahead", () => expect(statusOf(bk({ date: "2026-12-01", librarian: "Lisa" }), today)).toBe("Planning"));
  it("Wrap-up when the date passed", () => expect(statusOf(bk({ date: "2026-11-01", librarian: "Lisa" }), today)).toBe("Wrap-up"));
  it("Completed once attendance is in", () => expect(statusOf(bk({ date: "2026-11-01", librarian: "Lisa", attendance: 12 }), today)).toBe("Completed"));
});

describe("mergeBooking", () => {
  const base = bk({ course: "EN 103", notes: "a", librarian: "" });
  it("keeps both people's changes to different fields", () => {
    const current = { ...base, librarian: "Lisa", updatedBy: "Lisa" };
    const mine = { ...base, notes: "b" };
    const r = mergeBooking(base, mine, current);
    expect(r.conflicts).toEqual([]);
    expect(r.merged.librarian).toBe("Lisa");
    expect(r.merged.notes).toBe("b");
  });
  it("flags the same field changed two ways", () => {
    const current = { ...base, notes: "theirs", updatedBy: "Lisa" };
    const r = mergeBooking(base, { ...base, notes: "mine" }, current);
    expect(r.conflicts.map((c) => c.field)).toEqual(["notes"]);
    expect(r.conflicts[0]).toMatchObject({ theirs: "theirs", mine: "mine", theirUser: "Lisa" });
  });
  it("same new value is not a conflict", () => {
    const current = { ...base, notes: "x" };
    expect(mergeBooking(base, { ...base, notes: "x" }, current).conflicts).toEqual([]);
  });
});

describe("dashboard metrics", () => {
  const rows: Booking[] = [
    bk({ librarian: "Kathleen", college: "Business", studentType: "Graduate", sessionFormat: "Face to face", sessionType: "One shot", attendance: 20, classSize: 25, prepMinutes: 60, date: "2026-09-01" }),
    bk({ librarian: "Kathleen", college: "Business", studentType: "Undergraduate", sessionFormat: "Synchronous", sessionType: "Embedded", attendance: 10, classSize: 10, prepMinutes: 120, date: "2026-09-02" }),
    bk({ librarian: "Lisa", college: "", studentType: "", sessionFormat: "Face to face", sessionType: "One shot", attendance: null, classSize: 30, prepMinutes: 30, date: "2026-09-03" }),
    bk({ librarian: "", college: "Education", studentType: "Graduate", sessionFormat: "Asynchronous", sessionType: "Tour", term: "Spring 27", date: "2027-02-01" }),
    bk({ librarian: "Lisa", deletedAt: "2026-09-10T00:00:00Z", date: "2026-09-04" }),
  ];
  it("totals for one term, deleted rows left out", () => {
    const f = applyFilters(rows, emptyFilters({ kind: "term", term: "Fall 26" }), DEFAULT_TERMS);
    expect(f).toHaveLength(3);
    expect(kpis(f)).toEqual({ sessions: 3, attendance: 30, avgAttendance: 15, prepHours: 3.5, attendanceVsClassSize: 86 });
  });
  it("academic year covers all its terms", () => {
    expect(applyFilters(rows, emptyFilters({ kind: "year", year: "2026-2027" }), DEFAULT_TERMS)).toHaveLength(4);
  });
  it("filters: AND across, OR within, Not set matches blanks", () => {
    const base = emptyFilters({ kind: "all" });
    expect(applyFilters(rows, { ...base, librarian: ["Kathleen", "Lisa"] }, DEFAULT_TERMS)).toHaveLength(3);
    expect(applyFilters(rows, { ...base, librarian: ["Kathleen"], sessionFormat: ["Face to face"] }, DEFAULT_TERMS)).toHaveLength(1);
    expect(applyFilters(rows, { ...base, college: [NOT_SET] }, DEFAULT_TERMS)).toHaveLength(1);
  });
  it("bars include a Not set bucket last", () => {
    const f = applyFilters(rows, emptyFilters({ kind: "all" }), DEFAULT_TERMS);
    const bars = groupBy(f, "librarian", ["Kathleen", "Lisa", "Michele"]);
    expect(bars.map((b) => [b.label, b.count])).toEqual([["Kathleen", 2], ["Lisa", 1], ["Michele", 0], [NOT_SET, 1]]);
  });
});

describe("calendar file", () => {
  it("timed event", () => {
    const ics = buildIcs(bk({ date: "2026-09-15", time: "1-2pm", course: "EN 103", faculty: "Rivera", location: "Library" }))!;
    expect(ics.allDay).toBe(false);
    expect(ics.text).toContain("DTSTART:20260915T130000");
    expect(ics.text).toContain("DTEND:20260915T140000");
    expect(ics.text).toContain("SUMMARY:Library instruction: EN 103 (Rivera)");
    expect(ics.text).toContain("LOCATION:Library");
  });
  it("all-day when the time can't be read", () => {
    const ics = buildIcs(bk({ date: "2026-09-15", time: "Online" }))!;
    expect(ics.allDay).toBe(true);
    expect(ics.text).toContain("DTSTART;VALUE=DATE:20260915");
    expect(ics.text).toContain("DTEND;VALUE=DATE:20260916");
  });
});

describe("workbook rows", () => {
  it("round-trips a booking through table headers in any order", () => {
    const b = bk({ course: "PA517", classSize: 82, attendance: null, date: "2026-08-20" });
    const headers = [...BOOKING_COLUMNS.map((c) => c.header)].reverse();
    const row = toRow(BOOKING_COLUMNS, b, headers);
    const back = fromRow(BOOKING_COLUMNS, headers, row, {} as Booking);
    expect(back.course).toBe("PA517");
    expect(back.classSize).toBe(82);
    expect(back.attendance).toBeNull();
    expect(back.date).toBe("2026-08-20");
  });
  it("reads Excel day numbers and US dates", () => {
    expect(toIsoDate(46253)).toBe("2026-08-19");
    expect(toIsoDate("8/19/2026")).toBe("2026-08-19");
  });
});
