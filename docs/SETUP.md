# Setting up Instruction Tracker at DeSales

This guide is for DeSales IT and the library. It takes the app from **demo mode**, where data stays in one browser, to **live**: hosted on the university website, signed in with DeSales Microsoft 365 accounts, and sharing one Excel workbook on SharePoint.

Allow about an hour, plus however long IT approvals take.

## What gets set up

```
Faculty ──► Microsoft Form (embedded on the Library Instruction LibGuide)
                │  Power Automate: "add a row" for each response
                ▼
     SharePoint: InstructionTracker-DB.xlsx  ◄──►  Instruction Tracker web app
       tables: Bookings · Requests ·               (static files on the university website,
               Terms · Lists · AuditLog             Microsoft single sign-on, 3 librarians)
```

There is no server or database to run. The app is plain HTML/JavaScript files. It reads and writes the workbook through Microsoft Graph, using the signed-in librarian's own access.

## 1. Put the workbook on SharePoint

1. Choose a SharePoint site the library already uses (for example, a Library staff site).
2. In that site's **Documents** library, create a folder named `InstructionTracker`.
3. Upload `template/InstructionTracker-DB.xlsx` into it. If it's missing, run `npm run template` to regenerate it.
4. Share the folder with **Edit** access for Kathleen, Lisa and Michele only.
5. Write down two things for step 3:
   - The **site URL**, e.g. `https://desales.sharepoint.com/sites/LibraryStaff`
   - The **file path inside Documents**, e.g. `InstructionTracker/InstructionTracker-DB.xlsx`

Rules for the workbook:
- **Keep the sheet names, table names and column headers.** The app finds data by table name (`Bookings`, `Requests`, `Terms`, `Lists`, `AuditLog`) and by header text.
- **Opening it in Excel is fine.** Excel Online lets several people work in it at once, and SharePoint keeps version history, so any change can be rolled back.
- **Don't delete rows in Excel.** The app hides deleted bookings instead of removing them.

## 2. Register the app (Microsoft Entra ID, IT)

1. Go to **Entra admin center → App registrations → New registration**.
   - Name: `Instruction Tracker`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI: platform **Single-page application (SPA)**, set to the exact URL where the app will be hosted, e.g. `https://www.desales.edu/library/instruction-tracker/`
2. Under **API permissions → Add → Microsoft Graph → Delegated**, add:
   - `User.Read`
   - `Sites.ReadWrite.All`
3. Click **Grant admin consent**.
   - These are delegated permissions: the app can only reach files the signed-in person can already open.
   - If IT prefers a narrower grant, use `Sites.Selected` and grant this app write access to just the one site.
4. **Limit who can sign in:** go to **Enterprise applications → Instruction Tracker → Properties** and set **Assignment required** to **Yes**. Then under **Users and groups**, add Kathleen, Lisa and Michele.
5. Copy the **Directory (tenant) ID** and the **Application (client) ID** from the app's Overview page.

## 3. Fill in `config.json`

`config.json` sits next to `index.html` and is read each time the app loads, so changing settings needs no rebuild.

```json
{
  "mode": "sharepoint",
  "appTitle": "Instruction Tracker",
  "auth": {
    "tenantId": "<Directory (tenant) ID>",
    "clientId": "<Application (client) ID>",
    "redirectUri": "https://www.desales.edu/library/instruction-tracker/"
  },
  "sharepoint": {
    "siteUrl": "https://desales.sharepoint.com/sites/LibraryStaff",
    "filePath": "InstructionTracker/InstructionTracker-DB.xlsx"
  },
  "allowedUsers": ["librarian@example.edu"],
  "refreshSeconds": 20,
  "showFormPreview": false
}
```

- `allowedUsers` is optional, as an extra check inside the app. The real gate is "Assignment required" in step 2.
- `refreshSeconds` sets how often each screen checks for other people's changes. 20 seconds keeps Microsoft Graph traffic low.

