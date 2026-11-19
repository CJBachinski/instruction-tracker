import { useId, useState, type ReactNode } from "react";
import { blankBooking, type Booking, type Request } from "../model";
import BookingDialog from "./BookingDialog";
import { PageHeader, fmtDate, type PageProps } from "./common";
import { useConfirm } from "./confirm";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";

export default function RequestsPage(p: PageProps) {
  const { data, store } = p;
  const [showHandled, setShowHandled] = useState(false);
  const [accepting, setAccepting] = useState<{ req: Request; booking: Booking } | null>(null);
  const [ask, confirmDialog] = useConfirm();
  const toggleId = useId();

  const list = data.requests
    .filter((r) => (showHandled ? true : r.status === "New"))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));

  const possibleDuplicate = (r: Request, date: string) =>
    data.bookings.find(
      (b) => !b.deletedAt && b.date === date && b.course.toLowerCase() === r.course.toLowerCase() &&
        b.faculty.toLowerCase() === r.facultyName.toLowerCase(),
    );

  function accept(r: Request, which: 1 | 2) {
    const b = blankBooking(store.user, r.term);
    Object.assign(b, {
      date: which === 1 ? r.date1 : r.date2,
      time: which === 1 ? r.time1 : r.time2,
      course: r.course,
      faculty: r.facultyName,
      facultyEmail: r.facultyEmail,
      college: r.college,
      studentType: r.studentType,
      classSize: r.classSize,
      sessionFormat: r.sessionFormat,
      location: r.location,
      notes: r.notes,
      source: "form",
      requestId: r.id,
    });
    setAccepting({ req: r, booking: b });
  }

  async function reject(r: Request) {
    const answer = await ask({
      title: `Reject the request for ${r.course}?`,
      description: `From ${r.facultyName}. Add a short reason so the team knows why.`,
      inputLabel: "Reason",
      confirmLabel: "Reject request",
      destructive: true,
    });
    if (!answer.ok) return;
    try {
      await store.updateRequest({
        ...r, status: "Rejected", rejectReason: answer.text, handledBy: store.user, handledAt: new Date().toISOString(),
      });
      p.notify("Request rejected.");
      await p.refresh();
    } catch (e) {
      p.notify((e as Error).message, true);
    }
  }

  return (
    <>
      <PageHeader
        title="Requests"
        description="What faculty sent through the sign-up form. Accept a request to turn it into a booking for the whole team."
      >
        <div className="flex items-center gap-2">
          <Checkbox id={toggleId} checked={showHandled} onCheckedChange={(v) => setShowHandled(v === true)} />
          <label htmlFor={toggleId} className="text-[14px]">
            Show accepted and rejected
          </label>
        </div>
      </PageHeader>

      {list.length === 0 && (
        <div className="rounded-2xl border bg-card px-6 py-16 text-center">
          <p className="text-[17px] font-semibold">No new requests</p>
          <p className="mt-1 text-muted-foreground">New form submissions show up here within about 20 seconds.</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {list.map((r) => {
          const dup = r.date1 ? possibleDuplicate(r, r.date1) : undefined;
          return (
            <article key={r.id} className="rounded-2xl border bg-card p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
                <h2 className="text-[19px] font-semibold">
                  {r.course} <span className="font-normal text-muted-foreground">with {r.facultyName}</span>
                </h2>
                <p className="text-[13px] text-muted-foreground">
                  {r.status !== "New" && <span className="font-semibold text-foreground">{r.status}. </span>}
                  Sent {r.submittedAt ? new Date(r.submittedAt).toLocaleString([], { dateStyle: "medium", timeStyle: "short" }) : "at an unknown time"}
                </p>
              </div>

              <dl className="mt-5 grid grid-cols-2 gap-x-8 gap-y-4 lg:grid-cols-4">
                <Fact label="First choice">{fmtDate(r.date1) || "No date"}{r.time1 && <Sub>{r.time1}</Sub>}</Fact>
                <Fact label="Second choice">{fmtDate(r.date2) || "None given"}{r.time2 && <Sub>{r.time2}</Sub>}</Fact>
                <Fact label="Where">{r.location || "Not given"}<Sub>{r.sessionFormat || "Format not given"}</Sub></Fact>
                <Fact label="Who">
                  {r.classSize !== null ? `${r.classSize} students` : "Class size not given"}
                  <Sub>{[r.studentType, r.college].filter(Boolean).join(", ") || "No program details"}</Sub>
                </Fact>
                <Fact label="Term">{r.term || "Not given"}</Fact>
                <Fact label="Contact">
                  {r.facultyEmail ? (
                    <a className="underline underline-offset-4" href={`mailto:${r.facultyEmail}`}>{r.facultyEmail}</a>
                  ) : (
                    "No email"
                  )}
                </Fact>
                <Fact label="What they want covered" className="col-span-2">{r.notes || "Nothing yet. Fill it in after talking with them."}</Fact>
              </dl>

              {dup && (
                <p className="mt-5 rounded-xl border bg-muted/60 px-4 py-3 text-[14px]">
                  <span className="font-semibold">Possible duplicate.</span> A booking for {r.course} with {r.facultyName} already
                  exists on {fmtDate(r.date1)}.
                </p>
              )}
              {r.status === "Rejected" && r.rejectReason && (
                <p className="mt-5 text-[14px] text-muted-foreground">Reason: {r.rejectReason}</p>
              )}

              {r.status === "New" && (
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  {r.date1 && <Button onClick={() => accept(r, 1)}>Accept first choice</Button>}
                  {r.date2 && <Button variant="outline" onClick={() => accept(r, 2)}>Accept second choice</Button>}
                  <Button variant="ghost" className="ml-auto text-destructive hover:text-destructive" onClick={() => reject(r)}>
                    Reject
                  </Button>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {accepting && (
        <BookingDialog
          {...p}
          key={accepting.booking.id}
          base={accepting.booking}
          isNew
          onClose={() => setAccepting(null)}
          onSaved={async (saved) => {
            try {
              await store.updateRequest({
                ...accepting.req, status: "Accepted", bookingId: saved.id, handledBy: store.user,
                handledAt: new Date().toISOString(),
              });
              p.notify(`Accepted. ${saved.course} is now a booking.`);
            } catch (e) {
              p.notify(`Booking saved, but the request couldn't be marked accepted: ${(e as Error).message}`, true);
            }
            setAccepting(null);
            await p.refresh();
          }}
        />
      )}
      {confirmDialog}
    </>
  );
}

function Fact(props: { label: string; className?: string; children: ReactNode }) {
  return (
    <div className={props.className}>
      <dt className="text-[13px] text-muted-foreground">{props.label}</dt>
      <dd className="mt-0.5 leading-snug">{props.children}</dd>
    </div>
  );
}

function Sub(props: { children: ReactNode }) {
  return <span className="block text-[13px] text-muted-foreground">{props.children}</span>;
}
