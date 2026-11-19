# Instruction Tracker

A web app for the Trexler Library instruction team (Kathleen, Lisa, Michele) to manage library instruction sessions: requests from faculty, assigning a librarian, planning, attendance, and a dashboard with statistics.

- **Hosted on the university website.** It's a set of static files with no server to run.
- **Single sign-on** with DeSales Microsoft 365 accounts. Only the people IT assigns can get in.
- **Data in one Excel workbook on SharePoint**, read and written through Microsoft Graph. Several people can work at once, and SharePoint keeps version history.
- **Faculty requests** come from a Microsoft Form; Power Automate adds each response to the workbook's `Requests` table.

Until IT connects SharePoint and sign-in, the app runs in **demo mode**: sample data that stays in your browser, with every feature working.

## Try it (demo mode)

```bash
npm install
npm run dev
```

Open http://localhost:5173.

- Pick who you are from **I am** at the top.
- Open the app in a second tab to see two people editing at once: if both change the same field, the second save asks which value to keep.
- **Settings → Import** reads the real `2026-2027 Instruction Classes.xlsx`. In demo mode the data still stays in your browser.

## What's in it

| Screen | What it does |
|--------|--------------|
| Bookings | Every session, with tabs that follow the workflow: **New** (no librarian) → **Planning** → **Wrap-up** (date passed, attendance missing) → **Completed**, plus **Missing details**. Search, term/year picker, Excel export |
| Booking form | Term and year first, then date and the rest, grouped by stage. Notes stay editable throughout. Add to my calendar (.ics), Duplicate, Delete (restorable) |
| Requests | Faculty requests from the form. Accept the first or second choice of date to make a booking, or reject with a reason |
| Dashboard | Calendar, sessions by librarian, bookings by college/school and by student type, and totals. Filter by student type, librarian, college/school, format and session type, for a term, an academic year or a date range. Click a bar to filter. Export to Excel |
| Settings | Terms (add, close with an archive copy, reopen), dropdown lists, import of the old spreadsheet, restore deleted bookings |
| Faculty form (preview) | What faculty fill in (the real one is a Microsoft Form) |

## Going live

See [docs/SETUP.md](docs/SETUP.md). It covers uploading the workbook template to SharePoint, IT's app registration, `config.json`, hosting, and the Forms + Power Automate flow.

## Development

```bash
npm test           # logic tests (+ real-workbook import test when the file is next to this folder)
npm run build      # type-check and build to dist/
npm run template   # regenerate template/InstructionTracker-DB.xlsx
```

```
src/
  model.ts            data types, dropdown defaults, workflow status
  config.ts, auth.ts  config.json and Microsoft sign-in (MSAL)
  data/               DemoStore (browser), GraphStore (SharePoint Excel), table mappings
  logic/              terms, prep-time parser, time parser, merge, dashboard metrics, .ics
  io/                 import of the old workbook, Excel exports
  ui/                 screens
tests/                vitest
scripts/              workbook template generator
```

Never commit real library data. Test fixtures are made up, and the real workbook stays outside this folder.
