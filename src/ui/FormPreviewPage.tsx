import { useState } from "react";
import { newId, type Request } from "../model";
import { sortTerms } from "../logic/terms";
import { Field, NumberField, PageHeader, Select, Text, type PageProps } from "./common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

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
      <PageHeader
        title="Faculty request form"
        description="A preview of what faculty fill in. The live version is a Microsoft Form on the Library Instruction guide; faculty never open this app."
      />
      <div className="max-w-[760px] rounded-2xl border bg-card p-6 lg:p-8">
        <h2 className="text-[19px] font-semibold">Request a library instruction session</h2>
        <p className="mt-1 text-muted-foreground">Start with the term, then your preferred dates.</p>
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4">
          <Select label="Term and year" required value={r.term} options={openTerms} onChange={(v) => set("term", v)} error={errors.term} className="col-span-2" placeholder="Choose a term" />
          <Text label="First-choice date" required type="date" value={r.date1} onChange={(v) => set("date1", v)} error={errors.date1} />
          <Text label="First-choice time" value={r.time1} placeholder="e.g. 1-2pm" onChange={(v) => set("time1", v)} />
          <Text label="Second-choice date" type="date" value={r.date2} onChange={(v) => set("date2", v)} />
          <Text label="Second-choice time" value={r.time2} onChange={(v) => set("time2", v)} />
          <Text label="Course #" required value={r.course} onChange={(v) => set("course", v)} error={errors.course} />
          <NumberField label="How many students?" value={r.classSize} onChange={(v) => set("classSize", v)} />
          <Text label="Your name" required value={r.facultyName} onChange={(v) => set("facultyName", v)} error={errors.facultyName} />
          <Text label="Your email" required type="email" value={r.facultyEmail} onChange={(v) => set("facultyEmail", v)} error={errors.facultyEmail} />
          <Select label="College/School" value={r.college} options={data.lists.college} onChange={(v) => set("college", v)} />
          <Select label="Student type" value={r.studentType} options={data.lists.studentType} onChange={(v) => set("studentType", v)} />
          <Select label="Format" value={r.sessionFormat} options={data.lists.sessionFormat} onChange={(v) => set("sessionFormat", v)} />
          <Text label="Location or room" value={r.location} onChange={(v) => set("location", v)} />
          <Field label="What would you like covered?" htmlFor="form-notes" hint="Optional. A librarian can fill this in after talking with you." className="col-span-2">
            <Textarea id="form-notes" className="min-h-24" value={r.notes} onChange={(e) => set("notes", e.target.value)} />
          </Field>
        </div>
        <div className="mt-6">
          <Button size="lg" onClick={submit}>Send request</Button>
        </div>
      </div>
    </>
  );
}
