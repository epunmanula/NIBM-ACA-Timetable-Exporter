/**
 * NIBM ACA Timetable Exporter - Local Storage Helper
 * 
 * Safely persists timetable data and user preferences strictly locally in chrome.storage.local.
 * ZERO sensitive data, tokens, or credentials are ever stored.
 */

import { ScraperState, ExportColumnOption, ExportFilters } from '../types/timetable';

const STORAGE_KEYS = {
  STATE: 'nibm_aca_state',
  COLUMN_PREFS: 'nibm_aca_column_prefs',
  FILTER_PREFS: 'nibm_aca_filter_prefs',
  DEBUG_MODE: 'nibm_aca_debug_mode',
  AUTO_REFRESH: 'nibm_aca_auto_refresh',
};

const DEFAULT_COLUMNS: ExportColumnOption[] = [
  { key: 'date', label: 'Date', enabled: true },
  { key: 'dayOfWeek', label: 'Day', enabled: true },
  { key: 'startTime', label: 'Start Time', enabled: true },
  { key: 'endTime', label: 'End Time', enabled: true },
  { key: 'type', label: 'Type', enabled: true },
  { key: 'typeLabel', label: 'Type Label', enabled: true },
  { key: 'courseCode', label: 'Course Code', enabled: true },
  { key: 'courseName', label: 'Course Name', enabled: true },
  { key: 'lecturer', label: 'Lecturer', enabled: true },
  { key: 'room', label: 'Room', enabled: true },
  { key: 'mode', label: 'Mode', enabled: true },
  { key: 'batch', label: 'Batch', enabled: true },
];

const DEFAULT_STATE: ScraperState = {
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

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && Boolean(chrome.storage?.local);
}

export async function saveScraperState(state: ScraperState): Promise<void> {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state });
  } catch (err) {
    console.error('[NIBM Exporter] Failed to save state:', err);
  }
}

export async function loadScraperState(): Promise<ScraperState> {
  if (!hasChromeStorage()) return DEFAULT_STATE;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.STATE);
    return result[STORAGE_KEYS.STATE] || DEFAULT_STATE;
  } catch (err) {
    console.error('[NIBM Exporter] Failed to load state:', err);
    return DEFAULT_STATE;
  }
}

export async function saveColumnPreferences(cols: ExportColumnOption[]): Promise<void> {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.COLUMN_PREFS]: cols });
  } catch (err) {
    console.error('[NIBM Exporter] Failed to save column prefs:', err);
  }
}

export async function loadColumnPreferences(): Promise<ExportColumnOption[]> {
  if (!hasChromeStorage()) return DEFAULT_COLUMNS;
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.COLUMN_PREFS);
    return result[STORAGE_KEYS.COLUMN_PREFS] || DEFAULT_COLUMNS;
  } catch {
    return DEFAULT_COLUMNS;
  }
}

export async function saveFilterPreferences(filters: Partial<ExportFilters>): Promise<void> {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.FILTER_PREFS]: filters });
  } catch (err) {
    console.error('[NIBM Exporter] Failed to save filter prefs:', err);
  }
}

export async function loadFilterPreferences(): Promise<Partial<ExportFilters>> {
  if (!hasChromeStorage()) return {};
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.FILTER_PREFS);
    return result[STORAGE_KEYS.FILTER_PREFS] || {};
  } catch {
    return {};
  }
}

export async function clearAllLocalData(): Promise<void> {
  if (!hasChromeStorage()) return;
  try {
    await chrome.storage.local.remove([STORAGE_KEYS.STATE]);
  } catch (err) {
    console.error('[NIBM Exporter] Failed to clear local data:', err);
  }
}
