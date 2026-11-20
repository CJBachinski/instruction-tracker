import { useMemo, useState } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Download } from "lucide-react";
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
import { PageHeader, fmtDate, type PageProps } from "./common";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

type FilterKey = Exclude<keyof DashFilters, "period">;
const FILTER_KEY = "instruction-tracker-dash-filters";
const FILTER_KEYS: FilterKey[] = ["studentType", "librarian", "college", "sessionFormat", "sessionType"];

function loadSaved(fallback: DashFilters): DashFilters {
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (raw) return { ...fallback, ...(JSON.parse(raw) as DashFilters) };
  } catch {
    /* ignore */
  }
  return fallback;
}

// One color per librarian, in list order, used by the calendar and the librarian chart.
const LIBRARIAN_COLORS = ["#2563eb", "#ea7317", "#16a34a", "#9333ea", "#db2777", "#0d9488"];
const UNASSIGNED_COLOR = "#8e8e93";
const NEUTRAL_BAR = "#48484a";

function librarianColor(name: string, librarians: string[]): string {
  if (!name || name === NOT_SET) return UNASSIGNED_COLOR;
  const i = librarians.indexOf(name);
  return LIBRARIAN_COLORS[(i < 0 ? librarians.length : i) % LIBRARIAN_COLORS.length];
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

  const periodValue =
    f.period.kind === "term" ? `term:${f.period.term}` : f.period.kind === "year" ? `year:${f.period.year}` : f.period.kind;
  const setPeriodValue = (v: string) => {
    if (v.startsWith("term:")) update({ ...f, period: { kind: "term", term: v.slice(5) } });
    else if (v.startsWith("year:")) update({ ...f, period: { kind: "year", year: v.slice(5) } });
    else if (v === "range") update({ ...f, period: { kind: "range", from: "", to: "" } });
    else update({ ...f, period: { kind: "all" } });
    setMonth(null);
  };
  const range = f.period.kind === "range" ? f.period : null;
  const activeCount = FILTER_KEYS.reduce((n, key) => n + f[key].length, 0);

  const filterMenu = (label: string, key: FilterKey, values: string[], withNotSet = false) => {
    const picked = f[key];
    const options = [...values, ...(withNotSet ? [NOT_SET] : [])];
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className={cn("font-normal", picked.length > 0 && "border-foreground/40 font-medium")}>
            {picked.length === 0 ? label : picked.length === 1 ? picked[0] : `${label}, ${picked.length}`}
            <ChevronDown className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-48">
          {options.length === 0 && <p className="px-2 py-1.5 text-[13px] text-muted-foreground">Nothing to choose yet. Add values in Settings.</p>}
          {options.map((v) => (
            <DropdownMenuCheckboxItem
              key={v}
              checked={picked.includes(v)}
              onCheckedChange={() => toggle(key, v)}
              onSelect={(e) => e.preventDefault()}
            >
              {v}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  const barChart = (title: string, key: FilterKey, bars: Bar[], colorOf: (label: string) => string) => {
    const max = Math.max(1, ...bars.map((b) => b.count));
    return (
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="pb-3 text-[15px] font-semibold">{title}</h2>
        {bars.length === 0 && <p className="text-muted-foreground">No bookings match these filters.</p>}
        <div className="flex flex-col">
          {bars.map((b) => {
            const selected = f[key].length === 1 && f[key][0] === b.label;
            return (
              <button
                key={b.label}
                type="button"
                aria-pressed={selected}
                title={`${b.count} sessions, ${b.attendance} attended, ${b.prepHours} prep hours. Click to filter.`}
                onClick={() => only(key, b.label)}
                className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-3 rounded-md px-1.5 py-1.5 text-left hover:bg-muted"
              >
                <span className={cn("truncate text-[14px]", selected && "font-semibold", b.label === NOT_SET && "text-muted-foreground")}>
                  {b.label}
                </span>
                <span className="h-3 overflow-hidden rounded-full bg-muted">
                  <span
                    className="block h-full rounded-full transition-[width] duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)]"
                    style={{ width: `${(b.count / max) * 100}%`, background: b.label === NOT_SET ? UNASSIGNED_COLOR : colorOf(b.label) }}
                  />
                </span>
                <span className="text-right text-[14px] font-medium tabular-nums">{b.count}</span>
              </button>
            );
          })}
        </div>
      </section>
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
    const filtersText = [periodText(), ...FILTER_KEYS.map((key) => `${key}: ${f[key].length ? f[key].join(", ") : "All"}`)];
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

  const stats: [string, string][] = [
    [String(k.sessions), "Sessions"],
    [k.attendance.toLocaleString(), "Students attended"],
    [k.avgAttendance !== null ? String(k.avgAttendance) : "None yet", "Average per session"],
    [String(k.prepHours), "Prep hours"],
    [k.attendanceVsClassSize !== null ? `${k.attendanceVsClassSize}%` : "None yet", "Attendance vs class size"],
  ];

  return (
    <>
      <PageHeader title="Dashboard">
        <Button variant="outline" onClick={exportDash}>
          <Download /> Export to Excel
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 pb-5">
        <Select value={periodValue} onValueChange={setPeriodValue}>
          <SelectTrigger aria-label="Period" className="min-w-40 font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Term</SelectLabel>
              {terms.map((t) => (
                <SelectItem key={t.name} value={`term:${t.name}`}>{t.name}</SelectItem>
              ))}
            </SelectGroup>
            {years.length > 0 && (
              <SelectGroup>
                <SelectLabel>Academic year</SelectLabel>
                {years.map((y) => (
                  <SelectItem key={y} value={`year:${y}`}>{y}</SelectItem>
                ))}
              </SelectGroup>
            )}
            <SelectGroup>
              <SelectLabel>Other</SelectLabel>
              <SelectItem value="range">Date range</SelectItem>
              <SelectItem value="all">All time</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
        {range && (
          <>
            <Input type="date" aria-label="From" className="w-40" value={range.from} onChange={(e) => update({ ...f, period: { ...range, from: e.target.value } })} />
            <span className="text-muted-foreground">to</span>
            <Input type="date" aria-label="To" className="w-40" value={range.to} onChange={(e) => update({ ...f, period: { ...range, to: e.target.value } })} />
          </>
        )}
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        {filterMenu("Student type", "studentType", L.studentType, true)}
        {filterMenu("Librarian", "librarian", L.librarian, true)}
        {filterMenu("College/School", "college", L.college, true)}
        {filterMenu("Format", "sessionFormat", L.sessionFormat)}
        {filterMenu("Session type", "sessionType", L.sessionType)}
        {activeCount > 0 && (
          <Button variant="ghost" onClick={() => update(emptyFilters(f.period))}>
            Reset filters
          </Button>
        )}
      </div>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border bg-card p-5">
          <div className="flex items-center justify-between pb-3">
            <h2 className="text-[15px] font-semibold">{first.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth(addMonths(shownMonth, -1))}>
                <ChevronLeft />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setMonth(monthStart(today))}>
                Today
              </Button>
              <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth(addMonths(shownMonth, 1))}>
                <ChevronRight />
              </Button>
            </div>
          </div>
          <div key={shownMonth} className="view-in grid grid-cols-7 border-t border-l">
            {DOW.map((d) => (
              <div key={d} className="border-r border-b px-2 py-1.5 text-[12px] text-muted-foreground">{d}</div>
            ))}
            {visibleCells.map((c) => {
              const list = dates.get(c) ?? [];
              const out = c.slice(0, 7) !== shownMonth.slice(0, 7);
              // Days from the month before or after stay blank, so only this month's bookings show.
              if (out) return <div key={c} aria-hidden="true" className="min-h-[5.5rem] border-r border-b bg-muted/40" />;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setDay(day === c ? null : c)}
                  aria-pressed={day === c}
                  aria-label={`${fmtDate(c)}: ${list.length} ${list.length === 1 ? "booking" : "bookings"}`}
                  className={cn(
                    "flex min-h-[5.5rem] min-w-0 flex-col gap-0.5 border-r border-b p-1.5 text-left -outline-offset-2 hover:bg-muted/60",
                    day === c && "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "flex size-6 items-center justify-center rounded-full text-[12px] tabular-nums",
                      c === today && "bg-foreground font-semibold text-background",
                    )}
                  >
                    {Number(c.slice(8))}
                  </span>
                  {list.slice(0, 2).map((b) => {
                    const c = librarianColor(b.librarian, L.librarian);
                    return (
                      <span
                        key={b.id}
                        title={`${b.course} ${b.time}, ${b.librarian || "no librarian"}`}
                        className="block w-full truncate rounded-[5px] border-l-[3px] px-1 py-px text-[12px] leading-tight text-foreground"
                        style={{ borderColor: c, background: `color-mix(in srgb, ${c} 16%, white)` }}
                      >
                        <span className="font-medium">{b.course}</span> {b.time}
                      </span>
                    );
                  })}
                  {list.length > 2 && <span className="text-[12px] text-muted-foreground">{list.length - 2} more</span>}
                </button>
              );
            })}
          </div>
          <ul className="flex flex-wrap gap-x-5 gap-y-1 pt-3 text-[13px]" aria-label="Calendar colors">
            {[...L.librarian, ""].map((l) => (
              <li key={l || "none"} className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full" style={{ background: librarianColor(l, L.librarian) }} />
                {l || "No librarian"}
              </li>
            ))}
          </ul>
          {day && (
            <div key={day} className="view-in pt-4">
              <h3 className="pb-1 text-[14px] font-semibold">{fmtDate(day)}</h3>
              {(dates.get(day) ?? []).length === 0 && <p className="text-muted-foreground">No bookings that day.</p>}
              <ul className="divide-y">
                {(dates.get(day) ?? []).map((b) => (
                  <li key={b.id} className="flex items-center gap-3 py-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: librarianColor(b.librarian, L.librarian) }} />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-semibold">{b.course}</span>{" "}
                      <span className="text-muted-foreground">
                        {[b.time, b.faculty && `with ${b.faculty}`, b.librarian || "no librarian", b.location].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <Button variant="outline" size="sm" onClick={() => setOpen(b)}>Open</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="flex flex-col gap-5">
          {barChart("Sessions by librarian", "librarian", byLibrarian, (l) => librarianColor(l, L.librarian))}
          {barChart("Bookings by college/school", "college", byCollege, () => NEUTRAL_BAR)}
          {barChart("Bookings by student type", "studentType", byStudent, () => NEUTRAL_BAR)}
        </div>
      </div>

      <h2 className="px-1 pt-8 pb-2 text-[15px] font-semibold">Totals for this period</h2>
      <dl className="grid grid-cols-2 overflow-hidden rounded-2xl border bg-card sm:grid-cols-3 lg:grid-cols-5">
        {stats.map(([value, label]) => (
          <div key={label} className="-mr-px -mb-px border-r border-b px-5 py-4">
            <dd className="text-[28px] leading-tight font-semibold tabular-nums">{value}</dd>
            <dt className="text-[13px] text-muted-foreground">{label}</dt>
          </div>
        ))}
      </dl>

      {open && (
        <BookingDialog
          {...p}
          key={open.id}
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
