/**
 * NIBM ACA Timetable Exporter - Calendar & DOM Parsing Engine
 */

import {
  CalendarContext,
  CalendarViewType,
  TimetableEvent,
} from '../types/timetable';
import {
  formatISODate,
  getDayOfWeekName,
  normalizeTimeString,
  parseTimeRange,
  resolveTypeInfo,
} from './normalizer';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Extracts context (view, year, month, batch, period) from URL and visible DOM.
 */
export function extractPageContext(doc: Document = document, currentUrl: string = window.location.href): CalendarContext {
  const urlObj = new URL(currentUrl);
  const params = urlObj.searchParams;

  // View detection
  let view: CalendarViewType = 'unknown';
  const urlView = (params.get('view') || '').toLowerCase();
  if (urlView === 'month' || urlView === 'week' || urlView === 'day') {
    view = urlView as CalendarViewType;
  } else {
    // Check visible active view buttons
    const activeBtn = doc.querySelector(
      '[aria-selected="true"], button[class*="active"], button[data-state="active"]'
    );
    const btnText = (activeBtn?.textContent || '').toLowerCase();
    if (btnText.includes('month')) view = 'month';
    else if (btnText.includes('week')) view = 'week';
    else if (btnText.includes('day')) view = 'day';
    else view = 'month'; // Default ACA calendar view
  }

  // Detect Batch
  let batch = '';
  const batchId = params.get('batch') || undefined;

  // Strategy A: Visible batch selector / badge (e.g. "DSE241FT", "DSE262FT")
  const batchRegex = /\b([A-Z]{2,5}\d{2,4}[A-Z\d]*)\b/;
  const batchElements = doc.querySelectorAll(
    '[data-testid*="batch"], [class*="batch"], [aria-label*="batch"], button, select, h1, h2, h3, header span, .dropdown-trigger'
  );

  for (const el of Array.from(batchElements)) {
    const text = el.textContent || '';
    const match = text.match(batchRegex);
    if (match && match[1]) {
      // Ignore common non-batch keywords
      if (!['BATCH', 'STUDENT', 'MONTH', 'WEEK', 'NIBM'].includes(match[1])) {
        batch = match[1];
        break;
      }
    }
  }

  // Fallback: Check select element value or text
  if (!batch) {
    const select = doc.querySelector('select');
    if (select && select.selectedOptions && select.selectedOptions[0]) {
      const optText = select.selectedOptions[0].textContent?.trim() || '';
      const m = optText.match(batchRegex);
      if (m) batch = m[1];
    }
  }

  // Strategy B: URL param or placeholder if only UUID exists
  if (!batch && batchId) {
    batch = `Batch-${batchId.slice(0, 8)}`;
  } else if (!batch) {
    batch = 'Default Batch';
  }

  // Year & Month Detection
  let year = parseInt(params.get('year') || '', 10);
  let month = parseInt(params.get('month') || '', 10); // Check if 0-based or 1-based

  // Look for visible month/year heading (e.g. "September 2026" or "2026 September")
  let periodLabel = '';
  const headingElements = doc.querySelectorAll(
    'h1, h2, h3, h4, [class*="title"], [class*="heading"], [class*="calendar-header"], [data-testid*="calendar-header"]'
  );

  for (const el of Array.from(headingElements)) {
    const txt = (el.textContent || '').trim();
    for (let mIndex = 0; mIndex < MONTH_NAMES.length; mIndex++) {
      const mName = MONTH_NAMES[mIndex];
      if (txt.includes(mName)) {
        const yMatch = txt.match(/\b(20\d\d)\b/);
        if (yMatch) {
          year = parseInt(yMatch[1], 10);
          month = mIndex + 1; // 1-indexed for standard representations
          periodLabel = `${mName} ${year}`;
          break;
        }
      }
    }
    if (periodLabel) break;
  }

  // If month header not found, fall back to URL or current date
  const now = new Date();
  if (!year || isNaN(year)) year = now.getFullYear();
  if (!month || isNaN(month)) {
    month = now.getMonth() + 1;
  } else if (month <= 11 && params.has('month')) {
    // In many Next.js calendar query params: month=8 means 8 (if 0-indexed = Sept) or August.
    // If URL has month=8 and heading says September, month was 8 (0-indexed).
    // If no heading was found, assume URL month could be 0-11 if <= 11 and user navigated.
    if (!periodLabel) {
      // Default to 1-indexed unless 0 is present
      const mVal = month;
      month = mVal >= 1 && mVal <= 12 ? mVal : (mVal + 1);
    }
  }

  if (!periodLabel) {
    const mName = MONTH_NAMES[(month - 1 + 12) % 12];
    periodLabel = `${mName} ${year}`;
  }

  const isAcaDomain =
    urlObj.hostname === 'aca.mynibm.com' ||
    urlObj.hostname.endsWith('.mynibm.com') ||
    urlObj.href.includes('aca.mynibm.com');

  return {
    connected: isAcaDomain,
    view,
    year,
    month,
    periodLabel,
    batch,
    batchId,
    url: currentUrl,
  };
}

