import { useState } from "react";
import { LIST_LABELS, type Booking, type ListName, type Lists, type Term } from "../model";
import { overlappingTerm, sortTerms } from "../logic/terms";
import { readLegacyWorkbook, type ImportReport } from "../io/importWorkbook";
import { buildExport } from "../io/exportWorkbook";
import { resetDemo } from "../data/demoStore";
import { Field, PageHeader, fmtDate, type PageProps } from "./common";
import { useConfirm } from "./confirm";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends PageProps {
  demoUser?: { value: string; set: (v: string) => void };
}

export default function SettingsPage(p: Props) {
  const { data, store, notify } = p;
  const [terms, setTerms] = useState<Term[]>(() => sortTerms(data.terms).map((t) => ({ ...t })));
  const [lists, setLists] = useState<Lists>(data.lists);
  const [listName, setListName] = useState<ListName>("librarian");
  const [newValue, setNewValue] = useState("");
  const [tab, setTab] = useState("terms");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ bookings: Booking[]; report: ImportReport } | null>(null);
  const [ask, confirmDialog] = useConfirm();
  const fileId = useId();

  const deleted = data.bookings.filter((b) => b.deletedAt);

  const editTerm = (i: number, patch: Partial<Term>) =>
    setTerms((ts) => ts.map((t, j) => (j === i ? { ...t, ...patch } : t)));

  async function saveTerms(next = terms) {
    for (const t of next) {
      if (!t.name.trim()) return notify("Every term needs a name.", true);
      if (t.start && t.end && t.start > t.end) return notify(`${t.name}: the start date is after the end date.`, true);
      const o = overlappingTerm(t, next);
      if (o) return notify(`${t.name} overlaps ${o}. Fix the dates first.`, true);
    }
    if (new Set(next.map((t) => t.name)).size !== next.length) return notify("Two terms have the same name.", true);
    setBusy(true);
    try {
      await store.saveTerms(next);
      notify("Terms saved.");
      await p.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function closeTerm(i: number) {
    const t = terms[i];
    const count = data.bookings.filter((b) => b.term === t.name && !b.deletedAt).length;
    const answer = await ask({
      title: `Close ${t.name}?`,
      description: `Its ${count} bookings become read-only, and an archive copy is saved. You can reopen the term later.`,
      confirmLabel: "Close term",
    });
    if (!answer.ok) return;
    setBusy(true);
    try {
      const rows = data.bookings.filter((b) => b.term === t.name);
      const buf = await buildExport(rows, [t], data.lists);
      const where = await store.saveArchive(`${t.name.toUpperCase()}.xlsx`, buf);
      const next = terms.map((x, j) => (j === i ? { ...x, status: "Closed" as const } : x));
      setTerms(next);
      await store.saveTerms(next);
      notify(`${t.name} closed. Archive ${where}.`);
      await p.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function reopenTerm(i: number) {
    const answer = await ask({
      title: `Reopen ${terms[i].name}?`,
      description: "Its bookings become editable again. The archive copy stays as it is.",
      confirmLabel: "Reopen term",
    });
    if (!answer.ok) return;
    const next = terms.map((x, j) => (j === i ? { ...x, status: "Open" as const } : x));
    setTerms(next);
    await saveTerms(next);
  }

  // Dropdown lists save as soon as a value is added or removed, so there is no separate Save step.
  async function saveLists(next: Lists, done: string) {
    const before = lists;
    setLists(next);
    setBusy(true);
    try {
      await store.saveLists(next);
      notify(done);
      await p.refresh();
    } catch (e) {
      setLists(before);
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  function addValue() {
    const v = newValue.trim();
    if (!v) return;
    if (lists[listName].some((x) => x.toLowerCase() === v.toLowerCase())) {
      notify(`"${v}" is already in this list.`, true);
      return;
    }
    setNewValue("");
    void saveLists({ ...lists, [listName]: [...lists[listName], v] }, `Added "${v}".`);
  }

  function removeValue(v: string) {
    void saveLists({ ...lists, [listName]: lists[listName].filter((x) => x !== v) }, `Removed "${v}".`);
  }

  const plain = (ts: Term[]) => JSON.stringify(ts.map((t) => [t.name, t.academicYear, t.start, t.end, t.status]));
  const termsDirty = plain(terms) !== plain(sortTerms(data.terms));
  const bookingCount = (term: string) => data.bookings.filter((b) => b.term === term && !b.deletedAt).length;

  async function pickFile(file: File) {
    try {
      const keys = new Set(data.bookings.map((b) => b.importKey).filter(Boolean));
      const result = await readLegacyWorkbook(await file.arrayBuffer(), data.lists, keys, store.user);
      setPending(result);
    } catch (e) {
      notify(`Couldn't read that file: ${(e as Error).message}`, true);
    }
  }

  async function doImport() {
    if (!pending) return;
    setBusy(true);
    try {
      await store.importBookings(pending.bookings);
      // Add any term found in the file that isn't set up yet.
      const missing = [...new Set(pending.bookings.map((b) => b.term))].filter((t) => !terms.some((x) => x.name === t));
      if (missing.length) {
        const next = [...terms, ...missing.map((name) => ({ name, academicYear: "", start: "", end: "", status: "Open" as const }))];
        setTerms(next);
        await store.saveTerms(next);
      }
      notify(`Imported ${pending.bookings.length} bookings.`);
      setPending(null);
      await p.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

  async function restore(b: Booking) {
    const res = await store.updateBooking(b, { ...b, deletedAt: "" });
    if (res.ok) {
      notify("Booking restored.");
      await p.refresh();
    } else notify("Couldn't restore: someone changed it. Refresh and try again.", true);
  }

  async function resetDemoData() {
    const answer = await ask({
      title: "Reset the demo?",
      description: "This replaces everything in this browser with fresh sample data.",
      confirmLabel: "Reset demo data",
      destructive: true,
    });
    if (!answer.ok) return;
    resetDemo();
    await p.refresh();
    location.reload();
  }

  const sections: { id: string; label: string; count?: number; show: boolean }[] = [
    { id: "terms", label: "Terms", show: true },
    { id: "lists", label: "Dropdown choices", show: true },
    { id: "import", label: "Import spreadsheet", show: true },
    { id: "deleted", label: "Deleted bookings", count: deleted.length, show: true },
    { id: "demo", label: "Demo", show: store.mode === "demo" },
  ];

  return (
    <>
      <PageHeader title="Settings" />
      <div className="max-w-full overflow-x-auto pb-6">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-9">
            {sections.filter((x) => x.show).map((x) => (
              <TabsTrigger key={x.id} value={x.id} className="px-3">
                {x.label}
                {!!x.count && <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{x.count}</span>}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <div key={tab} className="view-in">
      {tab === "terms" && (
        <Card
          title="Terms"
          description="A term is a semester, like Fall 26. Its dates decide which term a booking belongs to. When a term is over, close it: the app saves an Excel copy and locks that term's bookings so they can't be changed by accident."
        >
          <ul className="flex flex-col gap-3">
            {terms.map((t, i) => {
              const saved = data.terms.some((x) => x.name === t.name);
              const closed = t.status === "Closed";
              return (
                <li key={i} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pb-3">
                    <span className="text-[16px] font-semibold">{t.name || "New term"}</span>
                    <span className="text-[13px] text-muted-foreground">
                      {closed ? "Closed, read-only" : saved ? `Open, ${bookingCount(t.name)} bookings` : "Not saved yet"}
                    </span>
                    <span className="ml-auto">
                      {closed ? (
                        <Button variant="outline" size="sm" disabled={busy} onClick={() => reopenTerm(i)}>Reopen term</Button>
                      ) : saved ? (
                        <Button variant="outline" size="sm" disabled={busy || termsDirty} title={termsDirty ? "Save your changes first" : undefined} onClick={() => closeTerm(i)}>Close term</Button>
                      ) : (
                        <Button variant="ghost" size="sm" onClick={() => setTerms(terms.filter((_, j) => j !== i))}>Remove</Button>
                      )}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Field label="Name" htmlFor={`term-name-${i}`}>
                      <Input id={`term-name-${i}`} value={t.name} placeholder="Fall 27" disabled={closed || saved} onChange={(e) => editTerm(i, { name: e.target.value })} />
                    </Field>
                    <Field label="Academic year" htmlFor={`term-year-${i}`}>
                      <Input id={`term-year-${i}`} value={t.academicYear} placeholder="2027-2028" disabled={closed} onChange={(e) => editTerm(i, { academicYear: e.target.value })} />
                    </Field>
                    <Field label="First day" htmlFor={`term-start-${i}`}>
                      <Input id={`term-start-${i}`} type="date" value={t.start} disabled={closed} onChange={(e) => editTerm(i, { start: e.target.value })} />
                    </Field>
                    <Field label="Last day" htmlFor={`term-end-${i}`}>
                      <Input id={`term-end-${i}`} type="date" value={t.end} disabled={closed} onChange={(e) => editTerm(i, { end: e.target.value })} />
                    </Field>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setTerms([...terms, { name: "", academicYear: "", start: "", end: "", status: "Open" }])}>
              <Plus /> Add a term
            </Button>
            {termsDirty && (
              <>
                <Button disabled={busy} onClick={() => saveTerms()}>Save changes</Button>
                <Button variant="ghost" onClick={() => setTerms(sortTerms(data.terms).map((t) => ({ ...t })))}>Discard</Button>
                <span className="text-[13px] font-medium">You have unsaved changes.</span>
              </>
            )}
          </div>
        </Card>
      )}

      {tab === "lists" && (
        <Card
          title="Dropdown choices"
          description="These are the options people pick from in the booking form and the faculty form. Changes save right away."
        >
          <div className="grid gap-6 md:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label="Lists" className="flex flex-col gap-0.5">
              {(Object.keys(LIST_LABELS) as ListName[]).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-current={listName === k}
                  onClick={() => { setListName(k); setNewValue(""); }}
                  className={cn(
                    "flex h-9 items-center justify-between rounded-lg px-2.5 text-left text-[14px] hover:bg-muted",
                    listName === k && "bg-muted font-semibold",
                  )}
                >
                  {LIST_LABELS[k]}
                  <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{lists[k].length}</span>
                </button>
              ))}
            </nav>
            <div>
              <h3 className="pb-2 text-[15px] font-semibold">{LIST_LABELS[listName]}</h3>
              {lists[listName].length === 0 ? (
                <p className="rounded-xl border border-dashed px-4 py-6 text-center text-muted-foreground">
                  Nothing here yet. Add the first one below.
                </p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {lists[listName].map((v) => (
                    <li key={v} className="flex items-center gap-2 py-1 pr-1 pl-4">
                      <span className="min-w-0 flex-1 truncate">{v}</span>
                      <Button variant="ghost" size="sm" disabled={busy} aria-label={`Remove ${v}`} onClick={() => removeValue(v)}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); addValue(); }}>
                <Input aria-label={`Add to ${LIST_LABELS[listName]}`} placeholder="Add another" value={newValue} onChange={(e) => setNewValue(e.target.value)} className="max-w-sm" />
                <Button type="submit" variant="outline" disabled={busy || !newValue.trim()}>Add</Button>
              </form>
              <p className="mt-3 text-[13px] text-muted-foreground">
                Removing a choice doesn't change bookings that already use it.
              </p>
            </div>
          </div>
        </Card>
      )}

      {tab === "import" && (
        <Card
          title="Import the existing spreadsheet"
          description="Bring in the bookings from 2026-2027 Instruction Classes.xlsx. You'll see a summary before anything is added, and importing the same file twice won't create duplicates."
        >
          <ol className="mb-5 list-decimal space-y-1 pl-5 text-[14px]">
            <li>Choose the spreadsheet file.</li>
            <li>Check the summary of what will come in.</li>
            <li>Select Import bookings.</li>
          </ol>
          <label htmlFor={fileId} className="text-[13px] font-medium text-muted-foreground">Spreadsheet file</label>
          <Input id={fileId} type="file" accept=".xlsx" className="mt-1.5 max-w-md" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
          {pending && (
            <div className="mt-4 rounded-xl border bg-muted/60 p-4">
              <p className="font-semibold">Ready to import {pending.bookings.length} bookings</p>
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[14px]">
                {pending.report.perTab.map((t) => <li key={t.tab}>{t.tab}: {t.rows} rows</li>)}
                {pending.report.skippedTabs.length > 0 && <li>Skipped tabs: {pending.report.skippedTabs.join(", ")}</li>}
                {pending.report.alreadyImported > 0 && <li>{pending.report.alreadyImported} already imported, skipped</li>}
                <li>{pending.report.libinsightDropped} LibInsight values dropped</li>
                <li>{pending.report.missingDetails} bookings will need a college/school and student type</li>
              </ul>
              {pending.report.flags.length > 0 && (
                <details className="mt-2 text-[14px]">
                  <summary className="cursor-pointer font-medium">{pending.report.flags.length} cells to check</summary>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {pending.report.flags.map((f, i) => (
                      <li key={i}>{f.tab} row {f.row}, {f.column}: "{f.value}" ({f.reason})</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="mt-4 flex gap-2">
                <Button disabled={busy || pending.bookings.length === 0} onClick={doImport}>Import bookings</Button>
                <Button variant="ghost" onClick={() => setPending(null)}>Cancel</Button>
              </div>
            </div>
          )}
          <p className="mt-5 text-[13px] text-muted-foreground">
            What changes on the way in: the old LibInsight column is left out, the old student count becomes actual
            attendance, and prep time is split into minutes and New or Updated.
          </p>
        </Card>
      )}

      {tab === "deleted" && (
        <Card title="Deleted bookings" description="Deleting a booking only hides it. Restore one to bring it back to every list.">
          {deleted.length === 0 ? (
            <p className="text-muted-foreground">Nothing has been deleted.</p>
          ) : (
            <ul className="divide-y">
              {deleted.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold">{b.course}</span>{" "}
                    <span className="text-muted-foreground">{[fmtDate(b.date), b.faculty && `with ${b.faculty}`, `deleted by ${b.updatedBy}`].filter(Boolean).join(", ")}</span>
                  </span>
                  <Button variant="outline" size="sm" onClick={() => restore(b)}>Restore</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      {tab === "demo" && store.mode === "demo" && (
        <Card
          title="Demo"
          description="You're trying the app with sample data that stays in this browser. Open the app in a second tab to see two people editing at once. Once SharePoint and sign-in are connected, everyone shares one database."
        >
          <div className="flex flex-wrap items-end gap-3">
            {p.demoUser && (
              <Field label="Use the demo as" htmlFor="demo-user" className="w-48">
                <Select value={p.demoUser.value} onValueChange={(v) => p.demoUser!.set(v)}>
                  <SelectTrigger id="demo-user" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {data.lists.librarian.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </Field>
            )}
            <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={resetDemoData}>Start over with fresh sample data</Button>
          </div>
        </Card>
      )}
      </div>
      {confirmDialog}
    </>
  );
}

function Card(props: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border bg-card p-6">
      <h2 className="text-[17px] font-semibold">{props.title}</h2>
      <p className="mt-1 mb-5 max-w-[75ch] text-[14px] text-muted-foreground">{props.description}</p>
      {props.children}
    </section>
  );
}
