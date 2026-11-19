import React, { useEffect, useMemo, useRef, useState } from "react";
import { FIELD_LABELS, statusOf, type Booking, type EditableField, type Status } from "../model";
import type { Conflict } from "../logic/merge";
import { isClosed, sortTerms, termFor } from "../logic/terms";
import { buildIcs } from "../logic/ics";
import { downloadBlob } from "../io/download";
import { Field, NumberField, Select, Text, fmtDate, type PageProps } from "./common";
import { useConfirm } from "./confirm";
import { CalendarPlus, Copy, Ellipsis, Trash2 } from "lucide-react";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";

interface Props extends PageProps {
  base: Booking;
  isNew: boolean;
  onClose: () => void;
  onSaved: (saved: Booking, isNew: boolean) => void;
  onDuplicate?: (copy: Booking) => void;
}

type Choice = "mine" | "theirs";

function show(v: unknown) {
  return v === null || v === undefined || v === "" ? "(blank)" : String(v);
}

type SectionId = "request" | "triage" | "planning" | "after";

const SECTION_OF_ERROR: Record<string, SectionId> = {
  term: "request", date: "request", course: "request", faculty: "request", classSize: "request",
  prepMinutes: "planning", attendance: "after",
};

function startSections(isNew: boolean, status: Status): SectionId[] {
  if (isNew) return ["request"];
  if (status === "New") return ["triage"];
  if (status === "Planning") return ["planning"];
  return ["after"];
}

const NEXT_STEP: Record<Status, string> = {
  New: "Next: assign a librarian.",
  Planning: "Next: plan the session. Come back after it to enter attendance.",
  "Wrap-up": "Next: enter how many students attended.",
  Completed: "Completed. Attendance is recorded.",
};

/** The filled-in values of a section, as one quiet line shown while it is collapsed. */
function summary(parts: (string | number | null | false | undefined)[], empty: string) {
  const filled = parts.filter((x) => x !== null && x !== undefined && x !== false && x !== "");
  return filled.length ? filled.join(", ") : empty;
}

