import { useMemo, useState } from "react";
import { FIELD_LABELS, statusOf, type Booking, type EditableField } from "../model";
import type { Conflict } from "../logic/merge";
import { isClosed, sortTerms, termFor } from "../logic/terms";
import { buildIcs } from "../logic/ics";
import { downloadBlob } from "../io/download";
import { NumberField, Select, Text, fmtDate, type PageProps } from "./common";

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
    if (Object.keys(e).length) return;
    if (
      next.attendance !== null &&
      next.classSize !== null &&
      next.attendance > next.classSize &&
      !confirm(`Attendance (${next.attendance}) is more than the class size (${next.classSize}). Save anyway?`)
    )
      return;
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
    if (!confirm("Delete this booking? It is hidden, and can be restored from Settings.")) return;
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

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-label="Booking">
      <div className="dialog">
        <header>
          <h2 style={{ margin: 0 }}>{p.isNew ? "New booking" : `${draft.course || "Booking"} · ${fmtDate(draft.date)}`}</h2>
          {!p.isNew && <span className={`status ${status}`}>{status}</span>}
          <span className="spacer" />
          <button className="btn small" onClick={p.onClose} aria-label="Close">
            Close
          </button>
        </header>

        {closed && <div className="banner info">This booking is in a closed term ({draft.term}), so it's read-only. Reopen the term in Settings to edit it.</div>}
        {deletedBy && (
          <div className="banner warn">
            {deletedBy.updatedBy || "Someone"} deleted this booking while you were editing.
            <div className="row" style={{ marginTop: 8 }}>
              <button className="btn small primary" onClick={restoreWithChanges}>Restore it with my changes</button>
              <button className="btn small" onClick={p.onClose}>Discard my changes</button>
            </div>
          </div>
        )}
        {conflicts && serverCopy && (
          <div className="banner warn">
            <b>{serverCopy.updatedBy || "Someone"} changed the same fields while you were editing.</b> Pick which value to keep for each one.
            <table className="conflict">
              <thead>
                <tr><th>Field</th><th>Their value</th><th>Your value</th></tr>
              </thead>
              <tbody>
                {conflicts.map((c) => (
                  <tr key={c.field}>
                    <td>{FIELD_LABELS[c.field as EditableField]}</td>
                    <td>
                      <label><input type="radio" checked={choices[c.field] === "theirs"} onChange={() => setChoices({ ...choices, [c.field]: "theirs" })} /> {show(c.theirs)}</label>
                    </td>
                    <td>
                      <label><input type="radio" checked={choices[c.field] === "mine"} onChange={() => setChoices({ ...choices, [c.field]: "mine" })} /> {show(c.mine)}</label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="row">
              <button className="btn small primary" onClick={resolveConflicts}>Save with these choices</button>
              <button className="btn small" onClick={() => setConflicts(null)}>Back to editing</button>
            </div>
          </div>
        )}

        <section>
          <h3>1. Faculty request <small>term and year first, then the date</small></h3>
          <div className="fields">
            <Select label="Term" required value={draft.term} options={terms.map((t) => t.name)} onChange={(v) => set("term", v)} error={errors.term} disabled={dis} />
            <Text label="Date" required type="date" value={draft.date} onChange={setDate} error={errors.date} disabled={dis} />
            <Text label="Time" value={draft.time} placeholder="e.g. 1-2pm" onChange={(v) => set("time", v)} disabled={dis} />
            <Text label="Course #" required value={draft.course} onChange={(v) => set("course", v)} error={errors.course} disabled={dis} />
            <Text label="Faculty Name" required value={draft.faculty} onChange={(v) => set("faculty", v)} error={errors.faculty} disabled={dis} />
            <Text label="Faculty Email" type="email" value={draft.facultyEmail} onChange={(v) => set("facultyEmail", v)} disabled={dis} />
            <Select label="College/School" value={draft.college} options={L.college} onChange={(v) => set("college", v)} disabled={dis} />
            <Select label="Student Type" value={draft.studentType} options={L.studentType} onChange={(v) => set("studentType", v)} disabled={dis} />
            <NumberField label="# Students (class size)" value={draft.classSize} onChange={(v) => set("classSize", v)} error={errors.classSize} disabled={dis} />
            <Select label="Session Format" value={draft.sessionFormat} options={L.sessionFormat} onChange={(v) => set("sessionFormat", v)} disabled={dis} />
            <Text label="Location" value={draft.location} list="locations" onChange={(v) => set("location", v)} disabled={dis} />
          </div>
          {outsideTerm && <div className="banner warn">This date is outside {draft.term}'s dates. Check the term or the date.</div>}
          <datalist id="locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        </section>

        <section>
          <h3>2. Librarian triage</h3>
          <div className="fields">
            <Select label="Librarian Assigned" value={draft.librarian} options={L.librarian} onChange={(v) => set("librarian", v)} disabled={dis} />
            <Select label="Session Type" value={draft.sessionType} options={L.sessionType} onChange={(v) => set("sessionType", v)} disabled={dis} />
            <Select label="Room Reservation Status" value={draft.roomStatus} options={L.roomStatus} onChange={(v) => set("roomStatus", v)} disabled={dis} />
          </div>
        </section>

        <section>
          <h3>3. Planning</h3>
          <div className="fields">
            <Select label="Assessment (worksheet / exit ticket)" value={draft.assessment} options={L.yesNo} onChange={(v) => set("assessment", v)} disabled={dis} />
            <NumberField
              label="Prep Time (minutes)"
              value={draft.prepMinutes}
              onChange={(v) => set("prepMinutes", v)}
              error={errors.prepMinutes}
              hint={draft.prepMinutes ? `${Math.floor(draft.prepMinutes / 60)}h ${draft.prepMinutes % 60}m` : undefined}
              disabled={dis}
            />
            <Select label="Prep Type" value={draft.prepKind} options={L.prepKind} onChange={(v) => set("prepKind", v)} disabled={dis} />
            <Text label="Prep Notes" value={draft.prepNote} onChange={(v) => set("prepNote", v)} disabled={dis} />
            <label className="field wide">
              Notes (editable at every stage)
              <textarea value={draft.notes} disabled={dis} onChange={(e) => set("notes", e.target.value)} />
            </label>
          </div>
        </section>

        <section>
          <h3>4. After the session</h3>
          <div className="fields">
            <NumberField label="Actual Student Attendance" value={draft.attendance} onChange={(v) => set("attendance", v)} error={errors.attendance} disabled={dis} />
          </div>
        </section>

        <footer>
          <button className="btn primary" disabled={dis || !!conflicts} onClick={() => save(draft, base)}>
            {saving ? "Saving…" : "Save"}
          </button>
          <button className="btn" onClick={p.onClose}>Cancel</button>
          {!p.isNew && (
            <>
              <button className="btn" onClick={addToCalendar}>Add to my calendar</button>
              {p.onDuplicate && (
                <button className="btn" onClick={() => p.onDuplicate!(draft)}>Duplicate</button>
              )}
              <span className="spacer" />
              {!closed && <button className="btn danger" onClick={remove}>Delete</button>}
            </>
          )}
          {!p.isNew && (
            <div className="muted" style={{ width: "100%", fontSize: 12 }}>
              Created by {draft.createdBy || "?"} · Last updated by {draft.updatedBy || "?"}{" "}
              {draft.updatedAt ? new Date(draft.updatedAt).toLocaleString() : ""} · version {draft.version}
            </div>
          )}
        </footer>
      </div>
    </div>
  );
}
