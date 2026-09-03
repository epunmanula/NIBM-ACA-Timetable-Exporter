/**
 * NIBM ACA Timetable Exporter - Data Normalizer & Deduplication Engine
 */

import {
  TimetableEvent,
  ExtractionSummary,
  KNOWN_TYPES,
  LectureMode,
} from '../types/timetable';

/**
 * Normalizes event type code and resolves human-friendly label and mode.
 */
export function resolveTypeInfo(rawType: string): {
  normalizedCode: string;
  typeLabel: string;
  mode: LectureMode;
} {
  const clean = (rawType || '').trim().toUpperCase();

  if (!clean) {
    return {
      normalizedCode: '',
      typeLabel: '',
      mode: 'Unknown',
    };
  }

  // Check full phrases first (e.g. "LECTURE PHYSICAL", "LECTURE ONLINE", "TUTORIAL")
  if (clean.includes('LECTURE PHYSICAL') || clean.includes('LECTURE (PHYSICAL)')) {
    return { normalizedCode: 'LP', typeLabel: KNOWN_TYPES.LP.label, mode: 'Physical' };
  }
  if (clean.includes('LECTURE ONLINE') || clean.includes('LECTURE (ONLINE)')) {
    return { normalizedCode: 'LO', typeLabel: KNOWN_TYPES.LO.label, mode: 'Online' };
  }
  if (clean.includes('TUTORIAL')) {
    return { normalizedCode: 'TU', typeLabel: KNOWN_TYPES.TU.label, mode: 'Physical' };
  }
  if (clean.includes('PRACTICAL')) {
    return { normalizedCode: 'PC', typeLabel: KNOWN_TYPES.PC.label, mode: 'Physical' };
  }
  if (clean.includes('SEMINAR')) {
    return { normalizedCode: 'SM', typeLabel: KNOWN_TYPES.SM.label, mode: 'Physical' };
  }
  if (clean.includes('WORKSHOP')) {
    return { normalizedCode: 'WS', typeLabel: KNOWN_TYPES.WS.label, mode: 'Physical' };
  }
  if (clean.includes('EXAM')) {
    return { normalizedCode: 'EX', typeLabel: KNOWN_TYPES.EX.label, mode: 'Physical' };
  }
  if (clean.includes('VIVA')) {
    return { normalizedCode: 'VV', typeLabel: KNOWN_TYPES.VV.label, mode: 'Physical' };
  }
  if (clean.includes('PRESENTATION')) {
    return { normalizedCode: 'PR', typeLabel: KNOWN_TYPES.PR.label, mode: 'Physical' };
  }
  if (clean.includes('COURSE WORK') || clean.includes('COURSEWORK')) {
    return { normalizedCode: 'CW', typeLabel: KNOWN_TYPES.CW.label, mode: 'Unknown' };
  }
  if (clean.includes('LAB')) {
    return { normalizedCode: 'LB', typeLabel: KNOWN_TYPES.LB.label, mode: 'Physical' };
  }

  // Exact 2-letter match
  if (KNOWN_TYPES[clean]) {
    return {
      normalizedCode: clean,
      typeLabel: KNOWN_TYPES[clean].label,
      mode: KNOWN_TYPES[clean].mode,
    };
  }

  // Check if string contains known code (e.g. "[LP] Lecture" or "LP - Lecture")
  for (const [code, info] of Object.entries(KNOWN_TYPES)) {
    const pattern = new RegExp(`(^|\\b|\\[)${code}(\\b|\\]|$)`, 'i');
    if (pattern.test(clean)) {
      return {
        normalizedCode: code,
        typeLabel: info.label,
        mode: info.mode,
      };
    }
  }

  // Check for common words
  const lower = rawType.toLowerCase();
  let mode: LectureMode = 'Unknown';
  if (lower.includes('online') || lower.includes('zoom') || lower.includes('teams')) {
    mode = 'Online';
  } else if (lower.includes('physical') || lower.includes('hall') || lower.includes('campus')) {
    mode = 'Physical';
  }

  return {
    normalizedCode: clean.length <= 4 ? clean : clean.slice(0, 4),
    typeLabel: rawType.trim(),
    mode,
  };
}

/**
 * Standardize time string into 24-hour HH:mm format.
 * Supports: "08:30", "8:30", "8.30 AM", "14:00", "02:00 PM", "8:30am - 10:30am"
 */