/**
 * Parses date string or day number within calendar context.
 * Handles month boundaries (days from preceding or succeeding months).
 */
export function resolveCellDate(
  dayNum: number,
  isOutsideMonth: boolean,
  cellIndex: number,
  context: CalendarContext
): string {
  let { year, month } = context;

  if (isOutsideMonth) {
    // If cell index is in the early part of the grid (< 14) and day number is high (e.g. 28-31),
    // it belongs to the PREVIOUS month.
    if (cellIndex < 14 && dayNum > 15) {
      month -= 1;
      if (month < 1) {
        month = 12;
        year -= 1;
      }
    }
    // If cell index is in the later part of the grid (> 20) and day number is low (e.g. 1-14),
    // it belongs to the NEXT month.
    else if (cellIndex > 20 && dayNum < 15) {
      month += 1;
      if (month > 12) {
        month = 1;
        year += 1;
      }
    }
  }

  return formatISODate(year, month, dayNum);
}

/**
 * Helper to extract text from an element while ignoring script/style tags.
 */
export function getElementCleanText(el: Element): string {
  if ('innerText' in el && typeof (el as HTMLElement).innerText === 'string') {
    const it = (el as HTMLElement).innerText;
    if (it) return it.replace(/\s+/g, ' ').trim();
  }

  const clone = el.cloneNode(true) as Element;
  const junk = clone.querySelectorAll('script, style, noscript, svg');
  junk.forEach((j) => j.remove());

  // Insert space after child elements so adjacent tags don't concatenate words (e.g. <span>LP</span><span>MC</span> -> "LP MC")
  const allChildren = clone.querySelectorAll('*');
  allChildren.forEach((child) => {
    child.insertAdjacentText('afterend', ' ');
  });

  return (clone.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * Extracts event metadata from an event card or cell text content defensively.
 */
export function parseEventCard(
  cardEl: Element,
  resolvedDate: string,
  context: CalendarContext
): Partial<TimetableEvent> {
  const baseText = getElementCleanText(cardEl);
  const titleAttr = cardEl.getAttribute('title') || '';
  const ariaAttr = cardEl.getAttribute('aria-label') || '';
  const rawText = `${baseText} ${titleAttr} ${ariaAttr}`.replace(/\s+/g, ' ').trim();

  // Check data attributes first
  const attrType = cardEl.getAttribute('data-type') || cardEl.getAttribute('data-event-type');
  const attrCourse = cardEl.getAttribute('data-course') || cardEl.getAttribute('data-course-code');
  const attrRoom = cardEl.getAttribute('data-room') || cardEl.getAttribute('data-hall');
  const attrLecturer = cardEl.getAttribute('data-lecturer');
  const attrTime = cardEl.getAttribute('data-time') || cardEl.getAttribute('data-time-range');

  // Type extraction
  let eventType = attrType || '';
  if (!eventType) {
    // Look for 2-letter type pills or text like "[LP]", "LP", "LO", "TU", etc.
    const pill = cardEl.querySelector('[class*="type"], [class*="badge"], [class*="tag"], span');
    const pillText = pill ? (pill.textContent || '').trim().toUpperCase() : '';
    if (pillText && resolveTypeInfo(pillText).normalizedCode) {
      eventType = pillText;
    } else {
      // Regex match anywhere in text
      const typeMatch = rawText.match(/\b(LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC)\b/i);
      if (typeMatch) {
        eventType = typeMatch[1].toUpperCase();
      }
    }
  }

  // Time extraction
  let startTime = '';
  let endTime = '';
  if (attrTime) {
    const parsed = parseTimeRange(attrTime);
    startTime = parsed.startTime;
    endTime = parsed.endTime;
  } else {
    // Look for time pattern: "08:30 - 10:30" or "8:30 AM - 10:30 AM" or "08:30-10:30"
    const timeMatch = rawText.match(
      /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:[-–—~]|to)\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i
    );
    if (timeMatch) {
      startTime = normalizeTimeString(timeMatch[1]);
      endTime = normalizeTimeString(timeMatch[2]);
    } else {
      // Single time fallback
      const singleTimeMatch = rawText.match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\b/i);
      if (singleTimeMatch) {
        startTime = normalizeTimeString(singleTimeMatch[1]);
      }
    }
  }

  // Course Code & Course Name extraction
  let courseCode = attrCourse || '';
  if (!courseCode) {
    const codeEl = cardEl.querySelector(
      '[class*="course-code"], [class*="module-code"], [class*="subject-code"], [class*="code"]'
    );
    if (codeEl) {
      courseCode = getElementCleanText(codeEl).replace(/\s+/g, '');
    }
  }
  if (!courseCode) {
    // 1. Try standard course code with digits: e.g. DSE501, CSE201, IT2020
    const codeMatch = rawText.match(/\b([A-Z]{2,5}[-\s]?\d{2,4})\b/);
    if (codeMatch) {
      courseCode = codeMatch[1].replace(/\s+/g, '');
    } else {
      // 2. Try hyphenated codes or short NIBM codes: e.g. "ECS - 1", "MC", "APF", "DBMS"
      const hyphenMatch = rawText.match(/\b([A-Z]{2,5}\s*-\s*\d{1,2})\b/);
      if (hyphenMatch) {
        courseCode = hyphenMatch[1].replace(/\s+/g, ' ');
      } else {
        const words = rawText.split(/[\s,–—~-]+/).map((w) => w.trim().toUpperCase());
        const IGNORE_WORDS = new Set([
          'LP', 'LO', 'TU', 'LB', 'SM', 'WS', 'EX', 'VV', 'PR', 'CW', 'PC',
          'AM', 'PM', 'HALL', 'LAB', 'ROOM', 'ONLINE', 'ZOOM', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'
        ]);
        for (const w of words) {
          if (/^[A-Z]{2,6}$/.test(w) && !IGNORE_WORDS.has(w) && w !== eventType) {
            courseCode = w;
            break;
          }
        }
      }
    }
  }

  // Lecturer extraction: check semantic child element first
  let lecturer = attrLecturer || '';
  if (!lecturer) {
    const lecEl = cardEl.querySelector(
      '[class*="lecturer"], [class*="teacher"], [class*="instructor"], [class*="staff"], [data-testid*="lecturer"]'
    );
    if (lecEl) {
      lecturer = getElementCleanText(lecEl);
    }
  }
  if (!lecturer) {
    // Regex match: Dr. / Prof. / Mr. / Ms. / Mrs. supporting Sri Lankan initials like "Ms W M A D Weerathunga"
    const lecMatch = rawText.match(
      /\b((?:Dr|Prof|Mr|Ms|Mrs)\.?\s+(?:[A-Z]\.?\s+)*[A-Z][a-z]+(?:\s+(?!(?:Hall|Lab|Room|LH|Audi|Online|Lecture)\b)[A-Z][a-z]+)?)\b/
    );
    if (lecMatch) {
      lecturer = lecMatch[1].trim();
    }
  }

  // Room extraction: check semantic child element first
  let room = attrRoom || '';
  if (!room) {
    const roomEl = cardEl.querySelector(
      '[class*="room"], [class*="hall"], [class*="venue"], [class*="location"], [data-testid*="room"]'
    );
    if (roomEl) {
      room = getElementCleanText(roomEl);
    }
  }
  if (!room) {
    // Regex match: "Lecture Hall 18 - 1st Fl", "Hall 4A", "Lab 2", "LH-1", etc.
    const roomMatch = rawText.match(
      /\b((?:Lecture\s+Hall|Hall|Lab|Room|LH|Audi|Auditorium)[-\s]?[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9\s]+)?)\b/i
    );
    if (roomMatch) {
      room = roomMatch[1].trim();
    } else if (rawText.toLowerCase().includes('online') || rawText.toLowerCase().includes('zoom')) {
      room = 'Online';
    }
  }

  // Course name extraction: check semantic child element first
  let courseName = '';
  const nameEl = cardEl.querySelector(
    '[class*="course-name"], [class*="module-name"], [class*="subject-name"], [class*="subject"], h4, h5, h6, strong, b'
  );
  if (nameEl) {
    const t = getElementCleanText(nameEl);
    if (t && t !== courseCode && t !== eventType && !t.includes(startTime) && t !== lecturer && t !== room) {
      courseName = t;
    }
  }

  // If courseName is still empty, inspect lines of text
  if (!courseName) {
    const lines = (cardEl.textContent || '')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 2);

    for (const line of lines) {
      if (
        line !== courseCode &&
        line !== eventType &&
        line !== lecturer &&
        line !== room &&
        !line.includes(startTime) &&
        !line.match(/^\d+$/)
      ) {
        courseName = line;
        break;
      }
    }
  }

  const { mode } = resolveTypeInfo(eventType);

  return {
    date: resolvedDate,
    dayOfWeek: getDayOfWeekName(resolvedDate),
    startTime,
    endTime,
    type: eventType,
    courseCode,
    courseName,
    lecturer,
    room,
    mode,
    batch: context.batch,
    source: 'dom',
    rawText,
  };
}
