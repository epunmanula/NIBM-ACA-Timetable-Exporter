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
 * Resolves current calendar heading text (e.g. "September 2026", "December 2026").
 */
export function getCalendarHeading(doc: Document = document): string {
  const headings = doc.querySelectorAll(
    'h1, h2, h3, h4, [class*="title"], [class*="heading"], header span, span, div, p'
  );

  for (const el of Array.from(headings)) {
    if (el.children.length > 2) continue;
    const txt = (el.textContent || '').trim();
    for (const m of MONTH_NAMES) {
      const match = txt.match(new RegExp(`\\b(${m}\\s+20\\d\\d)\\b`, 'i'));
      if (match) {
        return match[1];
      }
    }
  }

  // Fallback: search body text
  const bodyText = doc.body?.textContent || '';
  for (const m of MONTH_NAMES) {
    const match = bodyText.match(new RegExp(`\\b(${m}\\s+20\\d\\d)\\b`, 'i'));
    if (match) {
      return match[1];
    }
  }

  return '';
}

/**
 * Extracts month (1-12) and year from calendar heading text (e.g. "December 2026").
 */
export function parseHeadingMonthYear(headingText: string): { year: number; month: number } | null {
  for (let i = 0; i < MONTH_NAMES.length; i++) {
    const m = MONTH_NAMES[i];
    const match = headingText.match(new RegExp(`\\b${m}\\s+(20\\d\\d)\\b`, 'i'));
    if (match) {
      return {
        year: parseInt(match[1], 10),
        month: i + 1,
      };
    }
  }
  return null;
}

/**
 * Checks if a cell element has indicators of being outside current month.
 */
export function isCellOutsideMonth(el: Element): boolean {
  const check = `${el.className || ''} ${el.getAttribute('data-state') || ''}`.toLowerCase();
  const outsideKeywords = [
    'outside',
    'other-month',
    'prev-month',
    'next-month',
    'muted',
    'opacity-40',
    'opacity-50',
    'text-gray-300',
    'text-gray-400',
    'day-outside',
    'disabled',
  ];
  return outsideKeywords.some((kw) => check.includes(kw));
}

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
  let month = parseInt(params.get('month') || '', 10);

  // Look for visible month/year heading (e.g. "December 2026")
  let periodLabel = getCalendarHeading(doc);
  if (periodLabel) {
    const parsed = parseHeadingMonthYear(periodLabel);
    if (parsed) {
      year = parsed.year;
      month = parsed.month;
    }
  }

  // If month header not found, fall back to URL or current date
  const now = new Date();
  if (!year || isNaN(year)) year = now.getFullYear();

  if (params.has('month')) {
    // ACA / Next.js URL query parameter month is 0-indexed (0 = Jan, 11 = Dec)
    const rawM = parseInt(params.get('month') || '', 10);
    if (!isNaN(rawM) && !periodLabel) {
      month = rawM >= 0 && rawM <= 11 ? rawM + 1 : rawM;
    }
  }

  if (!month || isNaN(month)) {
    month = now.getMonth() + 1;
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
 * Resolves the calendar date (YYYY-MM-DD) for a specific card element by inspecting
 * attributes, parent cell structure, and nearby numeric day indicators.
 */
export function findDateForCard(cardEl: Element, activeContext: CalendarContext): string {
  // 1. Direct or ancestor data-date / data-day attribute
  let curr: Element | null = cardEl;
  for (let depth = 0; depth < 8 && curr; depth++) {
    if (curr === curr.ownerDocument?.body || curr.tagName === 'MAIN') break;
    const dt = curr.getAttribute('data-date') || curr.getAttribute('data-day');
    if (dt && /^\d{4}-\d{2}-\d{2}$/.test(dt)) {
      return dt;
    }
    curr = curr.parentElement;
  }

  // 2. Search ancestor cell for calendar day number
  curr = cardEl.parentElement;
  for (let depth = 0; depth < 8 && curr; depth++) {
    if (curr === curr.ownerDocument?.body || curr.tagName === 'MAIN') break;

    // Find leaf descendant elements inside curr that are NOT inside cardEl
    const allDesc = Array.from(curr.querySelectorAll('*'));
    for (const desc of allDesc) {
      if (desc === cardEl || cardEl.contains(desc)) continue;
      if (desc.children.length > 0) continue;
      const text = getElementCleanText(desc);

      // Exact day number 1 to 31
      if (/^([1-9]|[12]\d|3[01])$/.test(text)) {
        const dayNum = parseInt(text, 10);
        const isOutside = isCellOutsideMonth(curr);
        return resolveCellDate(dayNum, isOutside, 15, activeContext);
      }

      // Day number with day name e.g. "Mon 7" or "Tue 8"
      const dayMatch = text.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+([1-9]|[12]\d|3[01])$/i);
      if (dayMatch) {
        const dayNum = parseInt(dayMatch[1], 10);
        const isOutside = isCellOutsideMonth(curr);
        return resolveCellDate(dayNum, isOutside, 15, activeContext);
      }
    }

    // Check if curr text starts with day number e.g. "7 LP OS"
    const currText = getElementCleanText(curr);
    const startMatch = currText.match(/^([1-9]|[12]\d|3[01])\b/);
    if (startMatch) {
      const dayNum = parseInt(startMatch[1], 10);
      const isOutside = isCellOutsideMonth(curr);
      return resolveCellDate(dayNum, isOutside, 15, activeContext);
    }

    curr = curr.parentElement;
  }

  return '';
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
        // 3. Try ampersand codes: e.g. "DL & CO"
        const ampersandMatch = rawText.match(/\b([A-Za-z0-9]{2,5}\s*&\s*[A-Za-z0-9]{2,5})\b/i);
        if (ampersandMatch) {
          courseCode = ampersandMatch[1].toUpperCase();
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
