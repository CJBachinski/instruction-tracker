import { useState } from "react";
import { LIST_LABELS, type Booking, type ListName, type Lists, type Term } from "../model";
import { overlappingTerm, sortTerms } from "../logic/terms";
import { readLegacyWorkbook, type ImportReport } from "../io/importWorkbook";
import { buildExport } from "../io/exportWorkbook";
import { resetDemo } from "../data/demoStore";
import { fmtDate, type PageProps } from "./common";

interface Props extends PageProps {
  demoUser?: { value: string; set: (v: string) => void };
}

export default function SettingsPage(p: Props) {
  const { data, store, notify } = p;
  const [terms, setTerms] = useState<Term[]>(() => sortTerms(data.terms).map((t) => ({ ...t })));
  const [listText, setListText] = useState<Record<ListName, string>>(
    () => Object.fromEntries(Object.entries(data.lists).map(([k, v]) => [k, v.join("\n")])) as Record<ListName, string>,
  );
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{ bookings: Booking[]; report: ImportReport } | null>(null);

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
    if (!confirm(`Close ${t.name}? Its ${count} bookings become read-only, and an archive copy is saved.`)) return;
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
    if (!confirm(`Reopen ${terms[i].name}? Its bookings become editable again.`)) return;
    const next = terms.map((x, j) => (j === i ? { ...x, status: "Open" as const } : x));
    setTerms(next);
    await saveTerms(next);
  }

  async function saveLists() {
    const lists = Object.fromEntries(
      Object.entries(listText).map(([k, v]) => [k, v.split("\n").map((s) => s.trim()).filter(Boolean)]),
    ) as Lists;
    setBusy(true);
    try {
      await store.saveLists(lists);
      notify("Dropdown lists saved.");
      await p.refresh();
    } catch (e) {
      notify((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  }

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

  return (
    <>
      <h1>Settings</h1>
      <p className="sub">Terms, dropdown lists, importing the old spreadsheet, and restoring deleted bookings.</p>
      <div className="stack">
        <div className="panel">
          <h2>Terms</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Every term lives in the same database. Add the next term when it's scheduled; close a term when it's finished.
            Closing saves an archive copy and makes its bookings read-only. Dates here are placeholders until confirmed.
          </p>
          <div className="tablewrap">
            <table className="data">
              <thead>
                <tr><th>Term</th><th>Academic year</th><th>Start</th><th>End</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {terms.map((t, i) => (
                  <tr key={i} style={{ cursor: "default" }}>
                    <td><input type="text" value={t.name} aria-label="Term name" disabled={t.status === "Closed"} onChange={(e) => editTerm(i, { name: e.target.value })} style={{ width: 120 }} /></td>
                    <td><input type="text" value={t.academicYear} aria-label="Academic year" placeholder="2026-2027" onChange={(e) => editTerm(i, { academicYear: e.target.value })} style={{ width: 120 }} /></td>
                    <td><input type="date" value={t.start} aria-label="Start date" onChange={(e) => editTerm(i, { start: e.target.value })} /></td>
                    <td><input type="date" value={t.end} aria-label="End date" onChange={(e) => editTerm(i, { end: e.target.value })} /></td>
                    <td>{t.status}</td>
                    <td>
                      {t.status === "Open" ? (
                        <button className="btn small" disabled={busy || !data.terms.some((x) => x.name === t.name)} onClick={() => closeTerm(i)}>Close term</button>
                      ) : (
                        <button className="btn small" disabled={busy} onClick={() => reopenTerm(i)}>Reopen</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn" onClick={() => setTerms([...terms, { name: "", academicYear: "", start: "", end: "", status: "Open" }])}>+ Add term</button>
            <button className="btn primary" disabled={busy} onClick={() => saveTerms()}>Save terms</button>
          </div>
        </div>

        <div className="panel">
          <h2>Dropdown lists</h2>
          <p className="muted" style={{ marginTop: 0 }}>One value per line. Colleges/schools starts empty until Kathleen supplies the official list.</p>
          <div className="fields">
            {(Object.keys(LIST_LABELS) as ListName[]).map((k) => (
              <label key={k} className="field">
                {LIST_LABELS[k]}
                <textarea value={listText[k] ?? ""} rows={6} onChange={(e) => setListText({ ...listText, [k]: e.target.value })} />
              </label>
            ))}
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn primary" disabled={busy} onClick={saveLists}>Save lists</button>
          </div>
        </div>

        <div className="panel">
          <h2>Import the existing spreadsheet</h2>
          <p className="muted" style={{ marginTop: 0 }}>
            Pick “2026-2027 Instruction Classes.xlsx”. The FALL/WINTER/SPRING/SUMMER tabs come in; the old LibInsight column is
            dropped, old “# Students” goes to Actual Student Attendance, and Prep Time is split into minutes and New/Updated.
            Importing the same file twice skips rows already imported.
          </p>
          <input type="file" accept=".xlsx" onChange={(e) => e.target.files?.[0] && pickFile(e.target.files[0])} />
          {pending && (
            <div className="banner info" style={{ marginTop: 12 }}>
              <b>Ready to import {pending.bookings.length} bookings.</b>
              <ul style={{ margin: "6px 0" }}>
                {pending.report.perTab.map((t) => <li key={t.tab}>{t.tab}: {t.rows} rows</li>)}
                {pending.report.skippedTabs.length > 0 && <li>Skipped tabs: {pending.report.skippedTabs.join(", ")}</li>}
                {pending.report.alreadyImported > 0 && <li>{pending.report.alreadyImported} already imported (skipped)</li>}
                <li>{pending.report.libinsightDropped} LibInsight values dropped</li>
                <li>{pending.report.missingDetails} bookings need a college/school and student type (see Missing details)</li>
              </ul>
              {pending.report.flags.length > 0 && (
                <details>
                  <summary>{pending.report.flags.length} cells to check</summary>
                  <ul>
                    {pending.report.flags.map((f, i) => (
                      <li key={i}>{f.tab} row {f.row}, {f.column}: “{f.value}” ({f.reason})</li>
                    ))}
                  </ul>
                </details>
              )}
              <div className="row" style={{ marginTop: 8 }}>
                <button className="btn primary" disabled={busy || pending.bookings.length === 0} onClick={doImport}>Import</button>
                <button className="btn" onClick={() => setPending(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="panel">
          <h2>Deleted bookings</h2>
          {deleted.length === 0 ? (
            <div className="muted">Nothing deleted.</div>
          ) : (
            deleted.map((b) => (
              <div key={b.id} className="row" style={{ padding: "6px 0", borderBottom: "1px solid var(--soft)" }}>
                <b>{b.course}</b> <span>{fmtDate(b.date)}</span> <span className="muted">{b.faculty} · deleted by {b.updatedBy}</span>
                <span className="spacer" />
                <button className="btn small" onClick={() => restore(b)}>Restore</button>
              </div>
            ))
          )}
        </div>

        {store.mode === "demo" && (
          <div className="panel">
            <h2>Demo mode</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Data is kept in this browser only. Open the app in a second tab to see two people editing at once.
              Once IT connects SharePoint and sign-in, everyone shares one database.
            </p>
            {p.demoUser && (
              <label className="field" style={{ maxWidth: 240 }}>
                I am
                <select value={p.demoUser.value} onChange={(e) => p.demoUser!.set(e.target.value)}>
                  {data.lists.librarian.map((l) => <option key={l}>{l}</option>)}
                </select>
              </label>
            )}
            <div className="row" style={{ marginTop: 12 }}>
              <button
                className="btn danger"
                onClick={async () => {
                  if (!confirm("Reset the demo? This replaces everything in this browser with fresh sample data.")) return;
                  resetDemo();
                  await p.refresh();
                  location.reload();
                }}
              >
                Reset demo data
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
