/**
 * NIBM ACA Timetable Exporter - Content Script API Interceptor Coordinator
 */

import { TimetableEvent } from '../types/timetable';
import { normalizeEvent, normalizeTimeString } from './normalizer';

export type ApiDataCallback = (events: TimetableEvent[], rawSource: string) => void;

/**
 * Extracts a local YYYY-MM-DD date and HH:mm time from ISO or date string.
 * Uses Sri Lanka / local representation.
 */
function parseApiDateTime(dtStr?: string): { date: string; time: string } {
  if (!dtStr) return { date: '', time: '' };

  try {
    // If format is like "2026-09-01T08:30:00" or similar
    const dt = new Date(dtStr);
    if (!isNaN(dt.getTime())) {
      const year = dt.getFullYear();
      const month = (dt.getMonth() + 1).toString().padStart(2, '0');
      const day = dt.getDate().toString().padStart(2, '0');
      const hours = dt.getHours().toString().padStart(2, '0');
      const minutes = dt.getMinutes().toString().padStart(2, '0');

      return {
        date: `${year}-${month}-${day}`,
        time: `${hours}:${minutes}`,
      };
    }
  } catch {
    // Fallback regex parsing
  }

  const match = dtStr.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})/);
  if (match) {
    return {
      date: match[1],
      time: normalizeTimeString(match[2]),
    };
  }

  return { date: '', time: '' };
}

/**
 * Safely inspects unknown JSON payloads to find array of lecture/timetable records.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseApiPayload(payload: any, defaultBatch = ''): TimetableEvent[] {
  if (!payload) return [];

  // Find candidate array
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let items: any[] = [];
  if (Array.isArray(payload)) {
    items = payload;
  } else if (typeof payload === 'object') {
    if (Array.isArray(payload.lectures)) items = payload.lectures;
    else if (Array.isArray(payload.events)) items = payload.events;
    else if (Array.isArray(payload.data)) items = payload.data;
    else if (Array.isArray(payload.schedule)) items = payload.schedule;
    else if (Array.isArray(payload.items)) items = payload.items;
  }

  const parsedEvents: TimetableEvent[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') continue;

    // Dates and Times
    const startObj = parseApiDateTime(item.startAt || item.startTime || item.start || item.from);
    const endObj = parseApiDateTime(item.endAt || item.endTime || item.end || item.to);

    const date = item.date || startObj.date || '';
    const startTime = startObj.time || normalizeTimeString(item.startTime || '');
    const endTime = endObj.time || normalizeTimeString(item.endTime || '');

    // Type
    const type = item.type || item.lectureType || item.eventType || item.code || '';

    // Course
    const courseCode =
      item.courseCode ||
      item.moduleCode ||
      item.subjectCode ||
      item.module?.code ||
      item.course?.code ||
      '';
    const courseName =
      item.courseName ||
      item.moduleName ||
      item.subjectName ||
      item.module?.name ||
      item.course?.name ||
      item.title ||
      '';

    // Lecturer
    const lecturer =
      item.lecturer ||
      item.lecturerName ||
      item.lecturer?.name ||
      item.staff ||
      item.teacher ||
      '';

    // Room
    const room =
      item.room ||
      item.roomName ||
      item.hall ||
      item.hallName ||
      item.venue ||
      item.location ||
      '';

    // Batch
    const batch = item.batch || item.batchCode || item.batchName || defaultBatch || '';

    // Only include if it has at least some timetable-like data
    if (date || startTime || courseCode || courseName || type) {
      const normalized = normalizeEvent(
        {
          date,
          startTime,
          endTime,
          type,
          courseCode,
          courseName,
          lecturer,
          room,
          batch,
          source: 'api',
        },
        defaultBatch,
        date
      );
      parsedEvents.push(normalized);
    }
  }

  return parsedEvents;
}

/**
 * Initializes listener and injects page interceptor script into the host document.
 */
export function setupApiInterceptor(callback: ApiDataCallback): () => void {
  // Inject script into page context
  try {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/page-interceptor.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  } catch (err) {
    // If extension context or permissions prohibit injection, DOM scraper will serve as primary
    console.debug('[NIBM Exporter] Page interceptor injection skipped:', err);
  }

  // Handle incoming postMessages
  const messageHandler = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (!event.data || event.data.type !== 'NIBM_ACA_API_INTERCEPTED') return;

    try {
      const events = parseApiPayload(event.data.payload);
      if (events.length > 0) {
        callback(events, event.data.sourceUrl || 'api');
      }
    } catch {
      // Safe fallback
    }
  };

  window.addEventListener('message', messageHandler);

  return () => {
    window.removeEventListener('message', messageHandler);
  };
}
