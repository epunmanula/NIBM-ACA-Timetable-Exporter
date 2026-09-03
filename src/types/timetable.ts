/**
 * NIBM ACA Timetable Exporter - Data Types and Interfaces
 */

export type LectureMode = 'Physical' | 'Online' | 'Hybrid' | 'Unknown';

export type CalendarViewType = 'month' | 'week' | 'day' | 'unknown';

export type ExtractionSource = 'dom' | 'api' | 'manual';

export interface TimetableEvent {
  id: string; // Stable fingerprint hash
  date: string; // YYYY-MM-DD (Sri Lanka local date)
  dayOfWeek: string; // Monday, Tuesday, etc.
  startTime: string; // HH:mm (24h)
  endTime: string; // HH:mm (24h)
  type: string; // LP, LO, TU, LB, SM, WS, EX, VV, PR, CW, PC, etc.
  typeLabel: string; // "Lecture (Physical)", "Lecture (Online)", etc.
  courseCode: string; // e.g. "DSE501"
  courseName: string; // e.g. "Software Architecture"
  lecturer: string; // e.g. "Dr. Perera"
  room: string; // e.g. "Hall 4A"
  mode: LectureMode;
  batch: string; // e.g. "DSE241FT"
  source: ExtractionSource;
  rawText?: string; // Captured text snippet for debugging
}

export interface CalendarContext {
  connected: boolean;
  view: CalendarViewType;
  year: number;
  month: number; // 1 - 12
  periodLabel: string; // e.g. "September 2026"
  batch: string; // e.g. "DSE241FT"
  batchId?: string; // Internal UUID if present in URL
  url: string;
  lastScannedAt?: string;
}

export interface ExtractionSummary {
  totalFound: number;
  uniqueCount: number;
  duplicatesRemoved: number;
  missingFieldsCount: number;
  missingFieldsBreakdown: {
    startTime: number;
    endTime: number;
    type: number;
    courseCode: number;
    courseName: number;
    lecturer: number;
    room: number;
  };
  strategyUsed: 'dom' | 'api' | 'hybrid' | 'manual' | 'none';
  lastScannedAt: string;
}

export interface ScraperState {
  context: CalendarContext;
  events: TimetableEvent[];
  summary: ExtractionSummary;
  autoRefresh: boolean;
  debugMode: boolean;
  error?: string;
}

export interface ExportColumnOption {
  key: keyof TimetableEvent;
  label: string;
  enabled: boolean;
}

export interface ExportFilters {
  dateFrom: string;
  dateTo: string;
  selectedTypes: string[];
  courseFilter: string;
  searchQuery: string;
}

export interface KnownTypeInfo {
  label: string;
  mode: LectureMode;
}

export const KNOWN_TYPES: Record<string, KnownTypeInfo> = {
  LP: { label: 'Lecture (Physical)', mode: 'Physical' },
  LO: { label: 'Lecture (Online)', mode: 'Online' },
  TU: { label: 'Tutorial', mode: 'Physical' },
  LB: { label: 'Lab', mode: 'Physical' },
  SM: { label: 'Seminar', mode: 'Physical' },
  WS: { label: 'Workshop', mode: 'Physical' },
  EX: { label: 'Exam', mode: 'Physical' },
  VV: { label: 'Viva', mode: 'Physical' },
  PR: { label: 'Presentation', mode: 'Physical' },
  CW: { label: 'Course Work', mode: 'Unknown' },
  PC: { label: 'Practical', mode: 'Physical' },
};

export type MessageAction =
  | 'PING'
  | 'SCAN_PAGE'
  | 'GET_STATE'
  | 'STATE_UPDATE'
  | 'API_DATA_CAPTURED'
  | 'TOGGLE_AUTO_REFRESH'
  | 'SET_DEBUG_MODE'
  | 'CLEAR_DATA';

export interface ExtensionMessage<T = unknown> {
  action: MessageAction;
  payload?: T;
}
