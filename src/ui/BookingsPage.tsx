import { useMemo, useState, type ReactNode } from "react";
import { Download, Plus, Search } from "lucide-react";
import { blankBooking, isMissingDetails, statusOf, todayIso, type Booking, type Status } from "../model";
import { academicYears, isClosed, sortTerms, termFor } from "../logic/terms";
import { buildExport } from "../io/exportWorkbook";
import { downloadBlob } from "../io/download";
import BookingDialog from "./BookingDialog";
import { PageHeader, dateParts, type PageProps } from "./common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Tab = "To do" | Status | "Missing details" | "All";
const TABS: { tab: Tab; hint: string }[] = [
  { tab: "To do", hint: "What needs someone's attention now" },
  { tab: "New", hint: "No librarian assigned yet" },
  { tab: "Planning", hint: "Assigned, session still ahead" },
  { tab: "Wrap-up", hint: "Session date passed, attendance not entered" },
  { tab: "Completed", hint: "Attendance entered" },
  { tab: "Missing details", hint: "No college/school or student type" },
  { tab: "All", hint: "Every booking" },
];

const SORTS = {
  "date-asc": "Date, earliest first",
  "date-desc": "Date, latest first",
  course: "Course",
  faculty: "Faculty",
  librarian: "Librarian",
} as const;
type SortKey = keyof typeof SORTS;

const SOON_DAYS = 14;

