import { useMemo, useState } from "react";
import type { Booking } from "../model";
import { todayIso } from "../model";
import { academicYears, sortTerms, termFor } from "../logic/terms";
import {
  NOT_SET,
  applyFilters,
  byDate,
  emptyFilters,
  groupBy,
  kpis,
  type Bar,
  type DashFilters,
  type Period,
} from "../logic/metrics";
import { buildDashboardExport } from "../io/exportWorkbook";
import { downloadBlob } from "../io/download";
import BookingDialog from "./BookingDialog";
import { NOT_SET_COLOR, colorFor, fmtDate, type PageProps } from "./common";

type FilterKey = Exclude<keyof DashFilters, "period">;
const FILTER_KEY = "instruction-tracker-dash-filters";

function loadSaved(fallback: DashFilters): DashFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as DashFilters) };
  } catch {
    /* ignore */
  }
  return fallback;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function monthStart(iso: string) {
  return iso.slice(0, 7) + "-01";
}
function addMonths(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setMonth(d.getMonth() + n, 1);
  return d.toISOString().slice(0, 10);
}

export default function DashboardPage(p: PageProps) {
  const { data } = p;
  const today = todayIso();
  const L = data.lists;
  const currentTerm = termFor(today, data.terms);
  const initialPeriod: Period = currentTerm ? { kind: "term", term: currentTerm } : { kind: "all" };
  const [f, setF] = useState<DashFilters>(() => loadSaved(emptyFilters(initialPeriod)));
  const [month, setMonth] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(null);
  const [open, setOpen] = useState<Booking | null>(null);

  const update = (next: DashFilters) => {
    setF(next);
    setDay(null);
    try {
      localStorage.setItem(FILTER_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const terms = useMemo(() => sortTerms(data.terms), [data.terms]);
  const years = useMemo(() => academicYears(data.terms), [data.terms]);
  const rows = useMemo(() => applyFilters(data.bookings, f, data.terms), [data.bookings, f, data.terms]);
  const k = kpis(rows);
  const byLibrarian = groupBy(rows, "librarian", L.librarian);
  const byCollege = groupBy(rows, "college");
  const byStudent = groupBy(rows, "studentType", L.studentType);
  const dates = byDate(rows);

  const firstDate = rows.map((b) => b.date).filter(Boolean).sort()[0];
  const shownMonth =
    month ?? (rows.some((b) => b.date.startsWith(today.slice(0, 7))) || !firstDate ? monthStart(today) : monthStart(firstDate));

  const toggle = (key: FilterKey, value: string) => {
    const cur = f[key];
    update({ ...f, [key]: cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value] });
  };
  const only = (key: FilterKey, value: string) => {
    const cur = f[key];
    update({ ...f, [key]: cur.length === 1 && cur[0] === value ? [] : [value] });
  };

  const setPeriodKind = (kind: Period["kind"]) => {
    if (kind === "term") update({ ...f, period: { kind, term: currentTerm ?? terms[0]?.name ?? "" } });
    else if (kind === "year") update({ ...f, period: { kind, year: years[years.length - 1] ?? "" } });
    else if (kind === "range") update({ ...f, period: { kind, from: "", to: "" } });
    else update({ ...f, period: { kind: "all" } });
  };

  const chipGroup = (label: string, key: FilterKey, values: string[], withNotSet = false) => (
    <div className="chipgroup">
      <b>{label}</b>
      {[...values, ...(withNotSet ? [NOT_SET] : [])].map((v) => (
        <button key={v} className={`chip ${f[key].includes(v) ? "on" : ""}`} aria-pressed={f[key].includes(v)} onClick={() => toggle(key, v)}>
          {v}
        </button>
      ))}
    </div>
  );

  const barChart = (title: string, key: FilterKey, bars: Bar[], colorOf: (label: string) => string) => {
    const max = Math.max(1, ...bars.map((b) => b.count));
    return (
      <div className="panel">
        <h3>{title}</h3>
        {bars.length === 0 && <div className="muted">No bookings match these filters.</div>}
        <div className="bars">
          {bars.map((b) => (
            <button
              key={b.label}
              className={`bar ${f[key].length === 1 && f[key][0] === b.label ? "on" : ""}`}
              title={`${b.count} sessions · ${b.attendance} attended · ${b.prepHours} prep hours. Click to filter.`}
              onClick={() => only(key, b.label)}
            >
              <span className="label">{b.label}</span>
              <span className="track">
                <span className="fill" style={{ display: "block", width: `${(b.count / max) * 100}%`, background: colorOf(b.label) }} />
              </span>
              <span className="num">{b.count}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  // Calendar grid for the shown month, Monday first.
  const first = new Date(shownMonth + "T12:00:00");
  const offset = (first.getDay() + 6) % 7;
  const gridStart = new Date(first);
  gridStart.setDate(first.getDate() - offset);
  const cells = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
  const lastRowNeeded = cells.findIndex((c, i) => i % 7 === 0 && c.slice(0, 7) > shownMonth.slice(0, 7));
  const visibleCells = lastRowNeeded > 0 ? cells.slice(0, lastRowNeeded) : cells;

  function periodText(): string {
    const pr = f.period;
    if (pr.kind === "term") return `Term: ${pr.term}`;
    if (pr.kind === "year") return `Academic year: ${pr.year}`;
    if (pr.kind === "range") return `Dates: ${pr.from || "start"} to ${pr.to || "end"}`;
    return "All terms";
  }

  async function exportDash() {
    const filtersText = [
      periodText(),
      ...(["studentType", "librarian", "college", "sessionFormat", "sessionType"] as FilterKey[]).map(
        (key) => `${key}: ${f[key].length ? f[key].join(", ") : "All"}`,
      ),
    ];
    const kpiRows: [string, string | number][] = [
      ["Sessions", k.sessions],
      ["Total attendance", k.attendance],
      ["Average attendance per session", k.avgAttendance ?? "—"],
      ["Prep hours", k.prepHours],
      ["Attendance vs class size (%)", k.attendanceVsClassSize ?? "—"],
    ];
    try {
      const buf = await buildDashboardExport(
        filtersText,
        kpiRows,
        [
          { title: "Sessions by librarian", rows: byLibrarian },
          { title: "Bookings by college/school", rows: byCollege },
          { title: "Bookings by student type", rows: byStudent },
        ],
        rows,
        L,
      );
      downloadBlob(new Blob([buf]), `Instruction dashboard ${today}.xlsx`);
      p.notify("Dashboard export downloaded.");
    } catch (e) {
      p.notify((e as Error).message, true);
    }
  }

  const libColor = (l: string) => (l === NOT_SET ? NOT_SET_COLOR : colorFor(l, L.librarian));
  const plain = (l: string) => (l === NOT_SET ? NOT_SET_COLOR : "#2f65b5");

  return (
    <>
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h1>Dashboard</h1>
          <p className="sub">One set of filters drives everything below. Click a bar to filter to it; click it again to clear.</p>
        </div>
        <div className="row">
          <button className="btn" onClick={() => update(emptyFilters(f.period))}>Reset filters</button>
          <button className="btn primary" onClick={exportDash}>Export dashboard</button>
        </div>
      </div>

      <div className="panel filters">
        <div className="chipgroup">
          <b>Period</b>
          {(["term", "year", "range", "all"] as const).map((kind) => (
            <button key={kind} className={`chip ${f.period.kind === kind ? "on" : ""}`} onClick={() => setPeriodKind(kind)}>
              {kind === "term" ? "Term" : kind === "year" ? "Academic year" : kind === "range" ? "Date range" : "All time"}
            </button>
          ))}
          {f.period.kind === "term" && (
            <select value={f.period.term} onChange={(e) => update({ ...f, period: { kind: "term", term: e.target.value } })}>
              {terms.map((t) => <option key={t.name}>{t.name}</option>)}
            </select>
          )}
          {f.period.kind === "year" && (
            <select value={f.period.year} onChange={(e) => update({ ...f, period: { kind: "year", year: e.target.value } })}>
              {years.map((y) => <option key={y}>{y}</option>)}
            </select>
          )}
          {f.period.kind === "range" && (
            <>
              <input type="date" value={f.period.from} aria-label="From" onChange={(e) => update({ ...f, period: { ...(f.period as { kind: "range"; from: string; to: string }), from: e.target.value } })} />
              <input type="date" value={f.period.to} aria-label="To" onChange={(e) => update({ ...f, period: { ...(f.period as { kind: "range"; from: string; to: string }), to: e.target.value } })} />
            </>
          )}
        </div>
        {chipGroup("Student type", "studentType", L.studentType, true)}
        {chipGroup("Librarian", "librarian", L.librarian, true)}
        {chipGroup("College/School", "college", L.college, true)}
        {chipGroup("Session format", "sessionFormat", L.sessionFormat)}
        {chipGroup("Session type", "sessionType", L.sessionType)}
      </div>

      <div className="kpis" style={{ margin: "16px 0" }}>
        <div className="kpi"><div className="v">{k.sessions}</div><div className="l">Sessions</div></div>
        <div className="kpi"><div className="v">{k.attendance.toLocaleString()}</div><div className="l">Students attended</div></div>
        <div className="kpi"><div className="v">{k.avgAttendance ?? "—"}</div><div className="l">Average per session</div></div>
        <div className="kpi"><div className="v">{k.prepHours}</div><div className="l">Prep hours</div></div>
        <div className="kpi"><div className="v">{k.attendanceVsClassSize !== null ? `${k.attendanceVsClassSize}%` : "—"}</div><div className="l">Attendance vs class size</div></div>
      </div>

      <div className="grid2">
        <div className="panel">
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Calendar</h3>
            <div className="row">
              <button className="btn small" aria-label="Previous month" onClick={() => setMonth(addMonths(shownMonth, -1))}>◀</button>
              <b>{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</b>
              <button className="btn small" aria-label="Next month" onClick={() => setMonth(addMonths(shownMonth, 1))}>▶</button>
            </div>
          </div>
          <div className="cal">
            {DOW.map((d) => <div key={d} className="dow">{d}</div>)}
            {visibleCells.map((c) => {
              const list = dates.get(c) ?? [];
              const out = c.slice(0, 7) !== shownMonth.slice(0, 7);
              return (
                <button key={c} className={`day ${out ? "out" : ""} ${day === c ? "sel" : ""}`} onClick={() => setDay(day === c ? null : c)} aria-label={`${fmtDate(c)}: ${list.length} bookings`}>
                  <span className="d">{Number(c.slice(8))}</span>
                  {list.slice(0, 3).map((b) => (
                    <span key={b.id} className="chipb" style={{ background: colorFor(b.librarian, L.librarian) }}>
                      {b.course} {b.time}
                    </span>
                  ))}
                  {list.length > 3 && <span className="more">+{list.length - 3} more</span>}
                </button>
              );
            })}
          </div>
          <div className="legend" style={{ marginTop: 8 }}>
            {L.librarian.map((l) => <span key={l} style={{ ["--c" as string]: colorFor(l, L.librarian) }}>{l}</span>)}
            <span style={{ ["--c" as string]: NOT_SET_COLOR }}>Not assigned</span>
          </div>
          {day && (
            <div style={{ marginTop: 12 }}>
              <h3>{fmtDate(day)}</h3>
              {(dates.get(day) ?? []).length === 0 && <div className="muted">No bookings that day.</div>}
              {(dates.get(day) ?? []).map((b) => (
                <div key={b.id} className="row" style={{ padding: "4px 0", borderBottom: "1px solid var(--soft)" }}>
                  <b>{b.course}</b> <span>{b.time}</span> <span className="muted">{b.faculty} · {b.librarian || "unassigned"} · {b.location}</span>
                  <span className="spacer" />
                  <button className="btn small" onClick={() => setOpen(b)}>Open</button>
                </div>
              ))}
            </div>
          )}
        </div>
        {barChart("Sessions by librarian", "librarian", byLibrarian, libColor)}
        {barChart("Bookings by college/school", "college", byCollege, plain)}
        {barChart("Bookings by student type (program)", "studentType", byStudent, plain)}
      </div>
      <p className="muted" style={{ fontSize: 13 }}>
        Grey “Not set” bars count bookings missing a librarian, college/school or student type. Fill those in from the Missing details tab on Bookings.
      </p>

      {open && (
        <BookingDialog
          {...p}
          base={open}
          isNew={false}
          onClose={() => setOpen(null)}
          onSaved={async () => {
            setOpen(null);
            p.notify("Saved.");
            await p.refresh();
          }}
        />
      )}
    </>
  );
}
