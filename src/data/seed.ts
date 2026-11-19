// Made-up sample data for demo mode. No real faculty or class records.
import { DEFAULT_LISTS, DEFAULT_TERMS, newId, type AppData, type Booking, type Request } from "../model";

const COURSES = ["EN 103", "EN 104", "PA517", "NU800", "CSD603", "HCA200", "ED 600", "UNI 101", "BIO 210", "MBA 520"];
const FACULTY = ["Rivera", "Okafor", "Chen", "Patel", "Abbott", "Novak", "Haddad", "Larsen", "Mendez", "Quinn"];
const COLLEGES = ["Arts & Humanities", "Business", "Health Sciences", "Education", "Natural Sciences"];
const LOCATIONS = ["Library", "TTC", "PC Lab 2", "Online", "Wills 223", "Gmb 155"];
const TIMES = ["8-9:15am", "9:30-10:45", "11-12:15", "1-2pm", "2-3:15pm", "5:30-8pm", "Online"];

function rand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function makeSeed(today = new Date()): AppData {
  const r = rand(42);
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];
  const bookings: Booking[] = [];
  const start = new Date("2026-08-24T12:00:00");
  for (let i = 0; i < 64; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + Math.floor(r() * 115));
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    if (d.getDay() === 6) d.setDate(d.getDate() + 2);
    const date = iso(d);
    const past = d < today;
    const ci = Math.floor(r() * COURSES.length);
    const course = COURSES[ci];
    const grad = /5\d\d|6\d\d|8\d\d/.test(course);
    const assigned = past || r() > 0.2;
    const classSize = 10 + Math.floor(r() * 30);
    const now = new Date().toISOString();
    bookings.push({
      id: newId(),
      term: "Fall 26",
      date,
      time: pick(TIMES),
      course,
      faculty: FACULTY[ci],
      facultyEmail: "",
      college: r() > 0.15 ? COLLEGES[ci % COLLEGES.length] : "",
      studentType: r() > 0.1 ? (grad ? "Graduate" : r() > 0.85 ? "Adult Studies" : "Undergraduate") : "",
      librarian: assigned ? pick(["Kathleen", "Kathleen", "Lisa", "Michele"]) : "",
      sessionType: pick(["One shot", "One shot", "Embedded", "Workshop", "Orientation"]),
      sessionFormat: pick(["Face to face", "Face to face", "Synchronous", "Asynchronous"]),
      location: pick(LOCATIONS),
      roomStatus: assigned ? pick(["Confirmed", "Confirmed", "Pending"]) : "",
      classSize,
      attendance: past && r() > 0.25 ? Math.max(0, classSize - Math.floor(r() * 6)) : null,
      assessment: assigned ? pick(["Yes", "No", "No"]) : "",
      notes: pick(["Intro to databases", "Citation basics", "PICO / evidence-based practice", "Source evaluation", ""]),
      prepMinutes: assigned ? pick([30, 60, 60, 120, 240]) : null,
      prepKind: assigned ? pick(["New", "Updated", "Updated"]) : "",
      prepNote: "",
      source: "manual",
      requestId: "",
      importKey: "",
      createdAt: now,
      createdBy: "Demo",
      updatedAt: now,
      updatedBy: "Demo",
      version: 1,
      deletedAt: "",
    });
  }
  bookings.sort((a, b) => a.date.localeCompare(b.date));

  const requests: Request[] = [
    {
      id: "demo-req-1",
      submittedAt: new Date().toISOString(),
      term: "Spring 27",
      facultyName: "Okafor",
      facultyEmail: "okafor@example.edu",
      course: "EN 104",
      college: "Arts & Humanities",
      studentType: "Undergraduate",
      classSize: 22,
      sessionFormat: "Face to face",
      date1: "2027-02-03",
      time1: "1-2pm",
      date2: "2027-02-05",
      time2: "11-12:15",
      location: "Library",
      notes: "Research paper kickoff: finding scholarly sources",
      status: "New",
      bookingId: "",
      handledBy: "",
      handledAt: "",
      rejectReason: "",
    },
    {
      id: "demo-req-2",
      submittedAt: new Date().toISOString(),
      term: "Spring 27",
      facultyName: "Patel",
      facultyEmail: "patel@example.edu",
      course: "NU800",
      college: "Health Sciences",
      studentType: "Graduate",
      classSize: 14,
      sessionFormat: "Synchronous",
      date1: "2027-01-27",
      time1: "5:30-8pm",
      date2: "",
      time2: "",
      location: "Online",
      notes: "Systematic review searching in CINAHL",
      status: "New",
      bookingId: "",
      handledBy: "",
      handledAt: "",
      rejectReason: "",
    },
  ];

  return {
    bookings,
    requests,
    terms: DEFAULT_TERMS.map((t) => ({ ...t })),
    lists: { ...DEFAULT_LISTS, college: [...COLLEGES] },
  };
}
