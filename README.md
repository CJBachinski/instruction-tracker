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

- Pick who you are from the user menu at the bottom of the sidebar.
- Open the app in a second tab to see two people editing at once: if both change the same field, the second save asks which value to keep.
- **Settings → Import** reads the real `2026-2027 Instruction Classes.xlsx`. In demo mode the data still stays in your browser.

## What's in it

| Screen | What it does |
|--------|--------------|
| Sidebar | Navigation with a count of bookings that need attention and of new requests. The user menu at the bottom shows who you are and, in demo mode, lets you switch librarian |
| Bookings | Opens on **To do**: bookings that need a librarian (assign in two clicks), sessions that need attendance entered (from the row), and sessions coming up in the next 14 days. Other tabs follow the workflow: **New** → **Planning** → **Wrap-up** → **Completed**, plus **Missing details** and **All**, with a term/year picker, sort, search and Excel export |
| Booking sheet | Opens from the side. The header names the stage and the next step. Four sections (Faculty request, Librarian, Planning, After the session) collapse to a one-line summary, and the one for the current stage starts open. Term and year come first. Notes stay visible and editable throughout. The More menu has Add to my calendar (.ics), Duplicate and Delete (restorable) |
| Requests | Faculty requests from the form, one card each. Accept the first or second choice of date to make a booking, or reject with a reason |
| Dashboard | A compact filter bar (period, student type, librarian, college/school, format, session type, Reset), then a month calendar with each booking in its librarian's color, and sessions by librarian, college/school and student type. Click a bar to filter. Totals for the period sit at the bottom. Export to Excel |
| Settings | One tab per job: **Terms** (add, edit dates, close with an archive copy, reopen), **Dropdown choices** (add or remove options; saves right away), **Import spreadsheet**, **Deleted bookings** (restore) and **Demo** |
| Faculty form preview | What faculty fill in (the real one is a Microsoft Form) |

The interface uses [shadcn/ui](https://ui.shadcn.com) components on Tailwind CSS v4, with the system font and a neutral palette: one blue accent marks the main action on each screen. The dashboard is the one exception: each librarian has their own color in the calendar and the librarian chart.

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
  components/ui/      shadcn/ui components (added with `npx shadcn add`)
  index.css           Tailwind import and the theme colors
tests/                vitest
scripts/              workbook template generator
```

Never commit real library data. Test fixtures are made up, and the real workbook stays outside this folder.