export default function BookingDialog(p: Props) {
  const { data, store, notify } = p;
  const [draft, setDraft] = useState<Booking>({ ...p.base });
  const [base, setBase] = useState<Booking>(p.base);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [serverCopy, setServerCopy] = useState<Booking | null>(null);
  const [deletedBy, setDeletedBy] = useState<Booking | null>(null);
  const [sections, setSections] = useState<SectionId[]>(() => startSections(p.isNew, statusOf(p.base)));
  const [ask, confirmDialog] = useConfirm();
  const bodyRef = useRef<HTMLDivElement>(null);

  // A conflict or "deleted meanwhile" notice appears at the top, so bring it into view.
  useEffect(() => {
    if (conflicts || deletedBy) bodyRef.current?.scrollTo({ top: 0 });
  }, [conflicts, deletedBy]);

  const terms = useMemo(() => sortTerms(data.terms), [data.terms]);
  const closed = isClosed(draft.term, data.terms) && !p.isNew;
  const locations = useMemo(
    () => [...new Set(data.bookings.map((b) => b.location).filter(Boolean))].sort(),
    [data.bookings],
  );
  const L = data.lists;

  const set = <K extends keyof Booking>(k: K, v: Booking[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const setDate = (date: string) => {
    setDraft((d) => {
      const auto = termFor(date, data.terms);
      return { ...d, date, term: !d.term && auto ? auto : d.term };
    });
  };

  const outsideTerm = (() => {
    if (!draft.date || !draft.term) return false;
    const t = data.terms.find((x) => x.name === draft.term);
    return !!t && !!t.start && !!t.end && (draft.date < t.start || draft.date > t.end);
  })();

  function validate(b: Booking) {
    const e: Record<string, string> = {};
    if (!b.term) e.term = "Pick the term first";
    if (!b.date) e.date = "Date is required";
    if (!b.course.trim()) e.course = "Course # is required";
    if (!b.faculty.trim()) e.faculty = "Faculty name is required";
    if (b.classSize !== null && (b.classSize < 0 || !Number.isInteger(b.classSize))) e.classSize = "Whole number, 0 or more";
    if (b.attendance !== null && (b.attendance < 0 || !Number.isInteger(b.attendance))) e.attendance = "Whole number, 0 or more";
    if (b.prepMinutes !== null && (b.prepMinutes < 0 || b.prepMinutes > 6000)) e.prepMinutes = "Prep minutes must be 0–6000";
    if (!p.isNew && isClosed(b.term, data.terms) && !isClosed(base.term, data.terms)) e.term = `${b.term} is closed`;
    if (p.isNew && isClosed(b.term, data.terms)) e.term = `${b.term} is closed. Reopen it in Settings first.`;
    return e;
  }

  async function save(next: Booking, fromBase: Booking) {
    const e = validate(next);
    setErrors(e);
    if (Object.keys(e).length) {
      const need = Object.keys(e).map((k) => SECTION_OF_ERROR[k] ?? "request");
      setSections((cur) => [...new Set([...cur, ...need])]);
      return;
    }
    if (next.attendance !== null && next.classSize !== null && next.attendance > next.classSize) {
      const answer = await ask({
        title: "Attendance is more than the class size",
        description: `Attendance is ${next.attendance} and the class size is ${next.classSize}. Save anyway?`,
        confirmLabel: "Save anyway",
      });
      if (!answer.ok) return;
    }
    setSaving(true);
    try {
      if (p.isNew) {
        const saved = await store.createBooking({ ...next, course: next.course.trim(), faculty: next.faculty.trim() });
        p.onSaved(saved, true);
        return;
      }
      const res = await store.updateBooking(fromBase, next);
      if (res.ok) {
        p.onSaved(res.saved, false);
      } else if ("deleted" in res) {
        setDeletedBy(res.current);
      } else {
        setServerCopy(res.current);
        setConflicts(res.conflicts);
        setChoices(Object.fromEntries(res.conflicts.map((c) => [c.field, "mine" as Choice])));
      }
    } catch (err) {
      notify((err as Error).message, true);
    } finally {
      setSaving(false);
    }
  }

  async function resolveConflicts() {
    if (!serverCopy || !conflicts) return;
    // Start from what's saved now, apply this person's other changes, then their per-field picks.
    const resolved: Booking = { ...serverCopy };
    for (const k of Object.keys(draft) as (keyof Booking)[]) {
      if (k === "version" || k === "rowIndex" || k === "updatedAt" || k === "updatedBy") continue;
      if ((draft[k] ?? "") !== (base[k] ?? "")) (resolved as unknown as Record<string, unknown>)[k] = draft[k];
    }
    for (const c of conflicts) {
      (resolved as unknown as Record<string, unknown>)[c.field] = choices[c.field] === "mine" ? c.mine : c.theirs;
    }
    setConflicts(null);
    setBase(serverCopy);
    setDraft(resolved);
    await save(resolved, serverCopy);
  }

  async function remove() {
    const answer = await ask({
      title: "Delete this booking?",
      description: "It is hidden from every list and can be restored from Settings.",
      confirmLabel: "Delete booking",
      destructive: true,
    });
    if (!answer.ok) return;
    await save({ ...draft, deletedAt: new Date().toISOString() }, base);
  }

  async function restoreWithChanges() {
    if (!deletedBy) return;
    const next = { ...draft, deletedAt: "" };
    setDeletedBy(null);
    setBase(deletedBy);
    await save(next, deletedBy);
  }

  function addToCalendar() {
    const ics = buildIcs(draft);
    if (!ics) {
      notify("Add a date first.", true);
      return;
    }
    downloadBlob(new Blob([ics.text], { type: "text/calendar" }), ics.filename);
    notify(
      ics.allDay
        ? "Calendar file downloaded as an all-day event (the time couldn't be read). Open it and click Save in Outlook."
        : "Calendar file downloaded. Open it and click Save in Outlook. If the booking changes later, add it again.",
    );
  }

  const status = statusOf(draft);
  const dis = closed || saving;
  const dirty = JSON.stringify(draft) !== JSON.stringify(base);

  const sectionHead = (title: string, line: string) => (
    <span className="flex min-w-0 flex-col gap-0.5 pr-4">
      <span className="text-[15px] font-semibold">{title}</span>
      <span className="truncate text-[13px] font-normal text-muted-foreground group-aria-expanded/accordion-trigger:hidden">
        {line}
      </span>
    </span>
  );

  return (
    <Sheet open onOpenChange={(o) => !o && p.onClose()}>
      <SheetContent
        className="gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[620px]"
        onInteractOutside={(e) => dirty && e.preventDefault()}
      >
        <SheetHeader className="border-b px-6 py-5 pr-12">
          <SheetTitle className="text-[20px] font-semibold">
            {p.isNew ? "New booking" : `${draft.course || "Booking"}${draft.faculty ? ` with ${draft.faculty}` : ""}`}
          </SheetTitle>
          <SheetDescription className="text-[14px]">
            {p.isNew ? (
              "Start with the term, then the date."
            ) : (
              <>
                {[fmtDate(draft.date), draft.time].filter(Boolean).join(", ")}
                <span className="mt-1 block font-medium text-foreground">
                  {status}. <span className="font-normal text-muted-foreground">{NEXT_STEP[status]}</span>
                </span>
              </>
            )}
          </SheetDescription>
        </SheetHeader>

        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6">
          {closed && (
            <Notice>
              This booking is in a closed term ({draft.term}), so it's read-only. Reopen the term in Settings to edit it.
            </Notice>
          )}
          {deletedBy && (
            <Notice title={`${deletedBy.updatedBy || "Someone"} deleted this booking while you were editing.`}>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={restoreWithChanges}>Restore it with my changes</Button>
                <Button size="sm" variant="outline" onClick={p.onClose}>Discard my changes</Button>
              </div>
            </Notice>
          )}
          {conflicts && serverCopy && (
            <Notice title={`${serverCopy.updatedBy || "Someone"} changed the same fields while you were editing.`}>
              <p className="text-muted-foreground">Pick which value to keep for each one.</p>
              <div className="mt-3 divide-y rounded-lg border bg-card">
                {conflicts.map((c) => (
                  <fieldset key={c.field} className="grid grid-cols-[7rem_1fr_1fr] items-start gap-3 px-3 py-2.5">
                    <legend className="sr-only">{FIELD_LABELS[c.field as EditableField]}</legend>
                    <span className="font-medium">{FIELD_LABELS[c.field as EditableField]}</span>
                    <label className="flex items-start gap-2">
                      <input type="radio" className="mt-1 accent-primary" name={`conflict-${c.field}`} checked={choices[c.field] === "theirs"} onChange={() => setChoices({ ...choices, [c.field]: "theirs" })} />
                      <span><span className="block text-[12px] text-muted-foreground">Their value</span>{show(c.theirs)}</span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="radio" className="mt-1 accent-primary" name={`conflict-${c.field}`} checked={choices[c.field] === "mine"} onChange={() => setChoices({ ...choices, [c.field]: "mine" })} />
                      <span><span className="block text-[12px] text-muted-foreground">Your value</span>{show(c.mine)}</span>
                    </label>
                  </fieldset>
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={resolveConflicts}>Save with these choices</Button>
                <Button size="sm" variant="outline" onClick={() => setConflicts(null)}>Back to editing</Button>
              </div>
            </Notice>
          )}

          <Accordion type="multiple" value={sections} onValueChange={(v) => setSections(v as SectionId[])}>
            <AccordionItem value="request">
              <AccordionTrigger className="py-4 hover:no-underline">
                {sectionHead(
                  "Faculty request",
                  summary([draft.term, fmtDate(draft.date), draft.time, draft.course, draft.faculty, draft.location], "Term, date, course and faculty"),
                )}
              </AccordionTrigger>
              <AccordionContent className="px-0.5 pt-1 pb-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Select label="Term" required value={draft.term} options={terms.map((t) => t.name)} onChange={(v) => set("term", v)} error={errors.term} disabled={dis} />
                  <Text label="Date" required type="date" value={draft.date} onChange={setDate} error={errors.date} disabled={dis} />
                  <Text label="Time" value={draft.time} placeholder="e.g. 1-2pm" onChange={(v) => set("time", v)} disabled={dis} />
                  <Text label="Course #" required value={draft.course} onChange={(v) => set("course", v)} error={errors.course} disabled={dis} />
                  <Text label="Faculty name" required value={draft.faculty} onChange={(v) => set("faculty", v)} error={errors.faculty} disabled={dis} />
                  <Text label="Faculty email" type="email" value={draft.facultyEmail} onChange={(v) => set("facultyEmail", v)} disabled={dis} />
                  <Select label="College/School" value={draft.college} options={L.college} onChange={(v) => set("college", v)} disabled={dis} />
                  <Select label="Student type" value={draft.studentType} options={L.studentType} onChange={(v) => set("studentType", v)} disabled={dis} />
                  <NumberField label="Students (class size)" value={draft.classSize} onChange={(v) => set("classSize", v)} error={errors.classSize} disabled={dis} />
                  <Select label="Session format" value={draft.sessionFormat} options={L.sessionFormat} onChange={(v) => set("sessionFormat", v)} disabled={dis} />
                  <Text label="Location" value={draft.location} list="locations" onChange={(v) => set("location", v)} disabled={dis} className="col-span-2" />
                </div>
                {outsideTerm && (
                  <p className="mt-3 text-[13px] font-medium">This date is outside {draft.term}'s dates. Check the term or the date.</p>
                )}
                <datalist id="locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="triage">
              <AccordionTrigger className="py-4 hover:no-underline">
                {sectionHead("Librarian", summary([draft.librarian, draft.sessionType, draft.roomStatus && `room ${draft.roomStatus.toLowerCase()}`], "No librarian assigned yet"))}
              </AccordionTrigger>
              <AccordionContent className="px-0.5 pt-1 pb-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <Select label="Librarian assigned" value={draft.librarian} options={L.librarian} onChange={(v) => set("librarian", v)} disabled={dis} placeholder="Nobody yet" />
                  <Select label="Session type" value={draft.sessionType} options={L.sessionType} onChange={(v) => set("sessionType", v)} disabled={dis} />
                  <Select label="Room reservation" value={draft.roomStatus} options={L.roomStatus} onChange={(v) => set("roomStatus", v)} disabled={dis} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="planning">
              <AccordionTrigger className="py-4 hover:no-underline">
                {sectionHead(
                  "Planning",
                  summary(
                    [
                      draft.prepMinutes !== null && `${draft.prepMinutes} min prep`,
                      draft.prepKind,
                      draft.assessment && `assessment: ${draft.assessment.toLowerCase()}`,
                      draft.notes,
                    ],
                    "Prep time, assessment and notes",
                  ),
                )}
              </AccordionTrigger>
              <AccordionContent className="px-0.5 pt-1 pb-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <NumberField
                    label="Prep time (minutes)"
                    value={draft.prepMinutes}
                    onChange={(v) => set("prepMinutes", v)}
                    error={errors.prepMinutes}
                    hint={draft.prepMinutes ? `${Math.floor(draft.prepMinutes / 60)}h ${draft.prepMinutes % 60}m` : undefined}
                    disabled={dis}
                  />
                  <Select label="Prep type" value={draft.prepKind} options={L.prepKind} onChange={(v) => set("prepKind", v)} disabled={dis} />
                  <Select label="Assessment (worksheet or exit ticket)" value={draft.assessment} options={L.yesNo} onChange={(v) => set("assessment", v)} disabled={dis} />
                  <Text label="Prep notes" value={draft.prepNote} onChange={(v) => set("prepNote", v)} disabled={dis} />
                </div>
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="after">
              <AccordionTrigger className="py-4 hover:no-underline">
                {sectionHead("After the session", draft.attendance !== null ? `${draft.attendance} attended` : "Attendance not entered")}
              </AccordionTrigger>
              <AccordionContent className="px-0.5 pt-1 pb-6">
                <div className="grid grid-cols-2 gap-x-4 gap-y-4">
                  <NumberField
                    label="Actual student attendance"
                    value={draft.attendance}
                    onChange={(v) => set("attendance", v)}
                    error={errors.attendance}
                    hint={draft.classSize !== null ? `Class size: ${draft.classSize}` : undefined}
                    disabled={dis}
                  />
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>

          <div className="border-t py-5">
            <Field label="Notes" htmlFor="booking-notes" hint="Editable at every stage.">
              <Textarea id="booking-notes" className="min-h-24 bg-card" value={draft.notes} disabled={dis} onChange={(e) => set("notes", e.target.value)} />
            </Field>
          </div>

          {!p.isNew && (
            <p className="pb-6 text-[12px] text-muted-foreground">
              Created by {draft.createdBy || "unknown"}. Last updated by {draft.updatedBy || "unknown"}
              {draft.updatedAt ? ` on ${new Date(draft.updatedAt).toLocaleString()}` : ""}. Version {draft.version}.
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 border-t bg-card px-6 py-4">
          {!conflicts && (
            <Button disabled={dis} onClick={() => save(draft, base)}>
              {saving ? "Saving" : p.isNew ? "Add booking" : "Save changes"}
            </Button>
          )}
          <Button variant="ghost" onClick={p.onClose}>
            Cancel
          </Button>
          <span className="flex-1" />
          {!p.isNew && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline">
                  <Ellipsis /> More
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-52">
                <DropdownMenuItem onSelect={addToCalendar}>
                  <CalendarPlus /> Add to my calendar
                </DropdownMenuItem>
                {p.onDuplicate && (
                  <DropdownMenuItem onSelect={() => p.onDuplicate!(draft)}>
                    <Copy /> Duplicate
                  </DropdownMenuItem>
                )}
                {!closed && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={remove}>
                      <Trash2 /> Delete
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {confirmDialog}
      </SheetContent>
    </Sheet>
  );
}

function Notice(props: { title?: string; children: React.ReactNode }) {
  return (
    <div role="status" className="mt-5 rounded-xl border bg-muted/60 px-4 py-3.5 text-[14px]">
      {props.title && <p className="font-semibold">{props.title}</p>}
      {props.children}
    </div>
  );
}