export function normalizeTimeString(timeStr: string): string {
  if (!timeStr) return '';
  const clean = timeStr.trim();

  // Match 12-hour pattern (e.g. "9:00 AM", "09:00am", "12.30 PM")
  const match12 = clean.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i);
  if (match12) {
    let hour = parseInt(match12[1], 10);
    const minute = match12[2];
    const modifier = match12[3] ? match12[3].toLowerCase() : null;

    if (modifier === 'pm' && hour < 12) hour += 12;
    if (modifier === 'am' && hour === 12) hour = 0;

    const hh = hour.toString().padStart(2, '0');
    return `${hh}:${minute}`;
  }

  // Simple 24-hour pattern (e.g. "14:30")
  const match24 = clean.match(/^(\d{1,2})[:.](\d{2})$/);
  if (match24) {
    const hh = parseInt(match24[1], 10).toString().padStart(2, '0');
    const mm = match24[2];
    return `${hh}:${mm}`;
  }

  // Embedded time pattern (e.g. "9:00 AM – 12:00 PM")
  const matchEmbed = clean.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
  if (matchEmbed && (matchEmbed[0].includes(':') || matchEmbed[0].includes('.'))) {
    let hour = parseInt(matchEmbed[1], 10);
    const minute = matchEmbed[2];
    const modifier = matchEmbed[3] ? matchEmbed[3].toLowerCase() : null;

    if (modifier === 'pm' && hour < 12) hour += 12;
    if (modifier === 'am' && hour === 12) hour = 0;

    const hh = hour.toString().padStart(2, '0');
    return `${hh}:${minute}`;
  }

  // If input is not a valid time string, do NOT return raw text!
  return '';
}

/**
 * Merges rich details from an active modal into an existing list of events.
 */
export function mergeModalIntoEvents(
  events: TimetableEvent[],
  modal: Partial<TimetableEvent>
): boolean {
  if (!modal || !modal.date) return false;

  const target = events.find((e) => {
    if (e.date !== modal.date) return false;
    if (modal.courseCode && e.courseCode && e.courseCode !== modal.courseCode) return false;
    if (modal.type && e.type && e.type !== modal.type) return false;
    return true;
  });

  if (target) {
    if (modal.startTime) target.startTime = modal.startTime;
    if (modal.endTime) target.endTime = modal.endTime;
    if (modal.lecturer) target.lecturer = modal.lecturer;
    if (modal.room) target.room = modal.room;
    if (modal.type) target.type = modal.type;
    if (modal.typeLabel) target.typeLabel = modal.typeLabel;
    if (modal.mode && modal.mode !== 'Unknown') target.mode = modal.mode;
    return true;
  }
  return false;
}

/**
 * Parses a combined time range like "08:30 - 10:30" or "8.30 AM to 10.30 AM"
 */
export function parseTimeRange(timeRangeStr: string): { startTime: string; endTime: string } {
  if (!timeRangeStr) return { startTime: '', endTime: '' };

  const parts = timeRangeStr.split(/[-–—~]|to/i).map((p) => p.trim());
  if (parts.length >= 2) {
    return {
      startTime: normalizeTimeString(parts[0]),
      endTime: normalizeTimeString(parts[1]),
    };
  }

  return {
    startTime: normalizeTimeString(parts[0] || ''),
    endTime: '',
  };
}

/**
 * Formats year, month, day into YYYY-MM-DD
 */
