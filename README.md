# ASL & ASIL Export Collection Intelligence — CEO Dashboard
**Ambica Steels Limited (ASL Delhi) & Ambica Steels Industries Limited (ASIL Gujarat)**

An executive-grade financial intelligence and receivables monitoring web application built on Google Apps Script V8 and modern web technologies. Directly connects to the two live plant Google Sheets, providing company-wide export collection tracking, multi-currency-safe metrics, automated executive insights, and interactive drill-downs.

---

## 1. Architecture Overview

- **Source 1 (ASIL Gujarat Plant):** `https://docs.google.com/spreadsheets/d/1tt5RmBrTv_RTNxrC3fwc6CSFFJhM-5RGnaVPMI5F9OE/edit?gid=118031249#gid=118031249` (Sheet: `Total outstanding ASIL`)
- **Source 2 (ASL Delhi Plant):** `https://docs.google.com/spreadsheets/d/1NT4TWRuVsvYLal5WEnvvtNUTqfQrfXE8SGpGO2eSgh0/edit?gid=0#gid=0` (Sheet: `Total outstanding`)
- **Read-Only Ingestion:** The original source sheets are strictly read-only.
- **Dedicated Central Tracker:** All processed invoices, payment detection records, manual payment checks, and audit logs are recorded in a separate spreadsheet created automatically by `createPaymentTracker()`.
- **Company-Wide Salesperson Coverage:** The previous restriction to "Parth Gupta" has been removed from global ingestion. The application dynamically scans and loads all salespersons from both plants, while preserving Parth Gupta as a filter option.
- **Multi-Currency Safety:** Receivables in EUR, USD, INR, GBP, etc. are segregated. Currencies are never added into a misleading combined monetary total.

---

## 2. File Structure

| File | Type | Description |
|---|---|---|
| `appsscript.json` | Manifest | Configures project runtime (V8), timezone (`Asia/Kolkata`), and webapp permissions. |
| `Code.gs` | Server-side JS | Data ingestion, yellow-row payment detection, LockService concurrency guard, idempotent setup, and web app API endpoints. |
| `index.html` | HTML View | Dashboard layout, header with live status, global filter bar, 8 KPI cards, AI-style insights, Chart.js canvas grids, and 8 dedicated data tabs. |
| `styles.html` | CSS Stylesheet | Bloomberg/CFO-inspired dark navy executive palette, clean light surfaces, restrained cards, and responsive layouts. |
| `styles.css` | CSS Stylesheet | Plain CSS mirror of `styles.html` for local browser previews that do not process Apps Script template includes. Keep both stylesheets in sync when changing dashboard styles. |
| `javascript.html` | Client-side JS | Reactive state engine, dynamic multi-filter engine, multi-currency-safe arithmetic, Chart.js visual analytics, sorting, pagination, CSV export, and modals. |
| `javascript.js` | Client-side JS | Standalone mirror of `javascript.html` for local previews and the fictional GitHub Pages demo. Keep both files in sync when changing dashboard behavior. |

---

## 3. Step-by-Step Setup & Deployment

