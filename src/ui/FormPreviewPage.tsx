import { useState } from "react";
import { newId, type Request } from "../model";
import { sortTerms } from "../logic/terms";
import { NumberField, Select, Text, type PageProps } from "./common";

const blank = (): Request => ({
  id: "",
  submittedAt: "",
  term: "",
  facultyName: "",
  facultyEmail: "",
  course: "",
  college: "",
  studentType: "",
  classSize: null,
  sessionFormat: "",
  date1: "",
  time1: "",
  date2: "",
  time2: "",
  location: "",
  notes: "",
  status: "New",
  bookingId: "",
  handledBy: "",
  handledAt: "",
  rejectReason: "",
});

/** What faculty fill in. In production this is a Microsoft Form; Power Automate adds each answer to the Requests table. */
export default function FormPreviewPage(p: PageProps) {
  const { data, store, notify } = p;
  const [r, setR] = useState<Request>(blank());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = <K extends keyof Request>(k: K, v: Request[K]) => setR((x) => ({ ...x, [k]: v }));
  const openTerms = sortTerms(data.terms).filter((t) => t.status === "Open").map((t) => t.name);

  async function submit() {
    const e: Record<string, string> = {};
    if (!r.term) e.term = "Which term?";
    if (!r.date1) e.date1 = "Pick a date";
    if (!r.course.trim()) e.course = "Required";
    if (!r.facultyName.trim()) e.facultyName = "Required";
    if (!r.facultyEmail.trim()) e.facultyEmail = "Required";
    setErrors(e);
    if (Object.keys(e).length) return;
    try {
      await store.addRequest({ ...r, id: newId(), submittedAt: new Date().toISOString() });
      notify("Request sent. It's now in the Requests queue for all three librarians.");
      setR(blank());
      await p.refresh();
    } catch (err) {
      notify((err as Error).message, true);
    }
  }

  return (
    <>
      <h1>Faculty request form (preview)</h1>
      <p className="sub">
        This is what faculty fill in. For the real thing, IT builds it as a Microsoft Form and a Power Automate flow adds each
        response to the Requests table in the SharePoint workbook (see docs/SETUP.md). Faculty never open the app itself.
      </p>
      <div className="panel" style={{ maxWidth: 860 }}>
        <h2>Request a library instruction session</h2>
        <div className="fields">
          <Select label="1. Which term and year?" required value={r.term} options={openTerms} onChange={(v) => set("term", v)} error={errors.term} />
          <Text label="2. First-choice date" required type="date" value={r.date1} onChange={(v) => set("date1", v)} error={errors.date1} />
          <Text label="First-choice time" value={r.time1} placeholder="e.g. 1-2pm" onChange={(v) => set("time1", v)} />
          <Text label="Second-choice date" type="date" value={r.date2} onChange={(v) => set("date2", v)} />
          <Text label="Second-choice time" value={r.time2} onChange={(v) => set("time2", v)} />
          <Text label="Course #" required value={r.course} onChange={(v) => set("course", v)} error={errors.course} />
          <Text label="Your name" required value={r.facultyName} onChange={(v) => set("facultyName", v)} error={errors.facultyName} />
          <Text label="Your email" required type="email" value={r.facultyEmail} onChange={(v) => set("facultyEmail", v)} error={errors.facultyEmail} />
          <Select label="College/School" value={r.college} options={data.lists.college} onChange={(v) => set("college", v)} />
          <Select label="Student type" value={r.studentType} options={data.lists.studentType} onChange={(v) => set("studentType", v)} />
          <NumberField label="How many students?" value={r.classSize} onChange={(v) => set("classSize", v)} />
          <Select label="Format" value={r.sessionFormat} options={data.lists.sessionFormat} onChange={(v) => set("sessionFormat", v)} />
          <Text label="Location / room" value={r.location} onChange={(v) => set("location", v)} />
          <label className="field wide">
            What would you like covered? (optional; the librarian can fill this in after talking with you)
            <textarea value={r.notes} onChange={(e) => set("notes", e.target.value)} />
          </label>
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={submit}>Submit request</button>
        </div>
      </div>
    </>
  );
}