## 4. Build and host

You need Node.js 20 or later.

```bash
npm ci
npm run build
```

Copy everything in `dist/` to the web folder that matches the redirect URI. That's `index.html`, `config.json` and `assets/`. It must be served over HTTPS. Then put a link or icon to that URL wherever the three librarians will look for it, for example the library staff page.

## 5. The faculty request form (Microsoft Forms + Power Automate)

Faculty never open the app. They fill in a form, and each response becomes a row in the `Requests` table.

1. **Microsoft Forms**: create a form with these questions, in this order. Term comes first.

   | # | Question | Type |
   |---|----------|------|
   | 1 | Which term and year? | Choice: Fall 26, Winter 26, Spring 27, Summer 27 (keep in step with the app's Terms) |
   | 2 | First-choice date | Date |
   | 3 | First-choice time | Text |
   | 4 | Second-choice date | Date (optional) |
   | 5 | Second-choice time | Text (optional) |
   | 6 | Course # | Text |
   | 7 | Your name | Text |
   | 8 | Your email | Text (or turn on "Record name" for DeSales accounts) |
   | 9 | College/School | Choice |
   | 10 | Student type | Choice: Undergraduate, Graduate, Adult Studies |
   | 11 | How many students? | Number |
   | 12 | Format | Choice: Face to face, Synchronous, Asynchronous |
   | 13 | Location / room | Text |
   | 14 | What would you like covered? | Long text (optional) |

2. **Power Automate**: create an automated cloud flow.
   - Trigger: **Microsoft Forms → When a new response is submitted** (pick the form).
   - **Microsoft Forms → Get response details** (same form, Response Id from the trigger).
   - **Excel Online (Business) → Add a row into a table**:
     - Location: the SharePoint site. Document library: Documents. File: `InstructionTracker/InstructionTracker-DB.xlsx`. Table: `Requests`.
     - Map the columns: `Request ID` = Response Id, `Submitted At` = Submission time, `Status` = `New`. Map each question to the column with the same name (`Term`, `Preferred Date 1`, `Preferred Time 1`, `Course #`, `Faculty Name`, `Faculty Email`, …).
3. **Embed the form** on the Library Instruction LibGuide: in Forms, choose **Collect responses → Embed** and paste the code into a LibGuides media/widget box.

New requests show up on each librarian's **Requests** tab within about 20 seconds. Accepting one turns it into a booking, pre-filled from the form.

## 6. Bring in this year's spreadsheet

Sign in, go to **Settings → Import the existing spreadsheet**, and pick `2026-2027 Instruction Classes.xlsx`. The app shows what it will import, and you confirm. Running it a second time skips rows that are already in.

## 7. Check it works

- [ ] All three librarians can sign in. Someone not on the list is refused at the Microsoft sign-in page.
- [ ] A booking saved on one PC shows up on the others within `refreshSeconds`.
- [ ] Two people editing different fields of the same booking: both changes are kept.
- [ ] Two people editing the same field: the second one gets the "pick which value to keep" box.
- [ ] A test form submission appears under Requests, and accepting it creates a booking.
- [ ] Export to Excel downloads a file with Term Field in column A.
- [ ] Settings → Close term saves `archive/<TERM>.xlsx` next to the workbook.

## Troubleshooting

| What you see | Likely cause |
|--------------|--------------|
| "Almost ready" screen listing settings | `config.json` is in SharePoint mode but a value is blank |
| Sign-in loops or "redirect URI mismatch" | The hosted URL doesn't exactly match the SPA redirect URI (check the trailing slash) |
| "SharePoint request failed (403…)" | The person doesn't have Edit access to the workbook folder, or admin consent wasn't granted |
| "SharePoint request failed (404…)" | `siteUrl` or `filePath` is wrong, or a table was renamed |
| Times like "1-2" turned into dates | Someone retyped a cell in Excel; the template formats columns as text, so keep that formatting |