### Step 1: Open Google Apps Script
1. Visit [script.google.com](https://script.google.com).
2. Click **New Project** (or open your existing `ASL ASIL Payment Tracker` project).
3. Rename the project to: `ASL & ASIL Export Collection CEO Dashboard`.

### Step 2: Update `appsscript.json` (Project Settings)
1. In the Apps Script editor, click on **Project Settings** (gear icon on the left navigation).
2. Check the box **"Show 'appsscript.json' manifest file in editor"**.
3. Return to the **Editor** (`< >` icon) and click on `appsscript.json`.
4. Replace its contents with the provided `appsscript.json`.

### Step 3: Create / Replace Source Files
Create the following files in the Apps Script editor:
- **`Code.gs`** (Script): Paste the contents of `Code.gs`.
- **`index.html`** (HTML): Create an HTML file named `index` and paste the contents of `index.html`.
- **`styles.html`** (HTML): Create an HTML file named `styles` and paste the contents of `styles.html`.
- **`javascript.html`** (HTML): Create an HTML file named `javascript` and paste the contents of `javascript.html`.

Save all files (`Ctrl + S` or click the floppy disk icon).

For a local browser preview, open `index.html` from this project (or use VS Code Live Server). The linked `styles.css` and `javascript.js` provide styling and sample-data behavior locally; the Apps Script web app continues to use the `styles.html` and `javascript.html` template includes.

### Step 4: Authorize and Initialize Tracker
1. In the Apps Script editor toolbar, select the function **`createPaymentTracker`** from the function dropdown.
2. Click **Run**.
3. A Google authorization dialog will appear:
   - Click **Review permissions**.
   - Select your Google Workspace account.
   - Click **Advanced** > **Go to ASL & ASIL Export Collection CEO Dashboard (unsafe)**.
   - Click **Allow**.
4. Check the **Execution log**:
   - You will see: `TRACKER INITIALIZATION COMPLETE: https://docs.google.com/spreadsheets/d/...`
   - Copy this URL to inspect your central management spreadsheet.
   - Note: The function is **idempotent**; running it again will reuse the existing tracker spreadsheet and refresh triggers without duplicating files.

### Step 5: Deploy as Web Application
1. In the upper-right corner of the editor, click **Deploy** > **New deployment**.
2. Click the gear icon next to "Select type" and choose **Web app**.
3. Configure the deployment settings:
   - **Description:** `ASL ASIL Export Collection Intelligence v1.0`
   - **Execute as:** `User accessing the web app` (or `Me` if you manage central access)
   - **Who has access:** `Anyone within Ambica Steels Limited` (or your Google Workspace domain)
   - *Security Note:* Never set "Anyone" (public) for confidential internal financial dashboards.
4. Click **Deploy**.
5. Copy the generated **Web App URL**. This is the URL to share with the CEO, CFO, and Sales Directors.

---

## 4. Key Business Logic

### A. Yellow-Row Payment Detection
- Rows with yellow shading (>= 50% yellow background cells) in the plant sheets are recognized as settled payments.
- When detected during sync, they are added to `Payments Received` in the central tracker with `Payment Source = 'Source yellow'`.
- The `Payment Received Date` is recorded with the detection timestamp. The UI displays this with an explicit disclaimer noting that this is a script-detected date rather than an official bank receipt date unless verified manually.
- Yellow source rows **cannot be restored** from the dashboard; corrections must be made in the original plant spreadsheet.

### B. Manual Payment Tracking
- Invoices marked as paid from the web app or by checking `Payment Received?` in the central spreadsheet are assigned `Payment Source = 'Manually checked'`.
- These records support full **Undo / Restore** capability back to the open receivables list.

### C. Overdue Aging & Priority Buckets
- `Not Yet Due`: Days overdue < 0 (within credit term).
- `Due Today`: Days overdue == 0.
- `1–30 Days Overdue`: Days overdue between 1 and 30.
- `31–50 Days Overdue`: Days overdue between 31 and 50.
- `51–90 Days Overdue`: Days overdue between 51 and 90.
- `More Than 90 Days Overdue`: High-risk critical collection.

### D. Automated Rule-Based CEO Insights
1. **Overdue Alert:** Summarizes uncollected funds across currency boundaries.
2. **Plant Exposure:** Compares percentage share of exposure between ASL Delhi and ASIL Gujarat.
3. **Customer Concentration:** Automatically flags when any single buyer represents >20% of open receivables in a given currency.
4. **Salesperson Delinquency:** Highlights the sales representative with the highest count of overdue invoices.
5. **7-Day Inflow Pipeline:** Projects immediate maturing collections.
6. **Data Health Alerts:** Flags missing contractual terms or missing due dates.

---

## 5. Troubleshooting & Maintenance

### Changing Automatic Refresh Frequency
- In `Code.gs`, update `CONFIG.REFRESH_MINUTES` (e.g. `15`, `30`, or `60`).
- Run `installTriggers_()` from the editor toolbar to apply the updated time-based trigger.

### Partial Data Warning (One Plant Offline)
- If one plant spreadsheet URL becomes inaccessible or permissions change, the engine processes the accessible plant cleanly without crashing.
- An alert banner is displayed at the top of the executive dashboard: *"Data Notice: ASIL Gujarat error..."*.
- To retry, click **Sync All Sources Now** in the **Data Health & Refresh Log** tab.

### Inspecting Live Health
- Open **Tab 8 (Data Health & Refresh Log)** to view real-time latency, rows scanned, valid invoice counts, duplicate detection, and execution audit history.

## 6. Publish a Public Demo on GitHub Pages

The GitHub Pages site uses fictional sample invoices only. It does not connect to Apps Script or the source spreadsheets, and demo actions do not save changes.

1. Push the project to the `main` branch of a GitHub repository.
2. In GitHub, open **Settings → Pages** and set the build and deployment source to **GitHub Actions**.
3. The workflow at `.github/workflows/pages.yml` publishes the static dashboard files. After it completes, open the Pages URL shown in the repository's **Settings → Pages**.

The workflow publishes only `index.html`, `styles.css`, and `javascript.js`; it does not publish the Apps Script backend or this README. Do not change the public demo to load real financial data or expose an Apps Script deployment URL.