function addDays(iso: string, n: number) {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export default function BookingsPage(p: PageProps) {
  const { data, store, notify } = p;
  const today = todayIso();
  const currentTerm = termFor(today, data.terms) ?? "";
  const [tab, setTab] = useState<Tab>("To do");
  const [period, setPeriod] = useState<string>(currentTerm ? `term:${currentTerm}` : "all");
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("date-asc");
  const [open, setOpen] = useState<{ booking: Booking; isNew: boolean } | null>(null);

  const terms = useMemo(() => sortTerms(data.terms), [data.terms]);
  const years = useMemo(() => academicYears(data.terms), [data.terms]);

  const inPeriod = (b: Booking) => {
    if (period === "all") return true;
    const kind = period.slice(0, period.indexOf(":"));
    const val = period.slice(period.indexOf(":") + 1);
    if (kind === "term") return b.term === val;
    if (kind === "year") return data.terms.some((t) => t.academicYear === val && t.name === b.term);
    return true;
  };

  const needle = q.trim().toLowerCase();
  const matchesSearch = (b: Booking) =>
    !needle || [b.course, b.faculty, b.location, b.notes, b.librarian].some((v) => v.toLowerCase().includes(needle));

  const live = data.bookings.filter((b) => !b.deletedAt && matchesSearch(b));
  const scoped = live.filter(inPeriod);

  const inTab = (b: Booking, t: Tab) =>
    t === "All" || t === "To do" ? true : t === "Missing details" ? isMissingDetails(b) : statusOf(b, today) === t;

  // The To do view looks across every term, so nothing that needs attention hides behind the term picker.
  const byDate = (a: Booking, b: Booking) => (a.date || "9999").localeCompare(b.date || "9999");
  const needLibrarian = live.filter((b) => statusOf(b, today) === "New").sort(byDate);
  const needAttendance = live.filter((b) => statusOf(b, today) === "Wrap-up").sort(byDate);
  const soonLimit = addDays(today, SOON_DAYS);
  const comingUp = live
    .filter((b) => statusOf(b, today) === "Planning" && b.date && b.date <= soonLimit)
    .sort(byDate);
  const missing = live.filter(isMissingDetails).length;

  const counts: Record<Tab, number> = Object.fromEntries(
    TABS.map(({ tab: t }) => [
      t,
      t === "To do" ? needLibrarian.length + needAttendance.length : scoped.filter((b) => inTab(b, t)).length,
    ]),
  ) as Record<Tab, number>;

  const rows = scoped
    .filter((b) => inTab(b, tab))
    .sort((a, b) => {
      if (sort === "date-asc") return byDate(a, b);
      if (sort === "date-desc") return byDate(b, a);
      return (a[sort] || "￿").localeCompare(b[sort] || "￿") || byDate(a, b);
    });

  async function quickSave(b: Booking, patch: Partial<Booking>, done: string) {
    try {
      const res = await store.updateBooking(b, { ...b, ...patch });
      if (res.ok) {
        notify(done);
        await p.refresh();
      } else {
        notify("Someone else changed this booking. Review it and save again.", true);
        await p.refresh();
        setOpen({ booking: res.current, isNew: false });
      }
    } catch (e) {
      notify((e as Error).message, true);
    }
  }

  async function exportAll() {
    try {
      const buf = await buildExport(data.bookings, data.terms, data.lists);
      downloadBlob(new Blob([buf]), `Instruction Classes ${today}.xlsx`);
      notify("Excel export downloaded.");
    } catch (e) {
      notify((e as Error).message, true);
    }
  }

  const newBooking = () => {
    const term = tab !== "To do" && period.startsWith("term:") ? period.slice(5) : currentTerm;
    setOpen({ booking: blankBooking(store.user, term), isNew: true });
  };

  const openRow = (b: Booking) => setOpen({ booking: b, isNew: false });

  const action = (b: Booking): ReactNode => {
    if (isClosed(b.term, data.terms)) return null;
    const s = statusOf(b, today);
    if (s === "New")
      return (
        <AssignButton
          librarians={data.lists.librarian}
          onPick={(name) => quickSave(b, { librarian: name }, `${b.course} assigned to ${name}.`)}
        />
      );
    if (s === "Wrap-up")
      return (
        <AttendanceButton
          booking={b}
          onSave={(n) => quickSave(b, { attendance: n }, `Attendance saved for ${b.course}.`)}
        />
      );
    return null;
  };

  const todoEmpty = !needLibrarian.length && !needAttendance.length && !comingUp.length;

  return (
    <>
      <PageHeader title="Bookings">
        <Button variant="outline" onClick={exportAll}>
          <Download /> Export to Excel
        </Button>
        <Button onClick={newBooking}>
          <Plus /> New booking
        </Button>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-3 pb-5">
        <div className="max-w-full overflow-x-auto">
          <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
            <TabsList className="h-9">
              {TABS.map(({ tab: t, hint }) => (
                <TabsTrigger key={t} value={t} title={hint} className="px-3">
                  {t}
                  <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{counts[t]}</span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {tab !== "To do" && (
            <>
              <Select value={period} onValueChange={setPeriod}>
                <SelectTrigger aria-label="Term or year" className="min-w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All terms</SelectItem>
                  {years.length > 0 && (
                    <SelectGroup>
                      <SelectLabel>Academic year</SelectLabel>
                      {years.map((y) => (
                        <SelectItem key={y} value={`year:${y}`}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                  <SelectGroup>
                    <SelectLabel>Term</SelectLabel>
                    {terms.map((t) => (
                      <SelectItem key={t.name} value={`term:${t.name}`}>
                        {t.name}
                        {t.status === "Closed" ? " (closed)" : ""}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
                <SelectTrigger aria-label="Sort by" className="min-w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(SORTS) as SortKey[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {SORTS[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              aria-label="Search bookings"
              placeholder="Search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-52 pl-8"
            />
          </div>
        </div>
      </div>

      <div key={tab} className="view-in">
      {tab === "To do" ? (
        <div className="flex flex-col gap-8">
          {todoEmpty && (
            <Empty title={needle ? "No matches" : "You're all caught up"}>
              {needle
                ? "Nothing that needs attention matches your search."
                : "Every booking has a librarian, and attendance is in for every past session."}
            </Empty>
          )}
          {needLibrarian.length > 0 && (
            <Section title="Needs a librarian" count={needLibrarian.length}>
              {needLibrarian.map((b) => (
                <Row key={b.id} b={b} onOpen={openRow} action={action(b)} />
              ))}
            </Section>
          )}
          {needAttendance.length > 0 && (
            <Section
              title="Enter attendance"
              count={needAttendance.length}
              hint="These sessions have happened. Add the head count to complete them."
            >
              {needAttendance.map((b) => (
                <Row key={b.id} b={b} onOpen={openRow} action={action(b)} />
              ))}
            </Section>
          )}
          {comingUp.length > 0 && (
            <Section title="Coming up" count={comingUp.length} hint={`Planned sessions in the next ${SOON_DAYS} days.`}>
              {comingUp.map((b) => (
                <Row key={b.id} b={b} onOpen={openRow} trailing={b.roomStatus ? `Room ${b.roomStatus.toLowerCase()}` : "Room not set"} />
              ))}
            </Section>
          )}
          {missing > 0 && !needle && (
            <p className="text-muted-foreground">
              {missing} {missing === 1 ? "booking is" : "bookings are"} missing a college/school or student type, which the
              dashboard needs.{" "}
              <button type="button" className="font-medium text-foreground underline underline-offset-4" onClick={() => { setPeriod("all"); setTab("Missing details"); }}>
                Review them
              </button>
            </p>
          )}
        </div>
      ) : rows.length === 0 ? (
        <Empty title="Nothing here">
          {tab === "All" ? "Add a booking to get started." : "Try another tab, term or search."}
        </Empty>
      ) : (
        <List>
          {rows.map((b) => (
            <Row key={b.id} b={b} onOpen={openRow} action={action(b)} trailing={tab === "All" || tab === "Missing details" ? statusOf(b, today) : undefined} showTerm={!period.startsWith("term:")} />
          ))}
        </List>
      )}
      </div>

      {open && (
        <BookingDialog
          {...p}
          key={open.booking.id}
          base={open.booking}
          isNew={open.isNew}
          onClose={() => setOpen(null)}
          onSaved={async (_saved, isNew) => {
            setOpen(null);
            notify(isNew ? "Booking added." : "Saved.");
            await p.refresh();
          }}
          onDuplicate={(b) => {
            const copy = blankBooking(store.user, b.term);
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

function Section(props: { title: string; count: number; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-baseline gap-2 px-1 pb-2">
        <h2 className="text-[17px] font-semibold">{props.title}</h2>
        <span className="text-muted-foreground tabular-nums">{props.count}</span>
        {props.hint && <p className="ml-auto hidden text-[13px] text-muted-foreground lg:block">{props.hint}</p>}
      </div>
      <List>{props.children}</List>
    </section>
  );
}

function List(props: { children: ReactNode }) {
  return <ul className="stagger divide-y overflow-hidden rounded-2xl border bg-card">{props.children}</ul>;
}

function Empty(props: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-2xl border bg-card px-6 py-16 text-center">
      <p className="text-[17px] font-semibold">{props.title}</p>
      <p className="mt-1 text-muted-foreground">{props.children}</p>
    </div>
  );
}

function Row(props: {
  b: Booking;
  onOpen: (b: Booking) => void;
  action?: ReactNode;
  trailing?: string;
  showTerm?: boolean;
}) {
  const { b } = props;
  const d = dateParts(b.date);
  return (
    <li className="flex items-center gap-2 pr-4 transition-colors duration-150 hover:bg-muted/60 focus-within:bg-muted/60 active:bg-muted">
      <button
        type="button"
        onClick={() => props.onOpen(b)}
        className="grid min-w-0 flex-1 grid-cols-[5.5rem_minmax(0,1.4fr)_minmax(0,1fr)] items-center gap-4 rounded-lg py-3.5 pl-5 text-left -outline-offset-2 lg:grid-cols-[5.5rem_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,0.8fr)]"
      >
        <span className="leading-tight">
          {d ? (
            <>
              <span className="block font-semibold">{d.day}</span>
              <span className="block text-[13px] text-muted-foreground">
                {d.weekday}
                {props.showTerm ? `, ${d.year}` : ""}
              </span>
            </>
          ) : (
            <span className="text-muted-foreground">No date</span>
          )}
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate">
            <span className="font-semibold">{b.course || "Untitled"}</span>
            {b.faculty && <span className="text-muted-foreground"> with {b.faculty}</span>}
          </span>
          <span className="block truncate text-[13px] text-muted-foreground">
            {[b.sessionType, b.sessionFormat].filter(Boolean).join(", ") || "Session type not set"}
          </span>
        </span>
        <span className="min-w-0 leading-tight">
          <span className="block truncate">{b.time || "Time not set"}</span>
          <span className="block truncate text-[13px] text-muted-foreground">{b.location || "No location"}</span>
        </span>
        <span className="hidden min-w-0 leading-tight lg:block">
          <span className={cn("block truncate", !b.librarian && "text-muted-foreground")}>
            {b.librarian || "No librarian"}
          </span>
          {props.trailing && <span className="block truncate text-[13px] text-muted-foreground">{props.trailing}</span>}
        </span>
      </button>
      <div className="flex w-36 shrink-0 justify-end">
        {props.action ?? (props.trailing && <span className="truncate text-[13px] text-muted-foreground lg:hidden">{props.trailing}</span>)}
      </div>
    </li>
  );
}

function AssignButton(props: { librarians: string[]; onPick: (name: string) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3">
          Assign
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>Assign to</DropdownMenuLabel>
        {props.librarians.map((l) => (
          <DropdownMenuItem key={l} onSelect={() => props.onPick(l)}>
            {l}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AttendanceButton(props: { booking: Booking; onSave: (n: number) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const n = value === "" ? null : Number(value);
  const valid = n !== null && Number.isInteger(n) && n >= 0;
  const size = props.booking.classSize;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 px-3">
          Enter attendance
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          className="flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            setOpen(false);
            props.onSave(n!);
          }}
        >
          <label className="flex flex-col gap-1.5 text-[13px] font-medium text-muted-foreground">
            How many students attended?
            <Input type="number" min={0} inputMode="numeric" autoFocus value={value} onChange={(e) => setValue(e.target.value)} />
          </label>
          {size !== null && (
            <p className="text-[13px] text-muted-foreground">
              {valid && n! > size ? `That's more than the class size of ${size}. You can still save it.` : `Class size: ${size}`}
            </p>
          )}
          <Button type="submit" disabled={!valid}>
            Save attendance
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
