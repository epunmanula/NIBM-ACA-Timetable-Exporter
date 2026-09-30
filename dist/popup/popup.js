// src/export/csv-exporter.ts
function escapeCsvCell(value) {
  if (value === null || value === void 0) {
    return "";
  }
  const str = String(value);
  const needsQuotes = /[",\r\n]/.test(str);
  if (needsQuotes) {
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }
  return str;
}
function generateTimetableCsv(events, columns2) {
  const activeCols = columns2.filter((c) => c.enabled);
  if (activeCols.length === 0) {
    return "";
  }
  const BOM = "\uFEFF";
  const sortedEvents = [...events].sort((a, b) => {
    const dateComp = (a.date || "").localeCompare(b.date || "");
    if (dateComp !== 0) return dateComp;
    return (a.startTime || "").localeCompare(b.startTime || "");
  });
  const headerRow = activeCols.map((c) => escapeCsvCell(c.label)).join(",");
  const dataRows = sortedEvents.map((ev) => {
    return activeCols.map((col) => {
      const val = ev[col.key];
      return escapeCsvCell(val !== void 0 && val !== null ? val : "");
    }).join(",");
  });
  const allLines = [headerRow, ...dataRows];
  return BOM + allLines.join("\r\n") + "\r\n";
}
function generateCsvFilename(context, isFiltered = false) {
  const cleanBatch = (context.batch || "Batch").replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 25).replace(/_+$/g, "");
  let period = "";
  if (context.periodLabel && (context.periodLabel.includes("\u2013") || context.periodLabel.includes("Months"))) {
    period = context.periodLabel.replace(/[^a-zA-Z0-9_-]/g, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").slice(0, 30);
  } else {
    const y = context.year || (/* @__PURE__ */ new Date()).getFullYear();
    const m = (context.month || (/* @__PURE__ */ new Date()).getMonth() + 1).toString().padStart(2, "0");
    period = `${y}-${m}`;
  }
  const suffix = isFiltered ? "_Filtered" : "";
  return `NIBM_Timetable_${cleanBatch || "Batch"}_${period}${suffix}.csv`;
}
function downloadCsvLocally(csvContent, filename) {
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = blobUrl;
  link.setAttribute("download", filename);
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }, 500);
}

// src/storage/storage.ts
var STORAGE_KEYS = {
  STATE: "nibm_aca_state",
  COLUMN_PREFS: "nibm_aca_column_prefs",
  FILTER_PREFS: "nibm_aca_filter_prefs",
  DEBUG_MODE: "nibm_aca_debug_mode",
  AUTO_REFRESH: "nibm_aca_auto_refresh"
};
var DEFAULT_COLUMNS = [
  { key: "date", label: "Date", enabled: true },
  { key: "dayOfWeek", label: "Day", enabled: true },
  { key: "startTime", label: "Start Time", enabled: true },
  { key: "endTime", label: "End Time", enabled: true },
  { key: "type", label: "Type", enabled: true },
  { key: "typeLabel", label: "Type Label", enabled: true },
  { key: "courseCode", label: "Course Code", enabled: true },
  { key: "courseName", label: "Course Name", enabled: true },
  { key: "lecturer", label: "Lecturer", enabled: true },
  { key: "room", label: "Room", enabled: true },
  { key: "mode", label: "Mode", enabled: true },
  { key: "batch", label: "Batch", enabled: true }
];
var DEFAULT_STATE = {
  context: {
    connected: false,
    view: "unknown",
    year: (/* @__PURE__ */ new Date()).getFullYear(),
    month: (/* @__PURE__ */ new Date()).getMonth() + 1,
    periodLabel: "",
    batch: "",
    url: ""
  },
  events: [],
  summary: {
    totalFound: 0,
    uniqueCount: 0,
    duplicatesRemoved: 0,
    missingFieldsCount: 0,
    missingFieldsBreakdown: {
      startTime: 0,
      endTime: 0,
      type: 0,
      courseCode: 0,
      courseName: 0,
      lecturer: 0,
      room: 0
    },
    strategyUsed: "none",
    lastScannedAt: ""
  },
  autoRefresh: false,
  debugMode: false
};
function hasChromeStorage() {
  return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
}
async function saveScraperState(state2) {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state2 });
  } catch (err) {
    console.error("[NIBM Exporter] Failed to save state:", err);
  }
}
async function loadScraperState() {
  if (!hasChromeStorage()) return DEFAULT_STATE;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.STATE);
    return result[STORAGE_KEYS.STATE] || DEFAULT_STATE;
  } catch (err) {
    console.error("[NIBM Exporter] Failed to load state:", err);
    return DEFAULT_STATE;
  }
}
async function saveColumnPreferences(cols) {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.COLUMN_PREFS]: cols });
  } catch (err) {
    console.error("[NIBM Exporter] Failed to save column prefs:", err);
  }
}
async function loadColumnPreferences() {
  if (!hasChromeStorage()) return DEFAULT_COLUMNS;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.COLUMN_PREFS);
    return result[STORAGE_KEYS.COLUMN_PREFS] || DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}
