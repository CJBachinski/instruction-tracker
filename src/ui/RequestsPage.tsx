import { useState } from "react";
import { blankBooking, type Booking, type Request } from "../model";
import BookingDialog from "./BookingDialog";
import { fmtDate, type PageProps } from "./common";

export default function RequestsPage(p: PageProps) {
  const { data, store } = p;
  const [showHandled, setShowHandled] = useState(false);
  const [accepting, setAccepting] = useState<{ req: Request; booking: Booking } | null>(null);

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
    const reason = prompt(`Reject the request for ${r.course} from ${r.facultyName}? Give a short reason:`);
    if (reason === null) return;
    try {
      await store.updateRequest({
        ...r, status: "Rejected", rejectReason: reason, handledBy: store.user, handledAt: new Date().toISOString(),
      });
      p.notify("Request rejected.");
      await p.refresh();
    } catch (e) {
      p.notify((e as Error).message, true);
    }
  }

  return (
    <>
      <h1>Requests</h1>
      <p className="sub">
        Faculty requests from the sign-up form. Accept one to turn it into a booking; it then shows up for all three librarians.
      </p>
      <label className="row" style={{ gap: 6, marginBottom: 12 }}>
        <input type="checkbox" checked={showHandled} onChange={(e) => setShowHandled(e.target.checked)} /> Show accepted and rejected requests too
      </label>
      {list.length === 0 && <div className="panel empty">No new requests.</div>}
      <div className="stack">
        {list.map((r) => {
          const dup = r.date1 ? possibleDuplicate(r, r.date1) : undefined;
          return (
            <div key={r.id} className="panel">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <h2 style={{ margin: 0 }}>{r.course} · {r.facultyName}</h2>
                  <div className="muted" style={{ fontSize: 13 }}>
                    {r.term} · submitted {r.submittedAt ? new Date(r.submittedAt).toLocaleString() : "?"}
                    {r.facultyEmail && <> · <a href={`mailto:${r.facultyEmail}`}>{r.facultyEmail}</a></>}
                  </div>
                </div>
                <span className={`status ${r.status === "New" ? "New" : r.status === "Accepted" ? "Completed" : "Wrap-up"}`}>{r.status}</span>
              </div>
              <div className="fields" style={{ marginTop: 12 }}>
                <div><div className="muted">First choice</div>{fmtDate(r.date1) || "—"} {r.time1}</div>
                <div><div className="muted">Second choice</div>{fmtDate(r.date2) || "—"} {r.time2}</div>
                <div><div className="muted">Format / location</div>{r.sessionFormat || "—"} · {r.location || "—"}</div>
                <div><div className="muted">College · students</div>{r.college || "—"} · {r.studentType || "—"} · {r.classSize ?? "?"} students</div>
                <div className="wide"><div className="muted">What they want covered</div>{r.notes || "—"}</div>
              </div>
              {dup && <div className="banner warn">A booking for {r.course} with {r.facultyName} already exists on {fmtDate(r.date1)}. Check before accepting.</div>}
              {r.status === "Rejected" && r.rejectReason && <div className="banner info">Rejected: {r.rejectReason}</div>}
              {r.status === "New" && (
                <div className="row" style={{ marginTop: 12 }}>
                  {r.date1 && <button className="btn primary" onClick={() => accept(r, 1)}>Accept first choice</button>}
                  {r.date2 && <button className="btn" onClick={() => accept(r, 2)}>Accept second choice</button>}
                  <button className="btn danger" onClick={() => reject(r)}>Reject</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {accepting && (
        <BookingDialog
          {...p}
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
    </>
  );
}