export function formatISODate(year: number, month: number, day: number): string {
  const y = year.toString();
  const m = month.toString().padStart(2, '0');
  const d = day.toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Returns Day of Week string for YYYY-MM-DD date.
 */
export function getDayOfWeekName(dateStr: string): string {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return '';
  const [y, m, d] = dateStr.split('-').map(Number);
  // Construct date in local timezone to avoid UTC shifts
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Simple 32-bit stable hash function for string fingerprints.
 */
export function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Generates a stable internal fingerprint for deduplication.
 */
export function generateEventFingerprint(ev: Partial<TimetableEvent>): string {
  const course = (ev.courseCode || ev.courseName || '').toUpperCase().trim();
  const key = [
    ev.date || '',
    ev.startTime || '',
    ev.endTime || '',
    (ev.type || '').toUpperCase(),
    course,
    (ev.room || '').toLowerCase().trim(),
    (ev.lecturer || '').toLowerCase().trim(),
    (ev.batch || '').toUpperCase().trim(),
  ].join('|');

  return `ev_${hashString(key)}`;
}

/**
 * Normalizes a raw extracted event record.
 * Never invents missing data.
 */
export function normalizeEvent(
  raw: Partial<TimetableEvent>,
  defaultBatch = '',
  defaultDate = ''
): TimetableEvent {
  const date = raw.date ? raw.date.trim() : defaultDate;
  const dayOfWeek = raw.dayOfWeek || getDayOfWeekName(date);

  const rawTimeRange = raw.startTime && raw.endTime ? '' : raw.rawText || '';
  let startTime = normalizeTimeString(raw.startTime || '');
  let endTime = normalizeTimeString(raw.endTime || '');

  if ((!startTime || !endTime) && rawTimeRange) {
    const parsed = parseTimeRange(rawTimeRange);
    if (!startTime && parsed.startTime) startTime = parsed.startTime;
    if (!endTime && parsed.endTime) endTime = parsed.endTime;
  }

  const { normalizedCode, typeLabel, mode } = resolveTypeInfo(raw.type || '');
  const courseCode = (raw.courseCode || '').trim();
  const courseName = (raw.courseName || '').trim();
  const lecturer = (raw.lecturer || '').trim();
  const room = (raw.room || '').trim();
  const batch = (raw.batch || defaultBatch || '').trim();
  const source = raw.source || 'dom';

  const eventData: TimetableEvent = {
    id: raw.id || '',
    date,
    dayOfWeek,
    startTime,
    endTime,
    type: normalizedCode,
    typeLabel,
    courseCode,
    courseName,
    lecturer,
    room,
    mode: raw.mode || mode,
    batch,
    source,
    rawText: raw.rawText || '',
  };

  if (!eventData.id) {
    eventData.id = generateEventFingerprint(eventData);
  }

  return eventData;
}

/**
 * Deduplicate events and merge richer metadata if duplicates exist.
 * Handles both identical duplicate DOM elements and partial duplicates (e.g. mobile vs desktop renderings).
 */
export function deduplicateEvents(events: TimetableEvent[]): {
  uniqueEvents: TimetableEvent[];
  duplicatesRemoved: number;
} {
  const result: TimetableEvent[] = [];
  let duplicatesRemoved = 0;

  for (const ev of events) {
    const course = (ev.courseCode || ev.courseName || '').toUpperCase().trim();
    const evRoom = (ev.room || '').toLowerCase().trim();
    const evLec = (ev.lecturer || '').toLowerCase().trim();

    // Check if there is an exact duplicate (exact same time or duplicate capture of the same card)
    const existingIndex = result.findIndex((item) => {
      const itemCourse = (item.courseCode || item.courseName || '').toUpperCase().trim();
      const itemRoom = (item.room || '').toLowerCase().trim();
      const itemLec = (item.lecturer || '').toLowerCase().trim();

      const sameDateAndType =
        item.date === ev.date &&
        (item.type || '').toUpperCase() === (ev.type || '').toUpperCase() &&
        (itemCourse === course || !itemCourse || !course);

      if (!sameDateAndType) return false;

      // If both have start times: duplicate only if times match
      if (item.startTime && ev.startTime) {
        return item.startTime === ev.startTime && item.endTime === ev.endTime;
      }

      // If one has details and the other has empty details for the EXACT same slot
      if ((item.startTime || itemRoom || itemLec) && !ev.startTime && !evRoom && !evLec) {
        return true; // merge with existing
      }
      if (!item.startTime && !itemRoom && !itemLec && (ev.startTime || evRoom || evLec)) {
        return true; // merge with existing
      }

      return false;
    });

    if (existingIndex !== -1) {
      duplicatesRemoved++;
      const existing = result[existingIndex];
      result[existingIndex] = {
        ...existing,
        startTime: existing.startTime || ev.startTime,
        endTime: existing.endTime || ev.endTime,
        courseCode: existing.courseCode || ev.courseCode,
        courseName: existing.courseName || ev.courseName,
        lecturer: existing.lecturer || ev.lecturer,
        room: existing.room || ev.room,
        batch: existing.batch || ev.batch,
        typeLabel: existing.typeLabel || ev.typeLabel,
        mode: existing.mode !== 'Unknown' ? existing.mode : ev.mode,
      };
    } else {
      result.push({ ...ev, id: ev.id || generateEventFingerprint(ev) });
    }
  }

  result.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.startTime.localeCompare(b.startTime);
  });

  return { uniqueEvents: result, duplicatesRemoved };
}

/**
 * Computes missing fields count and summary statistics.
 */
export function computeSummary(
  events: TimetableEvent[],
  duplicatesRemoved: number,
  strategy: ExtractionSummary['strategyUsed'] = 'dom'
): ExtractionSummary {
  const missing = {
    startTime: 0,
    endTime: 0,
    type: 0,
    courseCode: 0,
    courseName: 0,
    lecturer: 0,
    room: 0,
  };

  let missingFieldsCount = 0;

  for (const ev of events) {
    if (!ev.startTime) {
      missing.startTime++;
      missingFieldsCount++;
    }
    if (!ev.endTime) {
      missing.endTime++;
      missingFieldsCount++;
    }
    if (!ev.type) {
      missing.type++;
      missingFieldsCount++;
    }
    if (!ev.courseCode) {
      missing.courseCode++;
      missingFieldsCount++;
    }
    if (!ev.courseName) {
      missing.courseName++;
      missingFieldsCount++;
    }
    if (!ev.lecturer) {
      missing.lecturer++;
      missingFieldsCount++;
    }
    if (!ev.room) {
      missing.room++;
      missingFieldsCount++;
    }
  }

  return {
    totalFound: events.length + duplicatesRemoved,
    uniqueCount: events.length,
    duplicatesRemoved,
    missingFieldsCount,
    missingFieldsBreakdown: missing,
    strategyUsed: strategy,
    lastScannedAt: new Date().toLocaleTimeString('en-LK', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }),
  };
}
