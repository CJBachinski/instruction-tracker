import { useMemo, useState } from "react";
import { blankBooking, isMissingDetails, statusOf, todayIso, type Booking, type Status } from "../model";
import { academicYears, sortTerms, termFor } from "../logic/terms";
import { buildExport } from "../io/exportWorkbook";
import { downloadBlob } from "../io/download";
import BookingDialog from "./BookingDialog";
import { fmtDate, type PageProps } from "./common";

type Tab = Status | "Missing details" | "All";
const TABS: { tab: Tab; hint: string }[] = [
  { tab: "New", hint: "no librarian assigned yet" },
  { tab: "Planning", hint: "assigned, session still ahead" },
  { tab: "Wrap-up", hint: "session date passed, attendance not entered" },
  { tab: "Completed", hint: "attendance entered" },
  { tab: "Missing details", hint: "no college/school or student type" },
  { tab: "All", hint: "every booking" },
];

type SortKey = "date" | "course" | "faculty" | "librarian" | "term";

export default function BookingsPage(p: PageProps) {
  const { data } = p;
  const today = todayIso();
  const currentTerm = termFor(today, data.terms) ?? "";
  const [tab, setTab] = useState<Tab>("All");
  const [period, setPeriod] = useState<string>(currentTerm ? `term:${currentTerm}` : "all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; asc: boolean }>({ key: "date", asc: true });
  const [open, setOpen] = useState<{ booking: Booking; isNew: boolean } | null>(null);

  const terms = useMemo(() => sortTerms(data.terms), [data.terms]);
  const years = useMemo(() => academicYears(data.terms), [data.terms]);

  const inPeriod = (b: Booking) => {
    if (period === "all") return true;
    const [kind, val] = [period.slice(0, period.indexOf(":")), period.slice(period.indexOf(":") + 1)];
    if (kind === "term") return b.term === val;
    if (kind === "year") return data.terms.some((t) => t.academicYear === val && t.name === b.term);
    return true;
  };

  const base = data.bookings.filter((b) => !b.deletedAt && inPeriod(b));
  const needle = q.trim().toLowerCase();
  const searched = needle
    ? base.filter((b) =>
        [b.course, b.faculty, b.location, b.notes, b.librarian].some((v) => v.toLowerCase().includes(needle)),
      )
    : base;

  const inTab = (b: Booking, t: Tab) =>
    t === "All" ? true : t === "Missing details" ? isMissingDetails(b) : statusOf(b, today) === t;

  const counts = Object.fromEntries(TABS.map(({ tab: t }) => [t, searched.filter((b) => inTab(b, t)).length]));
  const rows = searched
    .filter((b) => inTab(b, tab))
    .sort((a, b) => {
      const av = (a[sort.key] || "") as string;
      const bv = (b[sort.key] || "") as string;
      const c = av.localeCompare(bv) || a.date.localeCompare(b.date);
      return sort.asc ? c : -c;
    });

  const th = (key: SortKey, label: string) => (
    <th onClick={() => setSort((s) => ({ key, asc: s.key === key ? !s.asc : true }))}>
      {label} {sort.key === key ? (sort.asc ? "▲" : "▼") : ""}
    </th>
  );

  async function exportAll() {
    try {
      const buf = await buildExport(data.bookings, data.terms, data.lists);
      downloadBlob(new Blob([buf]), `Instruction Classes ${today}.xlsx`);
      p.notify("Excel export downloaded.");
    } catch (e) {
      p.notify((e as Error).message, true);
    }
  }

  const newBooking = () => {
    const term = period.startsWith("term:") ? period.slice(5) : currentTerm;
    setOpen({ booking: blankBooking(p.store.user, term), isNew: true });
  };

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Bookings</h1>
          <p className="sub">Every instruction session, from request to completed. Click a row to open it.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={exportAll}>Export to Excel</button>
          <button className="btn primary" onClick={newBooking}>+ New booking</button>
        </div>
      </div>

      <div className="row">
        <select value={period} onChange={(e) => setPeriod(e.target.value)} aria-label="Term or year">
          <option value="all">All terms</option>
          {years.map((y) => (
            <option key={y} value={`year:${y}`}>Academic year {y}</option>
          ))}
          {terms.map((t) => (
            <option key={t.name} value={`term:${t.name}`}>
              {t.name}{t.status === "Closed" ? " (closed)" : ""}
            </option>
          ))}
        </select>
        <input type="search" placeholder="Search course, faculty, location, notes…" value={q} onChange={(e) => setQ(e.target.value)} style={{ minWidth: 300 }} />
      </div>

      <div className="tabs" role="tablist">
        {TABS.map(({ tab: t, hint }) => (
          <button key={t} role="tab" aria-selected={tab === t} title={hint} className={`tab ${tab === t ? "active" : ""}`} onClick={() => setTab(t)}>
            {t}<span className="n">{counts[t]}</span>
          </button>
        ))}
      </div>

      <div className="tablewrap">
        {rows.length === 0 ? (
          <div className="empty">Nothing here. {tab !== "All" ? "Try the All tab or another term." : "Add a booking to get started."}</div>
        ) : (
          <table className="data">
            <thead>
              <tr>
                {th("term", "Term")}
                {th("date", "Date")}
                <th>Time</th>
                {th("course", "Course #")}
                {th("faculty", "Faculty")}
                {th("librarian", "Librarian")}
                <th>Session</th>
                <th>Format</th>
                <th>Location</th>
                <th>Room</th>
                <th>Class / Attended</th>
                <th>Status</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => {
                const s = statusOf(b, today);
                return (
                  <tr key={b.id} onClick={() => setOpen({ booking: b, isNew: false })} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen({ booking: b, isNew: false })}>
                    <td>{b.term}</td>
                    <td>{fmtDate(b.date)}</td>
                    <td>{b.time}</td>
                    <td><b>{b.course}</b></td>
                    <td>{b.faculty}</td>
                    <td>{b.librarian || <span className="muted">—</span>}</td>
                    <td>{b.sessionType}</td>
                    <td>{b.sessionFormat}</td>
                    <td>{b.location}</td>
                    <td>{b.roomStatus}</td>
                    <td>{b.classSize ?? "–"} / {b.attendance ?? "–"}</td>
                    <td><span className={`status ${s}`}>{s}</span></td>
                    <td className="notes" title={b.notes}>{b.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <BookingDialog
          {...p}
          base={open.booking}
          isNew={open.isNew}
          onClose={() => setOpen(null)}
          onSaved={async (_saved, isNew) => {
            setOpen(null);
            p.notify(isNew ? "Booking added." : "Saved.");
            await p.refresh();
          }}
          onDuplicate={(b) => {
            const copy = blankBooking(p.store.user, b.term);
            Object.assign(copy, {
              time: b.time, course: b.course, faculty: b.faculty, facultyEmail: b.facultyEmail,
              college: b.college, studentType: b.studentType, sessionFormat: b.sessionFormat,
              location: b.location, librarian: b.librarian, sessionType: b.sessionType, classSize: b.classSize,
            });
            setOpen({ booking: copy, isNew: true });
          }}
        />
      )}
    </>
  );
}
