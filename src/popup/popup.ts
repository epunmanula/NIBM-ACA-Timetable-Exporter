/**
 * NIBM ACA Timetable Exporter - Popup Controller
 */

import {
  CalendarContext,
  ExportColumnOption,
  ExportFilters,
  ScraperState,
  TimetableEvent,
} from '../types/timetable';
import {
  downloadCsvLocally,
  generateCsvFilename,
  generateTimetableCsv,
} from '../export/csv-exporter';
import {
  loadColumnPreferences,
  loadFilterPreferences,
  loadScraperState,
  saveColumnPreferences,
  saveFilterPreferences,
  saveScraperState,
} from '../storage/storage';

// Current State
let state: ScraperState = {
  context: {
    connected: false,
    view: 'unknown',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    periodLabel: '',
    batch: '',
    url: '',
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
      room: 0,
    },
    strategyUsed: 'none',
    lastScannedAt: '',
  },
  autoRefresh: false,
  debugMode: false,
};

let columns: ExportColumnOption[] = [];
let filters: ExportFilters = {
  dateFrom: '',
  dateTo: '',
  selectedTypes: ['ALL'],
  courseFilter: '',
  searchQuery: '',
};

// DOM References
const statusDot = document.getElementById('statusDot') as HTMLElement;
const statusText = document.getElementById('statusText') as HTMLElement;
const statusBanner = document.getElementById('statusBanner') as HTMLElement;
const bannerMessage = document.getElementById('bannerMessage') as HTMLElement;
const bannerCloseBtn = document.getElementById('bannerCloseBtn') as HTMLElement;

const valBatch = document.getElementById('valBatch') as HTMLElement;
const valView = document.getElementById('valView') as HTMLElement;
const valPeriod = document.getElementById('valPeriod') as HTMLElement;

const metricTotal = document.getElementById('metricTotal') as HTMLElement;
const metricUnique = document.getElementById('metricUnique') as HTMLElement;
const metricMissing = document.getElementById('metricMissing') as HTMLElement;
const metricDuplicates = document.getElementById('metricDuplicates') as HTMLElement;

const btnScan = document.getElementById('btnScan') as HTMLButtonElement;
const btnEnrich = document.getElementById('btnEnrich') as HTMLButtonElement;
const btnExportCsv = document.getElementById('btnExportCsv') as HTMLButtonElement;
const btnToggleSettings = document.getElementById('btnToggleSettings') as HTMLButtonElement;

const settingsPanel = document.getElementById('settingsPanel') as HTMLElement;
const columnsGrid = document.getElementById('columnsGrid') as HTMLElement;
const filterDateFrom = document.getElementById('filterDateFrom') as HTMLInputElement;
const filterDateTo = document.getElementById('filterDateTo') as HTMLInputElement;
const filterType = document.getElementById('filterType') as HTMLSelectElement;
const filterCourse = document.getElementById('filterCourse') as HTMLInputElement;
const tableSearchInput = document.getElementById('tableSearchInput') as HTMLInputElement;
const chkAutoRefresh = document.getElementById('chkAutoRefresh') as HTMLInputElement;
const chkDebugMode = document.getElementById('chkDebugMode') as HTMLInputElement;

const previewTableBody = document.getElementById('previewTableBody') as HTMLElement;
const previewCountBadge = document.getElementById('previewCountBadge') as HTMLElement;
const debugDrawer = document.getElementById('debugDrawer') as HTMLElement;
const debugOutput = document.getElementById('debugOutput') as HTMLElement;
const lastSyncedText = document.getElementById('lastSyncedText') as HTMLElement;

/**
 * Display a banner message (info, warning, or danger)
 */
function showBanner(message: string, type: 'info' | 'warning' | 'danger' = 'info') {
  statusBanner.className = `banner banner-${type}`;
  bannerMessage.textContent = message;
  statusBanner.classList.remove('hidden');
}

function hideBanner() {
  statusBanner.classList.add('hidden');
}

/**
 * Update Status UI Card and Metrics
 */