async function saveFilterPreferences(filters2) {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.FILTER_PREFS]: filters2 });
  } catch (err) {
    console.error("[NIBM Exporter] Failed to save filter prefs:", err);
  }
}
async function loadFilterPreferences() {
  if (!hasChromeStorage()) return {};
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.FILTER_PREFS);
    return result[STORAGE_KEYS.FILTER_PREFS] || {};
  } catch {
    return {};
  }
}

// src/popup/popup.ts
var state = {
  context: {
    connected: false,
    view: "unknown",
    year: (/* @__PURE__ */ new Date()).getFullYear(),
    month: (/* @__PURE__ */ new Date()).getMonth() + 1,
    periodLabel: "",
    batch: "",
    url: ""
  },
  events: [],
  summary: {
    totalFound: 0,
    uniqueCount: 0,
    duplicatesRemoved: 0,
    missingFieldsCount: 0,
    missingFieldsBreakdown: {
      startTime: 0,
      endTime: 0,
      type: 0,
      courseCode: 0,
      courseName: 0,
      lecturer: 0,
      room: 0
    },
    strategyUsed: "none",
    lastScannedAt: ""
  },
  autoRefresh: false,
  debugMode: false
};
var columns = [];
var filters = {
  dateFrom: "",
  dateTo: "",
  selectedTypes: ["ALL"],
  courseFilter: "",
  searchQuery: ""
};
var statusDot = document.getElementById("statusDot");
var statusText = document.getElementById("statusText");
var statusBanner = document.getElementById("statusBanner");
var bannerMessage = document.getElementById("bannerMessage");
var bannerCloseBtn = document.getElementById("bannerCloseBtn");
var valBatch = document.getElementById("valBatch");
var valView = document.getElementById("valView");
var valPeriod = document.getElementById("valPeriod");
var metricTotal = document.getElementById("metricTotal");
var metricUnique = document.getElementById("metricUnique");
var metricMissing = document.getElementById("metricMissing");
var metricDuplicates = document.getElementById("metricDuplicates");
var btnScanAll = document.getElementById("btnScanAll");
var btnScan = document.getElementById("btnScan");
var btnEnrich = document.getElementById("btnEnrich");
var btnExportCsv = document.getElementById("btnExportCsv");
var btnToggleSettings = document.getElementById("btnToggleSettings");
var btnClearData = document.getElementById("btnClearData");
var settingsPanel = document.getElementById("settingsPanel");
var columnsGrid = document.getElementById("columnsGrid");
var filterDateFrom = document.getElementById("filterDateFrom");
var filterDateTo = document.getElementById("filterDateTo");
var filterType = document.getElementById("filterType");
var filterCourse = document.getElementById("filterCourse");
var tableSearchInput = document.getElementById("tableSearchInput");
var chkAutoRefresh = document.getElementById("chkAutoRefresh");
var chkDebugMode = document.getElementById("chkDebugMode");
var previewTableBody = document.getElementById("previewTableBody");
var previewCountBadge = document.getElementById("previewCountBadge");
var debugDrawer = document.getElementById("debugDrawer");
var debugOutput = document.getElementById("debugOutput");
var lastSyncedText = document.getElementById("lastSyncedText");
function showBanner(message, type = "info") {
  statusBanner.className = `banner banner-${type}`;
  bannerMessage.textContent = message;
  statusBanner.classList.remove("hidden");
}
function hideBanner() {
  statusBanner.classList.add("hidden");
}
function renderContextAndMetrics() {
  valBatch.textContent = state.context.batch || "Not detected";
  valView.textContent = state.context.view ? state.context.view.charAt(0).toUpperCase() + state.context.view.slice(1) : "Unknown";
  valPeriod.textContent = state.context.periodLabel || "Current";
  metricTotal.textContent = state.summary.totalFound.toString();
  metricUnique.textContent = state.summary.uniqueCount.toString();
  metricMissing.textContent = state.summary.missingFieldsCount.toString();
  metricDuplicates.textContent = state.summary.duplicatesRemoved.toString();
  if (state.summary.lastScannedAt) {
    lastSyncedText.textContent = `Last scanned: ${state.summary.lastScannedAt}`;
  }
  if (state.debugMode) {
    debugDrawer.classList.remove("hidden");
    debugOutput.textContent = JSON.stringify(
      {
        context: state.context,
        summary: state.summary,
        totalEventsLoaded: state.events.length,
        strategy: state.summary.strategyUsed,
        missingBreakdown: state.summary.missingFieldsBreakdown
      },
      null,
      2
    );
  } else {
    debugDrawer.classList.add("hidden");
  }
}
function isEventMatchingFilters(ev) {
  if (filters.dateFrom && ev.date && ev.date < filters.dateFrom) return false;
  if (filters.dateTo && ev.date && ev.date > filters.dateTo) return false;
  if (!filters.selectedTypes.includes("ALL")) {
    if (!filters.selectedTypes.includes(ev.type)) return false;
  }
  if (filters.courseFilter) {
    const q = filters.courseFilter.toLowerCase();
    const matchesCode = ev.courseCode.toLowerCase().includes(q);
    const matchesName = ev.courseName.toLowerCase().includes(q);
    if (!matchesCode && !matchesName) return false;
  }
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    const haystack = `${ev.date} ${ev.startTime} ${ev.endTime} ${ev.type} ${ev.courseCode} ${ev.courseName} ${ev.lecturer} ${ev.room}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}
function resetFilters() {
  filters = {
    dateFrom: "",
    dateTo: "",
    selectedTypes: ["ALL"],
    courseFilter: "",
    searchQuery: ""
  };
  if (filterDateFrom) filterDateFrom.value = "";
  if (filterDateTo) filterDateTo.value = "";
  if (filterType) filterType.value = "ALL";
  if (filterCourse) filterCourse.value = "";
  if (tableSearchInput) tableSearchInput.value = "";
  saveFilterPreferences(filters);
  renderPreviewTable();
}
function getFilteredEvents() {
  return state.events.filter(isEventMatchingFilters);
}
function renderPreviewTable() {
  const filtered = getFilteredEvents();
  previewCountBadge.textContent = `${filtered.length} of ${state.events.length} records`;
  previewTableBody.innerHTML = "";
  if (filtered.length === 0) {
    const row = document.createElement("tr");
    row.className = "empty-row";
    const cell = document.createElement("td");
    cell.colSpan = 6;
    if (state.events.length === 0) {
      cell.textContent = 'No timetable events found. Click "Scan All Months" or "Scan Month" to extract.';
    } else {
      cell.innerHTML = `<span>No events match your current filter criteria.</span> <button id="btnResetFiltersInline" style="background:#e0e7ff;color:#4338ca;border:none;border-radius:4px;padding:3px 9px;font-size:11px;font-weight:600;cursor:pointer;margin-left:8px;">Clear Filters</button>`;
      setTimeout(() => {
        const btn = document.getElementById("btnResetFiltersInline");
        if (btn) btn.onclick = resetFilters;
      }, 0);
    }
    row.appendChild(cell);
    previewTableBody.appendChild(row);
    return;
  }
  const displayLimit = Math.min(filtered.length, 100);
  for (let i = 0; i < displayLimit; i++) {
    const ev = filtered[i];
    const tr = document.createElement("tr");
    let badgeClass = "type-other";
    const code = ev.type.toLowerCase();
    if (code === "lp") badgeClass = "type-lp";
    else if (code === "lo") badgeClass = "type-lo";
    else if (code === "tu") badgeClass = "type-tu";
    else if (code === "lb") badgeClass = "type-lb";
    else if (code === "ex") badgeClass = "type-ex";
    const timeText = ev.startTime ? ev.endTime ? `${ev.startTime} - ${ev.endTime}` : ev.startTime : "\u2014";
    tr.innerHTML = `
      <td><strong>${escapeHtml(ev.date || "\u2014")}</strong><br><span style="color:#64748b;font-size:10px;">${escapeHtml(ev.dayOfWeek || "")}</span></td>
      <td>${escapeHtml(timeText)}</td>
      <td><span class="type-badge ${badgeClass}">${escapeHtml(ev.type || "N/A")}</span></td>
      <td><strong>${escapeHtml(ev.courseCode || "")}</strong> ${escapeHtml(ev.courseName || "\u2014")}</td>
      <td>${escapeHtml(ev.lecturer || "\u2014")}</td>
      <td>${escapeHtml(ev.room || "\u2014")}</td>
    `;
    previewTableBody.appendChild(tr);
  }
  if (filtered.length > 100) {
    const tr = document.createElement("tr");
    tr.className = "empty-row";
    tr.innerHTML = `<td colspan="6" style="padding:10px;font-style:italic;">Showing first 100 of ${filtered.length} matching events. All ${filtered.length} will be exported to CSV.</td>`;
    previewTableBody.appendChild(tr);
  }
}
function renderColumnsSelector() {
  columnsGrid.innerHTML = "";
  columns.forEach((col, index) => {
    const label = document.createElement("label");
    label.className = "col-checkbox-label";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = col.enabled;
    input.addEventListener("change", () => {
      columns[index].enabled = input.checked;
      saveColumnPreferences(columns);
    });
    const span = document.createElement("span");
    span.textContent = col.label;
    label.appendChild(input);
    label.appendChild(span);
    columnsGrid.appendChild(label);
  });
}
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
async function ensureContentScriptInjected(tabId) {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: "PING" });
    if (response && response.connected) return true;
  } catch {
  }
  try {
    if (chrome.scripting && chrome.scripting.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ["content/content.js"]
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const retry = await chrome.tabs.sendMessage(tabId, { action: "PING" });
      return Boolean(retry && retry.connected);
    }
  } catch (err) {
    console.warn("[NIBM Exporter] Auto-injection error:", err);
  }
  return false;
}
async function checkActiveTab() {
  if (typeof chrome === "undefined" || !chrome.tabs) {
    statusDot.className = "status-dot warning";
    statusText.textContent = "Non-Extension Env";
    return null;
  }
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusDot.className = "status-dot disconnected";
      statusText.textContent = "No Active Tab";
      return null;
    }
    const url = tab.url || "";
    if (!url.includes("aca.mynibm.com")) {
      statusDot.className = "status-dot disconnected";
      statusText.textContent = "Not on ACA";
      showBanner(
        "Please open your NIBM Academic Calendar dashboard (https://aca.mynibm.com/) to scan.",
        "warning"
      );
      btnScan.disabled = true;
      return tab;
    }
    btnScan.disabled = false;
    const isReady = await ensureContentScriptInjected(tab.id);
    if (isReady) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: "PING" });
        if (response && response.connected) {
          statusDot.className = "status-dot connected";
          statusText.textContent = "ACA Connected";
          if (response.batch) state.context.batch = response.batch;
          if (response.period) state.context.periodLabel = response.period;
          renderContextAndMetrics();
        }
      } catch {
        statusDot.className = "status-dot warning";
        statusText.textContent = "Ready to Scan";
      }
    } else {
      statusDot.className = "status-dot warning";
      statusText.textContent = "Ready to Scan";
    }
    return tab;
  } catch (err) {
    console.error("[NIBM Exporter] Failed to query tab:", err);
    return null;
  }
}
async function triggerScan() {
  btnScan.disabled = true;
  btnScan.innerHTML = '<span class="btn-icon">\u23F3</span> Scanning & Enriching...';
  showBanner("Scanning timetable and collecting lecturer & room details... Please wait a few seconds.", "info");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab found.");
    await ensureContentScriptInjected(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: "SCAN_PAGE"
    });
    if (result && result.events) {
      state = result;
      if (getFilteredEvents().length === 0 && state.events.length > 0) {
        resetFilters();
      } else {
        renderContextAndMetrics();
        renderPreviewTable();
      }
      if (state.events.length === 0) {
        showBanner(
          "No timetable events found. Please make sure your timetable is visible on the page.",
          "warning"
        );
      } else {
        const enrichedCount = state.events.filter((e) => e.lecturer || e.room).length;
        showBanner(
          `Successfully extracted ${state.events.length} timetable events (${enrichedCount} with lecturer/room details).`,
          "info"
        );
      }
    } else {
      showBanner("Extraction completed, but no events were found.", "warning");
    }
  } catch (err) {
    console.error("[NIBM Exporter] Scan error:", err);
    showBanner(
      "Could not connect to page. Please refresh your ACA timetable tab and try again.",
      "danger"
    );
  } finally {
    btnScan.disabled = false;
    btnScan.innerHTML = '<span class="btn-icon">\u27F3</span> Scan Month';
  }
}
async function triggerScanAll() {
  if (!btnScanAll) return;
  btnScanAll.disabled = true;
  btnScanAll.innerHTML = '<span class="btn-icon">\u23F3</span> Scanning All...';
  showBanner("Auto-scanning all months with timetable data... Please wait a few moments.", "info");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab found.");
    await ensureContentScriptInjected(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: "SCAN_ALL_MONTHS"
    });
    if (result && result.events) {
      state = result;
      if (getFilteredEvents().length === 0 && state.events.length > 0) {
        resetFilters();
      } else {
        renderContextAndMetrics();
        renderPreviewTable();
      }
      showBanner(
        `Multi-month scan completed! Collected ${state.events.length} total events across all months.`,
        "info"
      );
    }
  } catch (err) {
    console.error("[NIBM Exporter] Multi-month scan error:", err);
    showBanner("Multi-month scan completed or stopped. Timetable events loaded.", "info");
  } finally {
    btnScanAll.disabled = false;
    btnScanAll.innerHTML = '<span class="btn-icon">\u{1F4C5}</span> Scan All Months';
  }
}
async function handleClearData() {
  if (!confirm("Are you sure you want to clear all accumulated timetable data?")) return;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      await chrome.tabs.sendMessage(tab.id, { action: "CLEAR_DATA" });
    }
  } catch {
  }
  state.events = [];
  state.summary = {
    totalFound: 0,
    uniqueCount: 0,
    duplicatesRemoved: 0,
    missingFieldsCount: 0,
    missingFieldsBreakdown: {
      startTime: 0,
      endTime: 0,
      type: 0,
      courseCode: 0,
      courseName: 0,
      lecturer: 0,
      room: 0
    },
    strategyUsed: "none",
    lastScannedAt: ""
  };
  await saveScraperState(state);
  renderContextAndMetrics();
  renderPreviewTable();
  showBanner("All saved timetable data cleared.", "info");
}
async function triggerEnrich() {
  if (!btnEnrich) return;
  btnEnrich.disabled = true;
  btnEnrich.innerHTML = '<span class="btn-icon">\u23F3</span> Enriching...';
  showBanner("Auto-enriching lectures from ACA cards... Please wait a few seconds.", "info");
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error("No active tab found.");
    await ensureContentScriptInjected(tab.id);
    const result = await chrome.tabs.sendMessage(tab.id, {
      action: "ENRICH_DETAILS"
    });
    if (result && result.events) {
      state = result;
      renderContextAndMetrics();
      renderPreviewTable();
      showBanner(
        `Enriched successfully! Lecturer, exact times, and room details updated.`,
        "info"
      );
    }
  } catch (err) {
    console.error("[NIBM Exporter] Enrich error:", err);
    showBanner(
      "Enrichment completed. You can also click any lecture card on ACA to update its details.",
      "info"
    );
  } finally {
    btnEnrich.disabled = false;
    btnEnrich.innerHTML = '<span class="btn-icon">\u26A1</span> Enrich Details';
  }
}
function handleExport() {
  let eventsToExport = getFilteredEvents();
  if (eventsToExport.length === 0 && state.events.length > 0) {
    resetFilters();
    eventsToExport = state.events;
  }
  if (eventsToExport.length === 0) {
    showBanner("No events to export. Please scan or clear filters.", "warning");
    return;
  }
  const activeCols = columns.filter((c) => c.enabled);
  if (activeCols.length === 0) {
    showBanner("Please select at least one column to export in Filters & Columns.", "warning");
    return;
  }
  const isFiltered = eventsToExport.length !== state.events.length;
  const filename = generateCsvFilename(state.context, isFiltered);
  const csvData = generateTimetableCsv(eventsToExport, columns);
  downloadCsvLocally(csvData, filename);
  showBanner(
    `Exported ${eventsToExport.length} events to ${filename} successfully!`,
    "info"
  );
}
async function init() {
  columns = await loadColumnPreferences();
  const savedFilters = await loadFilterPreferences();
  filters = { ...filters, ...savedFilters };
  state = await loadScraperState();
  if (filters.dateFrom) filterDateFrom.value = filters.dateFrom;
  if (filters.dateTo) filterDateTo.value = filters.dateTo;
  if (filters.courseFilter) filterCourse.value = filters.courseFilter;
  if (filters.selectedTypes && filters.selectedTypes[0]) {
    filterType.value = filters.selectedTypes[0];
  }
  chkAutoRefresh.checked = Boolean(state.autoRefresh);
  chkDebugMode.checked = Boolean(state.debugMode);
  renderColumnsSelector();
  renderContextAndMetrics();
  if (getFilteredEvents().length === 0 && state.events.length > 0) {
    resetFilters();
  } else {
    renderPreviewTable();
  }
  await checkActiveTab();
  if (btnScanAll) btnScanAll.addEventListener("click", triggerScanAll);
  btnScan.addEventListener("click", triggerScan);
  if (btnEnrich) btnEnrich.addEventListener("click", triggerEnrich);
  btnExportCsv.addEventListener("click", handleExport);
  bannerCloseBtn.addEventListener("click", hideBanner);
  if (btnClearData) btnClearData.addEventListener("click", handleClearData);
  btnToggleSettings.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
    const isNowVisible = !settingsPanel.classList.contains("hidden");
    btnToggleSettings.style.background = isNowVisible ? "#e2e8f0" : "";
  });
  filterDateFrom.addEventListener("change", () => {
    filters.dateFrom = filterDateFrom.value;
    saveFilterPreferences(filters);
    renderPreviewTable();
  });
  filterDateTo.addEventListener("change", () => {
    filters.dateTo = filterDateTo.value;
    saveFilterPreferences(filters);
    renderPreviewTable();
  });
  filterType.addEventListener("change", () => {
    const val = filterType.value;
    filters.selectedTypes = val === "ALL" ? ["ALL"] : [val];
    saveFilterPreferences(filters);
    renderPreviewTable();
  });
  filterCourse.addEventListener("input", () => {
    filters.courseFilter = filterCourse.value.trim();
    saveFilterPreferences(filters);
    renderPreviewTable();
  });
  tableSearchInput.addEventListener("input", () => {
    filters.searchQuery = tableSearchInput.value.trim();
    renderPreviewTable();
  });
  chkAutoRefresh.addEventListener("change", async () => {
    state.autoRefresh = chkAutoRefresh.checked;
    await saveScraperState(state);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "TOGGLE_AUTO_REFRESH",
        payload: state.autoRefresh
      });
    }
  });
  chkDebugMode.addEventListener("change", async () => {
    state.debugMode = chkDebugMode.checked;
    await saveScraperState(state);
    renderContextAndMetrics();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: "SET_DEBUG_MODE",
        payload: state.debugMode
      });
    }
  });
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === "ENRICH_PROGRESS" && msg.payload) {
      const { current, total, cardText, isComplete } = msg.payload;
      if (isComplete) {
        showBanner(`Completed crawling ${total} cards! All details captured.`, "info");
      } else {
        const pct = Math.round(current / total * 100);
        showBanner(`Enriching card ${current} of ${total}: ${cardText} (${pct}%)...`, "info");
        if (btnScanAll && btnScanAll.disabled) {
          btnScanAll.innerHTML = `<span class="btn-icon">\u23F3</span> ${current}/${total} (${pct}%)`;
        }
        if (btnScan.disabled) {
          btnScan.innerHTML = `<span class="btn-icon">\u23F3</span> ${current}/${total} (${pct}%)`;
        }
        if (btnEnrich && btnEnrich.disabled) {
          btnEnrich.innerHTML = `<span class="btn-icon">\u23F3</span> ${current}/${total} (${pct}%)`;
        }
      }
    }
  });
}
document.addEventListener("DOMContentLoaded", init);
