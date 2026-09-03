# NIBM ACA Timetable Exporter (Chrome Extension - Manifest V3)

> A production-ready, privacy-first Google Chrome extension designed for students of the **National Institute of Business Management (NIBM)**. Easily extract your timetable and lecture schedules directly from the official **ACA Academic Calendar** (`https://aca.mynibm.com/`) and export them into clean, Excel-compatible CSV files.

---

## Table of Contents
1. [Key Features](#key-features)
2. [Strict Privacy & Zero-Knowledge Security Model](#strict-privacy--zero-knowledge-security-model)
3. [Architecture & Project Structure](#architecture--project-structure)
4. [Installation Guide](#installation-guide)
5. [How to Use](#how-to-use)
6. [Supported Timetable Views](#supported-timetable-views)
7. [How the Scraper Engine Works](#how-the-scraper-engine-works)
8. [CSV Generation & Excel Compatibility](#csv-generation--excel-compatibility)
9. [Developer Debug Mode & Diagnostics](#developer-debug-mode--diagnostics)
10. [Updating Selectors if ACA Website Changes](#updating-selectors-if-aca-website-changes)
11. [Troubleshooting & FAQ](#troubleshooting--faq)
12. [Verification & Testing](#verification--testing)

---

## Key Features

- 📅 **Multi-View DOM Scraping**: Seamlessly extracts timetable entries from **Month View**, **Week View**, and **Day/Agenda View**.
- 🛡️ **Defensive Multi-Layer Extraction**: Uses semantic HTML tags, ARIA roles, data attributes, and regex heuristics so the scraper does not break if Tailwind or CSS class names change.
- ⚡ **Safe Interception Fallback**: Client-side read-only listener for lecture API payloads (`lectures?startAt=...`) with zero authentication header or credential exposure.
- 🎓 **Automatic NIBM Metadata Detection**: Automatically recognizes active batch (e.g. `DSE241FT`, `DSE262FT`), active view mode, and period (e.g. `September 2026`).
- 🏷️ **Comprehensive Event Classification**:
  - `LP` ➔ Lecture (Physical)
  - `LO` ➔ Lecture (Online)
  - `TU` ➔ Tutorial
  - `LB` ➔ Lab
  - `SM` ➔ Seminar
  - `WS` ➔ Workshop
  - `EX` ➔ Exam
  - `VV` ➔ Viva
  - `PR` ➔ Presentation
  - `CW` ➔ Course Work
  - `PC` ➔ Practical
- 🔄 **Intelligent Deduplication**: Resolves duplicate DOM elements (e.g., responsive cards, overlapping cell renders) and merges richer metadata.
- 📊 **Interactive Preview & Filtering**: Live search by course/lecturer/room, date range filtering (`From` / `To`), and event type dropdowns.
- 📑 **Excel-Ready RFC 4180 CSV**: Prepends UTF-8 Byte Order Mark (`\uFEFF`), uses Windows CRLF (`\r\n`) line terminators, properly escapes quotes and commas, and preserves full Sinhala (`සිංහල`) and English Unicode characters.
- 🎨 **Academic UI Theme**: Tailored with NIBM's professional Navy Blue aesthetic, status badges, metrics breakdown, and column configuration.

---

## Strict Privacy & Zero-Knowledge Security Model

This extension is built under strict zero-knowledge and privacy principles:

1. **No Login or OTP Bypass**: The extension never alters the login or authentication flow. Students must log in normally on `https://aca.mynibm.com/` using their own credentials.
2. **Zero Credential Access**: The extension does **NOT** read, store, or transmit passwords, OTPs, session cookies, Bearer tokens, or Authorization headers.
3. **100% Local Processing**: All parsing, normalization, filtering, and CSV file creation occur locally inside your browser process.
4. **No External Network Requests**: Absolutely no external servers, third-party CDNs, analytics, tracking, telemetry, or advertising.
5. **Least-Privilege Scoped Permissions**:
   - `activeTab` & `scripting`: Scrapes the active timetable tab only when user opens the extension.
   - `storage`: Saves user column and filter preferences locally in Chrome storage.
   - Host permissions: Restricted strictly to `https://aca.mynibm.com/*`.

---

## Architecture & Project Structure

```
web scraper/
├── manifest.json                  # Manifest V3 specification
├── package.json                   # Build scripts & dependencies
├── tsconfig.json                  # TypeScript compiler settings
├── README.md                      # Documentation
│
├── icons/                         # Extension icons (16, 32, 48, 128 px)
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
│
├── src/
│   ├── types/
│   │   └── timetable.ts           # Core interfaces, schema, type registries
│   │
│   ├── content/
│   │   ├── content.ts             # Content script coordinator & SPA MutationObserver
│   │   ├── dom-scraper.ts         # Multi-layered DOM calendar extractor
│   │   ├── calendar-parser.ts     # Date boundary handling & event card heuristics
│   │   ├── normalizer.ts          # Type mapping, deduplication & fingerprinting
│   │   ├── api-interceptor.ts     # Content script listener for intercepted JSON
│   │   └── page-interceptor.ts    # Read-only page-context JSON wrapper
│   │
│   ├── background/
│   │   └── service-worker.ts      # MV3 Service Worker & extension badge updater
│   │
│   ├── export/
│   │   └── csv-exporter.ts        # RFC 4180 CSV builder, UTF-8 BOM, local download
│   │
│   ├── storage/
│   │   └── storage.ts             # chrome.storage.local wrapper
│   │
│   └── popup/
│       ├── popup.html             # NIBM-themed popup UI
│       ├── popup.css              # Academic styling, metrics grid & preview table
│       └── popup.ts               # State coordinator, filtering, search & export
│
├── scripts/
│   ├── build.js                   # Production bundle compiler (esbuild)
│   └── generate-icons.js          # Pure Node.js PNG icon generator
│
├── tests/
│   ├── normalizer.test.ts         # Type mapping & deduplication unit tests
│   ├── csv-exporter.test.ts       # CSV escaping, BOM, CRLF & Unicode tests
│   ├── calendar-parser.test.ts    # Date handling & month boundary tests
│   └── dom-scraper.test.ts        # DOM grid scraping simulation test
│
└── dist/                          # Production unpacked extension directory
    ├── manifest.json
    ├── icons/
    ├── content/
    │   ├── content.js
    │   └── page-interceptor.js
    ├── background/
    │   └── service-worker.js
    └── popup/
        ├── popup.html
        ├── popup.js
        └── popup.css
```

---

## Installation Guide

### Step 1: Build the Extension
Ensure you have **Node.js** (v18 or higher) installed:

```bash
# In the project directory:
npm install
npm run build
```

This compiles TypeScript into `dist/` and generates all required assets.

### Step 2: Load Unpacked Extension into Chrome
1. Open Google Chrome.
2. In the URL bar, navigate to:
   ```
   chrome://extensions
   ```
3. In the top right corner, switch on **Developer mode**.
4. In the top left toolbar, click the **Load unpacked** button.
5. In the file dialog, navigate to your project directory and select the **`dist`** folder:
   ```
   c:\em\Main Project\web scraper\dist
   ```
6. The extension **NIBM ACA Timetable Exporter** will now appear in your extensions list!

---

## How to Use

1. Navigate to the official NIBM Academic Calendar website:
   ```
   https://aca.mynibm.com/
   ```
2. Log in normally with your student credentials and complete any OTP verification.
3. Open your timetable dashboard (e.g., `/dashboard?view=month&...`).
4. Click the **Extensions** (puzzle piece) icon in your Chrome toolbar and pin **NIBM ACA Timetable Exporter**.
5. Click the extension icon to open the popup:
   - The status indicator will show **● ACA Connected** (green dot).
   - Your active **Batch** (e.g., `DSE241FT`) and **Period** (e.g., `September 2026`) will be displayed.
6. Click **Scan Timetable**:
   - The extension will scan the visible calendar grid.
   - The **Summary Metrics** will update with:
     - Total Events Found
     - Unique Events
     - Missing Fields (if any)
     - Deduplicated entries
7. Use the **Filters & Columns** button if you wish to:
   - Filter by date range (`From Date` / `To Date`).
   - Filter by specific lecture types (e.g. only `LP` or `LB`).
   - Filter by course name or subject code.
   - Toggle individual columns on/off for the CSV file.
8. Click **Export CSV**:
   - A clean CSV file (e.g., `NIBM_Timetable_DSE241FT_2026-09.csv`) will be downloaded locally to your computer.
   - Open it directly in **Microsoft Excel**, **Google Sheets**, or import it into **Google Calendar** / **Notion**.

---

## Supported Timetable Views

| View Mode | URL Indicator | Description |
|---|---|---|
| **Month View** | `?view=month` | Scrapes all day cells in the monthly grid. Handles boundary days from the previous or next month accurately without misattributing dates. |
| **Week View** | `?view=week` | Scrapes day columns (Monday through Sunday) with relative header date resolution. |
| **Day / Agenda View** | `?view=day` | Scrapes scheduled time slots and lists for the single selected day. |

---

## How the Scraper Engine Works

### Strategy 1: Multi-Layered DOM Scraping (`dom-scraper.ts` & `calendar-parser.ts`)
1. **Context Extraction**:
   - Parses URL parameters: `view`, `year`, `month`, `batch`.
   - Inspects visible heading elements (e.g. `<h1>September 2026</h1>`) to resolve 0-based vs 1-based month discrepancies.
   - Inspects visible batch selector buttons and dropdowns to display human-readable batch codes (like `DSE241FT`) instead of internal UUIDs.
2. **Cell & Boundary Date Resolution**:
   - Identifies grid cells (`[role="gridcell"]`, `td`, `div[class*="day"]`).
   - Resolves cell day numbers.
   - Checks classes such as `outside-month`, `prev-month`, `text-muted`, and grid index positions:
     - Days `> 15` in the first row belong to the *previous* month.
     - Days `< 15` in the bottom row belong to the *next* month.
   - Formats dates as `YYYY-MM-DD` in local Sri Lankan time (`Asia/Colombo`).
3. **Card Parsing**:
   - Layer 1: Data attributes (`data-type`, `data-course`, `data-room`, `data-lecturer`, `data-time`).
   - Layer 2: Semantic child tags (`[class*="lecturer"]`, `[class*="room"]`, `[class*="course-code"]`).
   - Layer 3: Text pattern heuristics (regex matching time spans like `08:30 - 10:30`, type codes, lecturer prefixes like `Dr.`, `Prof.`, `Mr.`, `Ms.`).
4. **Deduplication**:
   - Merges identical events or duplicate cards rendered for responsive layouts.
   - Preserves whichever instance has richer information.

### Strategy 2: Safe API Interception Fallback (`api-interceptor.ts` & `page-interceptor.ts`)
- Injects a small script into the page context to monitor read-only fetch and XMLHttpRequest responses.
- Filters requests matching keywords: `lectures`, `batches`, `calendar`, `schedule`.
- Clones and extracts JSON payloads without reading or touching any request headers, authorization tokens, or cookies.
- Dispatches parsed objects via `window.postMessage` directly to the extension content script.

---

## CSV Generation & Excel Compatibility

The CSV exporter (`csv-exporter.ts`) complies with **RFC 4180**:

1. **UTF-8 BOM (`\uFEFF`)**:
   Microsoft Excel historically opens CSV files in the system's ANSI codepage unless a Byte Order Mark is present. By prepending `\uFEFF`, Excel automatically detects UTF-8, rendering Sinhala (`සිංහල`) text and special characters flawlessly.
2. **CRLF Line Endings**:
   Uses standard `\r\n` line endings required for universal Excel compatibility.
3. **Quoting & Escaping**:
   - Any value with a comma, quote, or newline is enclosed in `"..."`.
   - Any internal double quotes are escaped as `""`.
   - Blank fields produce empty cells rather than `"null"` or `"undefined"`.

### Standard CSV Columns:
- `Date`: e.g. `2026-09-01`
- `Day`: e.g. `Tuesday`
- `Start Time`: e.g. `08:30` (24-hour format)
- `End Time`: e.g. `10:30` (24-hour format)
- `Type`: e.g. `LP`
- `Type Label`: e.g. `Lecture (Physical)`
- `Course Code`: e.g. `DSE501`
- `Course Name`: e.g. `Software Architecture`
- `Lecturer`: e.g. `Dr. Perera`
- `Room`: e.g. `Hall 4A`
- `Mode`: e.g. `Physical`
- `Batch`: e.g. `DSE241FT`

---

## Developer Debug Mode & Diagnostics

To enable diagnostics:
1. Open the extension popup.
2. Click **Filters & Columns**.
3. Check **[✓] Developer Debug Mode**.
4. The **Diagnostics & Debug Information** drawer will appear at the bottom, displaying:
   - Detected URL & calendar parameters
   - Parser strategy used (`dom`, `api`, or `hybrid`)
   - Total raw elements found vs. deduplicated count
   - Breakdown of any missing fields across records

---

## Updating Selectors if ACA Website Changes

If the NIBM ACA website updates its layout, the extension's defensive architecture allows easy customization:

- **Calendar cell selectors**: Update the `cellSelectors` array in [dom-scraper.ts](file:///c:/em/Main%20Project/web%20scraper/src/content/dom-scraper.ts#L45).
- **Event card element selectors**: Update the `eventSelectors` array in [dom-scraper.ts](file:///c:/em/Main%20Project/web%20scraper/src/content/dom-scraper.ts#L110).
- **Lecture types**: Add any newly introduced NIBM event types to `KNOWN_TYPES` in [timetable.ts](file:///c:/em/Main%20Project/web%20scraper/src/types/timetable.ts#L80).
- After making edits, run `npm run build` and reload the extension in `chrome://extensions`.

---

## Troubleshooting & FAQ

### 1. The popup says "Not on ACA"
- Ensure your active browser tab is on `https://aca.mynibm.com/`. If you are on an external page or login screen, navigate to the timetable dashboard first.

### 2. "No timetable events found"
- Verify that your timetable is actually loaded and visible on the screen.
- If the page is still loading, wait a moment and click **Scan Timetable**.
- Try toggling between Month, Week, or Day views and clicking **Scan Timetable**.

### 3. Sinhala text appears garbled in Excel
- The generated CSV includes a UTF-8 BOM (`\uFEFF`) which enables automatic Unicode detection in Excel 2016, 2019, 2021, and Microsoft 365.
- If using an older version of Excel, open Excel, go to **Data ➔ From Text/CSV**, select the file, and ensure the File Origin is set to **65001 : Unicode (UTF-8)**.

### 4. How to re-build after modifying source code?
Run:
```bash
npm run build
```
Then go to `chrome://extensions` and click the **Reload** (circular arrow) icon on the NIBM ACA Timetable Exporter card.

---

## Verification & Testing

The repository contains an automated test suite powered by **Vitest**:

```bash
# Run all unit and integration tests:
npm test
```

### Test Coverage Summary:
- **Normalizer tests** (`tests/normalizer.test.ts`):
  - Type mapping for all 11 known NIBM codes (`LP`, `LO`, `TU`, `LB`, `SM`, `WS`, `EX`, `VV`, `PR`, `CW`, `PC`).
  - Fallback preservation for unknown types.
  - 12h and 24h time string normalization into `HH:mm`.
  - Event fingerprint stability and deduplication.
  - Summary metrics and missing fields breakdown.
- **CSV Exporter tests** (`tests/csv-exporter.test.ts`):
  - RFC 4180 quote, comma, and newline escaping.
  - Excel UTF-8 BOM (`\uFEFF`) and CRLF line endings.
  - Sinhala Unicode fidelity (`මෘදුකාංග ඉංජිනේරු විද්‍යාව`).
  - Column subset selection and sanitized file naming.
- **Calendar Parser tests** (`tests/calendar-parser.test.ts`):
  - Inside-month day resolution.
  - Boundary day mapping (August 31 in September grid, October 1 in September grid).
  - Year rollover transitions (December ➔ January).
- **DOM Scraper Integration test** (`tests/dom-scraper.test.ts`):
  - Full simulation of ACA calendar grid DOM with multiple events, badges, times, and batch metadata.