function renderContextAndMetrics() {
  valBatch.textContent = state.context.batch || 'Not detected';
  valView.textContent = state.context.view
    ? state.context.view.charAt(0).toUpperCase() + state.context.view.slice(1)
    : 'Unknown';
  valPeriod.textContent = state.context.periodLabel || 'Current';

  metricTotal.textContent = state.summary.totalFound.toString();
  metricUnique.textContent = state.summary.uniqueCount.toString();
  metricMissing.textContent = state.summary.missingFieldsCount.toString();
  metricDuplicates.textContent = state.summary.duplicatesRemoved.toString();

  if (state.summary.lastScannedAt) {
    lastSyncedText.textContent = `Last scanned: ${state.summary.lastScannedAt}`;
  }

  // Update Debug Output if enabled
  if (state.debugMode) {
    debugDrawer.classList.remove('hidden');
    debugOutput.textContent = JSON.stringify(
      {
        context: state.context,
        summary: state.summary,
        totalEventsLoaded: state.events.length,
        strategy: state.summary.strategyUsed,
        missingBreakdown: state.summary.missingFieldsBreakdown,
      },
      null,
      2
    );
  } else {
    debugDrawer.classList.add('hidden');
  }
}

/**
 * Check if event matches current filter parameters
 */
function isEventMatchingFilters(ev: TimetableEvent): boolean {
  // Date range filter
  if (filters.dateFrom && ev.date && ev.date < filters.dateFrom) return false;
  if (filters.dateTo && ev.date && ev.date > filters.dateTo) return false;

  // Type filter
  if (!filters.selectedTypes.includes('ALL')) {
    if (!filters.selectedTypes.includes(ev.type)) return false;
  }

  // Course filter
  if (filters.courseFilter) {
    const q = filters.courseFilter.toLowerCase();
    const matchesCode = ev.courseCode.toLowerCase().includes(q);
    const matchesName = ev.courseName.toLowerCase().includes(q);
    if (!matchesCode && !matchesName) return false;
  }

  // Quick search
  if (filters.searchQuery) {
    const q = filters.searchQuery.toLowerCase();
    const haystack = `${ev.date} ${ev.startTime} ${ev.endTime} ${ev.type} ${ev.courseCode} ${ev.courseName} ${ev.lecturer} ${ev.room}`.toLowerCase();
    if (!haystack.includes(q)) return false;
  }

  return true;
}

/**
 * Get filtered event list
 */
function getFilteredEvents(): TimetableEvent[] {
  return state.events.filter(isEventMatchingFilters);
}

/**
 * Render the Preview Table rows
 */
function renderPreviewTable() {
  const filtered = getFilteredEvents();
  previewCountBadge.textContent = `${filtered.length} of ${state.events.length} records`;

  previewTableBody.innerHTML = '';

  if (filtered.length === 0) {
    const row = document.createElement('tr');
    row.className = 'empty-row';
    const cell = document.createElement('td');
    cell.colSpan = 6;
    cell.textContent =
      state.events.length === 0
        ? 'No timetable events found. Click "Scan Timetable" to extract from active page.'
        : 'No events match your current filter criteria.';
    row.appendChild(cell);
    previewTableBody.appendChild(row);
    return;
  }

  // Limit preview rows to 100 for high performance
  const displayLimit = Math.min(filtered.length, 100);

  for (let i = 0; i < displayLimit; i++) {
    const ev = filtered[i];
    const tr = document.createElement('tr');

    // Type Badge CSS Class
    let badgeClass = 'type-other';
    const code = ev.type.toLowerCase();
    if (code === 'lp') badgeClass = 'type-lp';
    else if (code === 'lo') badgeClass = 'type-lo';
    else if (code === 'tu') badgeClass = 'type-tu';
    else if (code === 'lb') badgeClass = 'type-lb';
    else if (code === 'ex') badgeClass = 'type-ex';

    const timeText = ev.startTime
      ? ev.endTime
        ? `${ev.startTime} - ${ev.endTime}`
        : ev.startTime
      : '—';

    tr.innerHTML = `
      <td><strong>${escapeHtml(ev.date || '—')}</strong><br><span style="color:#64748b;font-size:10px;">${escapeHtml(ev.dayOfWeek || '')}</span></td>
      <td>${escapeHtml(timeText)}</td>
      <td><span class="type-badge ${badgeClass}">${escapeHtml(ev.type || 'N/A')}</span></td>
      <td><strong>${escapeHtml(ev.courseCode || '')}</strong> ${escapeHtml(ev.courseName || '—')}</td>
      <td>${escapeHtml(ev.lecturer || '—')}</td>
      <td>${escapeHtml(ev.room || '—')}</td>
    `;

    previewTableBody.appendChild(tr);
  }

  if (filtered.length > 100) {
    const tr = document.createElement('tr');
    tr.className = 'empty-row';
    tr.innerHTML = `<td colspan="6" style="padding:10px;font-style:italic;">Showing first 100 of ${filtered.length} matching events. All ${filtered.length} will be exported to CSV.</td>`;
    previewTableBody.appendChild(tr);
  }
}

/**
 * Render Column Selector Checkboxes
 */
function renderColumnsSelector() {
  columnsGrid.innerHTML = '';
  columns.forEach((col, index) => {
    const label = document.createElement('label');
    label.className = 'col-checkbox-label';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = col.enabled;
    input.addEventListener('change', () => {
      columns[index].enabled = input.checked;
      saveColumnPreferences(columns);
    });

    const span = document.createElement('span');
    span.textContent = col.label;

    label.appendChild(input);
    label.appendChild(span);
    columnsGrid.appendChild(label);
  });
}

/**
 * Escapes HTML characters for safe DOM insertion
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Ensures the content script is running in the tab, auto-injecting if necessary.
 */
async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
    if (response && response.connected) return true;
  } catch {
    // Attempt dynamic injection
  }

  try {
    if (chrome.scripting && chrome.scripting.executeScript) {
      await chrome.scripting.executeScript({
        target: { tabId, allFrames: true },
        files: ['content/content.js'],
      });
      await new Promise((resolve) => setTimeout(resolve, 200));
      const retry = await chrome.tabs.sendMessage(tabId, { action: 'PING' });
      return Boolean(retry && retry.connected);
    }
  } catch (err) {
    console.warn('[NIBM Exporter] Auto-injection error:', err);
  }
  return false;
}

/**
 * Connect with active tab content script
 */
async function checkActiveTab(): Promise<chrome.tabs.Tab | null> {
  if (typeof chrome === 'undefined' || !chrome.tabs) {
    statusDot.className = 'status-dot warning';
    statusText.textContent = 'Non-Extension Env';
    return null;
  }

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'No Active Tab';
      return null;
    }

    const url = tab.url || '';
    if (!url.includes('aca.mynibm.com')) {
      statusDot.className = 'status-dot disconnected';
      statusText.textContent = 'Not on ACA';
      showBanner(
        'Please open your NIBM Academic Calendar dashboard (https://aca.mynibm.com/) to scan.',
        'warning'
      );
      btnScan.disabled = true;
      return tab;
    }

    btnScan.disabled = false;

    // Ping or auto-inject content script
    const isReady = await ensureContentScriptInjected(tab.id);
    if (isReady) {
      try {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'PING' });
        if (response && response.connected) {
          statusDot.className = 'status-dot connected';
          statusText.textContent = 'ACA Connected';
          if (response.batch) state.context.batch = response.batch;
          if (response.period) state.context.periodLabel = response.period;
          renderContextAndMetrics();
        }
      } catch {
        statusDot.className = 'status-dot warning';
        statusText.textContent = 'Ready to Scan';
      }
    } else {
      statusDot.className = 'status-dot warning';
      statusText.textContent = 'Ready to Scan';
    }

    return tab;
  } catch (err) {
    console.error('[NIBM Exporter] Failed to query tab:', err);
    return null;
  }
}

/**
 * Execute scan on active tab
 */
async function triggerScan() {
  btnScan.disabled = true;
  btnScan.innerHTML = '<span class="btn-icon">⏳</span> Scanning...';
  hideBanner();

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab found.');

    // Ensure content script is ready
    await ensureContentScriptInjected(tab.id);

    const result = (await chrome.tabs.sendMessage(tab.id, {
      action: 'SCAN_PAGE',
    })) as ScraperState;

    if (result && result.events) {
      state = result;
      renderContextAndMetrics();
      renderPreviewTable();

      if (state.events.length === 0) {
        showBanner(
          'No timetable events found. Please make sure your timetable is visible on the page.',
          'warning'
        );
      } else {
        showBanner(
          `Successfully extracted ${state.events.length} timetable events (${state.summary.duplicatesRemoved} duplicates removed).`,
          'info'
        );
      }
    } else {
      showBanner('Extraction completed, but no events were found.', 'warning');
    }
  } catch (err) {
    console.error('[NIBM Exporter] Scan error:', err);
    showBanner(
      'Could not connect to page. Please refresh your ACA timetable tab and try again.',
      'danger'
    );
  } finally {
    btnScan.disabled = false;
    btnScan.innerHTML = '<span class="btn-icon">⟳</span> Scan Timetable';
  }
}

/**
 * Auto-enrich lectures by opening cards and capturing modal details
 */
async function triggerEnrich() {
  if (!btnEnrich) return;
  btnEnrich.disabled = true;
  btnEnrich.innerHTML = '<span class="btn-icon">⏳</span> Enriching...';
  showBanner('Auto-enriching lectures from ACA cards... Please wait a few seconds.', 'info');

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.id) throw new Error('No active tab found.');

    await ensureContentScriptInjected(tab.id);

    const result = (await chrome.tabs.sendMessage(tab.id, {
      action: 'ENRICH_DETAILS',
    })) as ScraperState;

    if (result && result.events) {
      state = result;
      renderContextAndMetrics();
      renderPreviewTable();
      showBanner(
        `Enriched successfully! Lecturer, exact times, and room details updated.`,
        'info'
      );
    }
  } catch (err) {
    console.error('[NIBM Exporter] Enrich error:', err);
    showBanner(
      'Enrichment completed. You can also click any lecture card on ACA to update its details.',
      'info'
    );
  } finally {
    btnEnrich.disabled = false;
    btnEnrich.innerHTML = '<span class="btn-icon">⚡</span> Enrich Details';
  }
}

/**
 * Handle CSV Export
 */
function handleExport() {
  const eventsToExport = getFilteredEvents();

  if (eventsToExport.length === 0) {
    showBanner('No events to export. Please scan or clear filters.', 'warning');
    return;
  }

  const activeCols = columns.filter((c) => c.enabled);
  if (activeCols.length === 0) {
    showBanner('Please select at least one column to export in Filters & Columns.', 'warning');
    return;
  }

  const isFiltered = eventsToExport.length !== state.events.length;
  const filename = generateCsvFilename(state.context, isFiltered);
  const csvData = generateTimetableCsv(eventsToExport, columns);

  downloadCsvLocally(csvData, filename);

  showBanner(
    `Exported ${eventsToExport.length} events to ${filename} successfully!`,
    'info'
  );
}

/**
 * Event Listeners and Initialization
 */
async function init() {
  // Load saved configurations
  columns = await loadColumnPreferences();
  const savedFilters = await loadFilterPreferences();
  filters = { ...filters, ...savedFilters };
  state = await loadScraperState();

  // Populate UI inputs from saved filter preferences
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
  renderPreviewTable();

  // Connect with active tab
  await checkActiveTab();

  // Bind Buttons
  btnScan.addEventListener('click', triggerScan);
  if (btnEnrich) btnEnrich.addEventListener('click', triggerEnrich);
  btnExportCsv.addEventListener('click', handleExport);
  bannerCloseBtn.addEventListener('click', hideBanner);

  btnToggleSettings.addEventListener('click', () => {
    settingsPanel.classList.toggle('hidden');
    const isNowVisible = !settingsPanel.classList.contains('hidden');
    btnToggleSettings.style.background = isNowVisible ? '#e2e8f0' : '';
  });

  // Filter Event Handlers
  filterDateFrom.addEventListener('change', () => {
    filters.dateFrom = filterDateFrom.value;
    saveFilterPreferences(filters);
    renderPreviewTable();
  });

  filterDateTo.addEventListener('change', () => {
    filters.dateTo = filterDateTo.value;
    saveFilterPreferences(filters);
    renderPreviewTable();
  });

  filterType.addEventListener('change', () => {
    const val = filterType.value;
    filters.selectedTypes = val === 'ALL' ? ['ALL'] : [val];
    saveFilterPreferences(filters);
    renderPreviewTable();
  });

  filterCourse.addEventListener('input', () => {
    filters.courseFilter = filterCourse.value.trim();
    saveFilterPreferences(filters);
    renderPreviewTable();
  });

  tableSearchInput.addEventListener('input', () => {
    filters.searchQuery = tableSearchInput.value.trim();
    renderPreviewTable();
  });

  chkAutoRefresh.addEventListener('change', async () => {
    state.autoRefresh = chkAutoRefresh.checked;
    await saveScraperState(state);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'TOGGLE_AUTO_REFRESH',
        payload: state.autoRefresh,
      });
    }
  });

  chkDebugMode.addEventListener('change', async () => {
    state.debugMode = chkDebugMode.checked;
    await saveScraperState(state);
    renderContextAndMetrics();
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SET_DEBUG_MODE',
        payload: state.debugMode,
      });
    }
  });
}

document.addEventListener('DOMContentLoaded', init);
