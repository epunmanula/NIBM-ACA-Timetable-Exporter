/**
 * NIBM ACA Timetable Exporter - DOM Scraper Implementation
 */

import {
  CalendarContext,
  ExtractionSummary,
  TimetableEvent,
} from '../types/timetable';
import {
  extractPageContext,
  getElementCleanText,
  parseEventCard,
  resolveCellDate,
} from './calendar-parser';
import {
  computeSummary,
  deduplicateEvents,
  formatISODate,
  getDayOfWeekName,
  normalizeEvent,
  normalizeTimeString,
  resolveTypeInfo,
} from './normalizer';

export interface ScrapeResult {
  context: CalendarContext;
  events: TimetableEvent[];
  summary: ExtractionSummary;
  rawEventCount: number;
}

/**
 * Checks if an element or its ancestors have muted/outside-month indicators.
 */
function isCellOutsideCurrentMonth(el: Element): boolean {
  const checkString = `${el.className || ''} ${el.getAttribute('data-state') || ''}`.toLowerCase();
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

  return outsideKeywords.some((kw) => checkString.includes(kw));
}

/**
 * Strategy 1A: Month View Scraper
 */
function scrapeMonthView(doc: Document, context: CalendarContext): Partial<TimetableEvent>[] {
  const events: Partial<TimetableEvent>[] = [];

  // Look for cells in standard table or CSS grid
  const cellSelectors = [
    '[role="gridcell"]',
    'td[class*="day"]',
    'td',
    '[data-testid*="day-cell"]',
    '[data-testid*="calendar-day"]',
    'div[class*="calendar-day"]',
    'div[class*="day-cell"]',
    'div[class*="DayCell"]',
    'div[class*="calendar_cell"]',
    '.rbc-day-bg',
    '.fc-daygrid-day',
  ];

  let cells: Element[] = [];
  for (const selector of cellSelectors) {
    const found = Array.from(doc.querySelectorAll(selector));
    if (found.length >= 28) {
      cells = found;
      break;
    }
  }

  // Fallback: search for grid children that contain numeric day indicators
  if (cells.length === 0) {
    const grids = doc.querySelectorAll('[role="grid"], .grid, div[class*="grid"]');
    for (const grid of Array.from(grids)) {
      const children = Array.from(grid.children);
      if (children.length >= 28 && children.length <= 42) {
        cells = children;
        break;
      }
    }
  }

  cells.forEach((cell, index) => {
    // Determine cell day number
    let dayNum: number | null = null;
    const dateAttr = cell.getAttribute('data-date') || cell.getAttribute('data-day');

    let resolvedDate = '';
    if (dateAttr && /^\d{4}-\d{2}-\d{2}$/.test(dateAttr)) {
      resolvedDate = dateAttr;
    } else {
      // Search descendants for an exact day number (1 to 31)
      const allDesc = Array.from(cell.querySelectorAll('*'));
      for (const d of allDesc) {
        if (d.children.length > 0) continue;
        const t = getElementCleanText(d);
        if (/^([1-9]|[12]\d|3[01])$/.test(t)) {
          dayNum = parseInt(t, 10);
          break;
        }
      }

      // Check if cell start text has a day number
      if (dayNum === null) {
        const cleanCell = getElementCleanText(cell);
        const startMatch = cleanCell.match(/^([1-9]|[12]\d|3[01])\b/);
        if (startMatch) {
          dayNum = parseInt(startMatch[1], 10);
        }
      }

      if (dayNum !== null) {
        const isOutside = isCellOutsideCurrentMonth(cell);
        resolvedDate = resolveCellDate(dayNum, isOutside, index, context);
      }
    }

    if (!resolvedDate) return;

    // 1. Check structured cards first (e.g. .event-card, [class*="event-card"])
    const structuredCards = Array.from(
      cell.querySelectorAll('.event-card, [class*="event-card"]')
    );
    if (structuredCards.length > 0) {
      for (const card of structuredCards) {
        events.push(parseEventCard(card, resolvedDate, context));
      }
      return;
    }

    // 2. Otherwise look for compact badges (real ACA website: LP MC, LP APF, TU APF, LP DL & CO)
    const BADGE_REGEX = /\b(LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC)(?![a-z])\s*[-:]?\s*([A-Za-z0-9\s/&.-]{1,25})/i;
    const candidates = Array.from(cell.querySelectorAll('*')).filter((el) => {
      if (el.children.length > 2) return false;
      const t = getElementCleanText(el);
      return t.length >= 3 && t.length <= 40 && BADGE_REGEX.test(t);
    });

    const distinct = candidates.filter((el) => !Array.from(el.children).some((c) => candidates.includes(c)));

    if (distinct.length > 0) {
      for (const item of distinct) {
        const rawText = getElementCleanText(item);
        const match = rawText.match(BADGE_REGEX);
        if (!match) continue;

        const eventType = match[1].toUpperCase();
        let courseCode = match[2].trim();
        if (courseCode.startsWith('-')) courseCode = courseCode.slice(1).trim();

        const reactProps = extractReactPropsFromElement(item);
        const { mode, typeLabel } = resolveTypeInfo(eventType);

        events.push({
          date: resolvedDate,
          dayOfWeek: getDayOfWeekName(resolvedDate),
          startTime: reactProps?.startTime ? normalizeTimeString(reactProps.startTime) : '',
          endTime: reactProps?.endTime ? normalizeTimeString(reactProps.endTime) : '',
          type: eventType,
          typeLabel,
          courseCode: reactProps?.courseCode || courseCode,
          courseName: reactProps?.courseName || '',
          lecturer: reactProps?.lecturer || '',
          room: reactProps?.room || (mode === 'Online' ? 'Online' : ''),
          mode,
          batch: context.batch,
          source: 'dom',
          rawText,
        });
      }
    }
  });

  return events;
}

/**
 * Strategy 1B: Week View Scraper
 */
function scrapeWeekView(doc: Document, context: CalendarContext): Partial<TimetableEvent>[] {
  const events: Partial<TimetableEvent>[] = [];

  // Week view typically has columns for days
  const colSelectors = [
    '[role="columnheader"]',
    'th',
    'div[class*="col"]',
    'div[class*="week-day"]',
    '.rbc-time-column',
  ];

  let columns: Element[] = [];
  for (const sel of colSelectors) {
    const cols = Array.from(doc.querySelectorAll(sel));
    if (cols.length >= 5 && cols.length <= 7) {
      columns = cols;
      break;
    }
  }

  columns.forEach((col, idx) => {
    // Try to extract date from column header or container
    const headerText = col.textContent || '';
    const dateMatch = headerText.match(/\b([1-9]|[12]\d|3[01])\b/);
    const dayNum = dateMatch ? parseInt(dateMatch[1], 10) : idx + 1;
    const resolvedDate = formatISODate(context.year, context.month, dayNum);

    const cards = Array.from(
      col.querySelectorAll('[class*="event"], [class*="card"], [class*="lecture"], [role="button"]')
    );

    for (const card of cards) {
      const ev = parseEventCard(card, resolvedDate, context);
      events.push(ev);
    }
  });

  return events;
}

/**
 * Strategy 1C: Day / Agenda View Scraper
 */
function scrapeDayView(doc: Document, context: CalendarContext): Partial<TimetableEvent>[] {
  const events: Partial<TimetableEvent>[] = [];

  // In day view, date is usually single for the entire view
  let resolvedDate = formatISODate(context.year, context.month, 1);

  // Check for explicit date header like "2026-09-01" or "September 1, 2026"
  const header = doc.querySelector('h1, h2, h3, [class*="date-header"]');
  if (header) {
    const txt = header.textContent || '';
    const dMatch = txt.match(/\b([1-9]|[12]\d|3[01])\b/);
    if (dMatch) {
      resolvedDate = formatISODate(context.year, context.month, parseInt(dMatch[1], 10));
    }
  }

  const items = Array.from(
    doc.querySelectorAll(
      '[class*="event"], [class*="card"], [class*="agenda-item"], [class*="lecture"], [role="listitem"]'
    )
  );

  for (const item of items) {
    const ev = parseEventCard(item, resolvedDate, context);
    events.push(ev);
  }

  return events;
}

/**
 * Strategy 1D: Generic Fallback Scanner
 * If structured grid parsing found no events, search any DOM container exhibiting timetable patterns.
 */
function scrapeGenericFallback(doc: Document, context: CalendarContext): Partial<TimetableEvent>[] {
  const events: Partial<TimetableEvent>[] = [];
  const candidates = Array.from(
    doc.querySelectorAll('div, li, tr, section, article')
  ).filter((el) => {
    // Look for text matching timetable markers
    const txt = el.textContent || '';
    return (
      /\b(LP|LO|TU|LB|EX|WS|CW)\b/i.test(txt) &&
      /\d{1,2}[:.]\d{2}/.test(txt) &&
      el.children.length <= 8 // Leaf-like container
    );
  });

  for (const item of candidates) {
    // Extract date if nearby
    let resolvedDate = formatISODate(context.year, context.month, 1);
    const dateAttr = item.closest('[data-date]')?.getAttribute('data-date');
    if (dateAttr) resolvedDate = dateAttr;

    const ev = parseEventCard(item, resolvedDate, context);
    if (ev.courseCode || ev.type || ev.startTime) {
      events.push(ev);
    }
  }

  return events;
}

/**
 * Attempts to extract React Fiber / Props data from an element.
 */
function extractReactPropsFromElement(el: Element): {
  startTime?: string;
  endTime?: string;
  lecturer?: string;
  room?: string;
  courseName?: string;
  courseCode?: string;
} | null {
  try {
    const keys = Object.keys(el);
    const reactKey = keys.find((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactProps$'));
    if (!reactKey) return null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let curr: any = (el as any)[reactKey];
    for (let depth = 0; depth < 8 && curr; depth++) {
      const p = curr.memoizedProps || curr.props || curr;
      if (p) {
        const item = p.lecture || p.event || p.data || p.slot || p.item;
        if (item && typeof item === 'object') {
          return {
            startTime: item.startAt || item.startTime || item.from,
            endTime: item.endAt || item.endTime || item.to,
            lecturer: item.lecturer || item.lecturerName || item.staff || item.teacher,
            room: item.hall || item.hallName || item.room || item.location || item.venue,
            courseName: item.moduleName || item.courseName || item.title || item.name,
            courseCode: item.moduleCode || item.courseCode || item.code || item.module,
          };
        }
      }
      curr = curr.return || curr.parent;
    }
  } catch {
    // ignore
  }
  return null;
}

/**
 * Direct ACA Badge Scraper
 * Accurately detects NIBM ACA event badges (e.g. "LP MC", "LPMC", "LP APF", "LP ECS - 1", "TU APF")
 * supporting both spaced and non-spaced DOM representations.
 */
function scrapeAcaBadges(doc: Document, context: CalendarContext): Partial<TimetableEvent>[] {
  const events: Partial<TimetableEvent>[] = [];
  const TYPE_PREFIXES = 'LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC';
  const BADGE_REGEX = new RegExp(`(?:^|\\b)(${TYPE_PREFIXES})(?:\\b|\\s*[-:]?\\s*)([A-Za-z0-9\\s/&.-]{1,25})`, 'i');

  // Query all leaf or near-leaf elements
  const candidates = Array.from(doc.querySelectorAll('*')).filter((el) => {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'HEAD'].includes(el.tagName)) return false;
    if (el.closest('footer, [role="dialog"], header, nav')) return false;

    // Must be leaf or small container (<= 3 children)
    if (el.children.length > 3) return false;

    const t = getElementCleanText(el);
    if (t.length < 3 || t.length > 40) return false;
    const lower = t.toLowerCase();
    if (
      lower.includes('lecture (physical)') ||
      lower.includes('lecture (online)') ||
      lower.includes('course work') ||
      lower.includes('seminar') ||
      lower.includes('workshop') ||
      lower.includes('presentation')
    ) {
      return false;
    }

    return BADGE_REGEX.test(t);
  });

  // Filter out parent elements if child already matched
  const distinct = candidates.filter((el) => {
    return !Array.from(el.children).some((c) => candidates.includes(c));
  });

  for (const badge of distinct) {
    const rawText = getElementCleanText(badge);
    const match = rawText.match(BADGE_REGEX);
    if (!match) continue;

    const eventType = match[1].toUpperCase();
    let courseCode = match[2].trim();

    // Clean up course code
    if (courseCode.startsWith('-')) courseCode = courseCode.slice(1).trim();

    // Find date: check ancestors for day number 1..31
    let resolvedDate = '';
    let curr: Element | null = badge.parentElement;
    for (let depth = 0; depth < 8 && curr; depth++) {
      if (curr === doc.body || curr.tagName === 'MAIN' || curr.id === 'root') break;

      const dateAttr = curr.getAttribute('data-date') || curr.getAttribute('data-day');
      if (dateAttr && /^\d{4}-\d{2}-\d{2}$/.test(dateAttr)) {
        resolvedDate = dateAttr;
        break;
      }

      // Search all elements inside curr for a day number
      const dayCandidates = Array.from(curr.querySelectorAll('*'));
      for (const dc of dayCandidates) {
        if (dc === badge || badge.contains(dc)) continue;
        const dt = getElementCleanText(dc);
        if (/^([1-9]|[12]\d|3[01])$/.test(dt)) {
          const dayNum = parseInt(dt, 10);
          const isOutside = isCellOutsideCurrentMonth(curr);
          resolvedDate = resolveCellDate(dayNum, isOutside, 15, context);
          break;
        }
      }
      if (resolvedDate) break;

      // Or check if curr text starts with day number
      const startMatch = getElementCleanText(curr).match(/^([1-9]|[12]\d|3[01])\b/);
      if (startMatch) {
        const dayNum = parseInt(startMatch[1], 10);
        const isOutside = isCellOutsideCurrentMonth(curr);
        resolvedDate = resolveCellDate(dayNum, isOutside, 15, context);
        break;
      }

      curr = curr.parentElement;
    }

    if (!resolvedDate) {
      resolvedDate = formatISODate(context.year, context.month, 1);
    }

    const reactProps = extractReactPropsFromElement(badge);
    const { mode, typeLabel } = resolveTypeInfo(eventType);

    events.push({
      date: resolvedDate,
      dayOfWeek: getDayOfWeekName(resolvedDate),
      startTime: reactProps?.startTime ? normalizeTimeString(reactProps.startTime) : '',
      endTime: reactProps?.endTime ? normalizeTimeString(reactProps.endTime) : '',
      type: eventType,
      typeLabel,
      courseCode: reactProps?.courseCode || courseCode,
      courseName: reactProps?.courseName || '',
      lecturer: reactProps?.lecturer || '',
      room: reactProps?.room || (mode === 'Online' ? 'Online' : ''),
      mode,
      batch: context.batch,
      source: 'dom',
      rawText,
    });
  }

  return events;
}

/**
 * Strategy 1E: Active Modal / Dialog Scraper
 * If a lecture details modal is open on the page, extracts its rich metadata.
 */
export function scrapeActiveModal(doc: Document = document, context?: CalendarContext): Partial<TimetableEvent> | null {
  const dialog = doc.querySelector(
    '[role="dialog"], [class*="modal"], [class*="popup"], div[class*="fixed"][class*="z-"]'
  );
  if (!dialog) return null;

  const fullText = (dialog.textContent || '').replace(/\s+/g, ' ').trim();
  if (!fullText.includes('AM') && !fullText.includes('PM') && !fullText.includes(':') && !fullText.includes('202')) {
    return null;
  }

  // 1. Gather all non-empty leaf text nodes
  const leafNodes = Array.from(dialog.querySelectorAll('*')).filter((el) => {
    if (el.children.length > 0) return false;
    if (['BUTTON', 'SCRIPT', 'STYLE', 'SVG', 'PATH'].includes(el.tagName)) return false;
    const t = (el.textContent || '').trim();
    return t.length > 0 && t !== '✕' && t !== 'x' && t !== 'X';
  });

  const leafTexts = leafNodes.map((el) => (el.textContent || '').replace(/\s+/g, ' ').trim());

  let courseCode = '';
  // Check modal header or title element directly
  const headerEl = dialog.querySelector('h1, h2, h3, h4, [class*="title"], [class*="header"]');
  if (headerEl) {
    const hText = (headerEl.textContent || '').trim();
    if (hText && hText.length <= 25 && !hText.includes('AM') && !hText.includes('PM') && !hText.includes(':')) {
      courseCode = hText;
    }
  }

  let date = '';
  let startTime = '';
  let endTime = '';
  let lecturer = '';
  let room = '';
  let type = '';

  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const isStatusBadge = (s: string) => /^(?:APPROVED|PENDING|CANCELLED|RESCHEDULED|COMPLETED)$/i.test(s.trim());

  const isTypeBadge = (s: string) => {
    const up = s.toUpperCase().replace(/_/g, ' ');
    return (
      up.includes('LECTURE PHYSICAL') ||
      up.includes('LECTURE ONLINE') ||
      up.includes('TUTORIAL') ||
      up.includes('PRACTICAL') ||
      up.includes('WORKSHOP') ||
      up.includes('SEMINAR') ||
      up.includes('EXAM') ||
      up.includes('VIVA') ||
      ['LP', 'LO', 'TU', 'LB', 'SM', 'WS', 'EX', 'VV', 'PR', 'CW', 'PC'].includes(up)
    );
  };

  // 2. Parse from distinct leaf text tokens
  for (const text of leafTexts) {
    // A. Check Date (e.g. "Tuesday, September 1, 2026")
    const dateMatch = text.match(/([A-Z][a-z]+),\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
    if (dateMatch && !date) {
      const mIdx = MONTHS.indexOf(dateMatch[2]) + 1;
      const day = parseInt(dateMatch[3], 10);
      const year = parseInt(dateMatch[4], 10);
      if (mIdx > 0) {
        date = formatISODate(year, mIdx, day);
      }
      continue;
    }

    // B. Check Time Range (e.g. "9:00 AM – 12:00 PM" or "1:00 PM – 4:00 PM")
    const timeMatch = text.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*[–—~-]\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i);
    if (timeMatch && !startTime) {
      startTime = normalizeTimeString(timeMatch[1]);
      endTime = normalizeTimeString(timeMatch[2]);
      continue;
    }

    // C. Check Room (e.g. "Lecture Hall 18 - 1st Fl", "Lecture Hall 18 - 1st H", "Hall 4A", "Lab 2", "Online")
    if (
      /^(?:Lecture\s+Hall|Hall|Lab|Room|LH|Audi|Auditorium)\b/i.test(text) ||
      /\b(?:Lecture\s+Hall|Hall\s+\d+|Lab\s+\d+|Room\s+\d+|1st\s+Fl|2nd\s+Fl|Floor|1st\s+H)\b/i.test(text) ||
      /^[A-Za-z0-9\s-]+\s+(?:Hall|Lab|Room|Auditorium|Fl|Floor|H)\b/i.test(text)
    ) {
      if (!room) {
        room = text.replace(/\b(?:LECTURE\s+(?:PHYSICAL|ONLINE)|APPROVED|PENDING|TUTORIAL|LAB)\b.*/i, '').trim();
        continue;
      }
    }

    // D. Check Type Badges (e.g. "LECTURE PHYSICAL" or "LECTURE_PHYSICAL" -> "LP")
    if (isTypeBadge(text)) {
      const up = text.toUpperCase().replace(/_/g, ' ');
      if (up.includes('LECTURE ONLINE') || up === 'LO') {
        type = 'LO';
      } else if (up.includes('TUTORIAL') || up === 'TU') {
        type = 'TU';
      } else if (up.includes('LAB') || up === 'LB') {
        type = 'LB';
      } else if (up.includes('PRACTICAL') || up === 'PC') {
        type = 'PC';
      } else if (up.includes('EXAM') || up === 'EX') {
        type = 'EX';
      } else if (up.includes('VIVA') || up === 'VV') {
        type = 'VV';
      } else {
        type = 'LP';
      }
      continue;
    }

    // E. Ignore Status Badges
    if (isStatusBadge(text)) {
      continue;
    }

    // F. Course Code / Title (first short token <= 15 chars that isn't date/time/room/status)
    if (!courseCode && text.length <= 15 && !dateMatch && !timeMatch) {
      courseCode = text;
      continue;
    }

    if (courseCode && text === courseCode) {
      continue;
    }

    // G. Lecturer: Any name token with honorific or standard multi-word person name pattern
    if (!lecturer && text !== courseCode) {
      if (
        /^(?:Dr|Prof|Mr|Ms|Mrs|Miss|Eng|Rev)\.?\s+/i.test(text) ||
        (/^[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+$/.test(text) && !/^(?:Lecture\s+Hall|Room|Hall|Lab)/i.test(text))
      ) {
        lecturer = text;
        continue;
      }
    }
  }

  // 3. Fallback: Icon-based row search if Room or Lecturer is still missing
  if (!room) {
    const pinIcons = Array.from(dialog.querySelectorAll('svg')).filter((svg) => {
      const p = (svg.innerHTML || '').toLowerCase();
      const c = (svg.className || '').toString().toLowerCase();
      return c.includes('map') || c.includes('pin') || p.includes('m21 10c0') || p.includes('circle cx="12" cy="10"');
    });
    for (const svg of pinIcons) {
      const row = svg.closest('div, p, li');
      if (row) {
        const rowText = (row.textContent || '').replace(/\s+/g, ' ').trim();
        if (rowText && rowText !== lecturer && rowText !== courseCode) {
          room = rowText.replace(/\b(?:LECTURE\s+(?:PHYSICAL|ONLINE)|APPROVED|PENDING|TUTORIAL|LAB)\b.*/i, '').trim();
          break;
        }
      }
    }
  }

  if (!lecturer) {
    const userIcons = Array.from(dialog.querySelectorAll('svg')).filter((svg) => {
      const p = (svg.innerHTML || '').toLowerCase();
      const c = (svg.className || '').toString().toLowerCase();
      return c.includes('user') || c.includes('person') || p.includes('m19 21v-2a4') || p.includes('circle cx="12" cy="7"');
    });
    for (const svg of userIcons) {
      const row = svg.closest('div, p, li');
      if (row) {
        const rowText = (row.textContent || '').replace(/\s+/g, ' ').trim();
        if (rowText && rowText !== room && rowText !== courseCode) {
          lecturer = rowText;
          break;
        }
      }
    }
  }

  // 4. Fallback: regex search on fullText if still empty
  if (!date) {
    const dm = fullText.match(/([A-Z][a-z]+),\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
    if (dm) {
      const mIdx = MONTHS.indexOf(dm[2]) + 1;
      const day = parseInt(dm[3], 10);
      const year = parseInt(dm[4], 10);
      if (mIdx > 0) date = formatISODate(year, mIdx, day);
    }
  }

  if (!startTime) {
    const tm = fullText.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*[–—~-]\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i);
    if (tm) {
      startTime = normalizeTimeString(tm[1]);
      endTime = normalizeTimeString(tm[2]);
    }
  }

  if (!room) {
    const rm = fullText.match(
      /\b((?:Lecture\s+Hall|Hall|Lab|Room|LH|Audi|Auditorium)\s+[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9]+(?:\s+Fl|\s+Floor)?)?)\b/i
    );
    if (rm) {
      room = rm[1].trim();
    }
  }

  if (!lecturer) {
    const lm = fullText.match(
      /\b((?:Dr|Prof|Mr|Ms|Mrs|Miss|Eng|Rev)\.?\s+(?:[A-Za-z]\.?\s*)*[A-Za-z]+(?:\s+[A-Za-z]+)*)\b/i
    );
    if (lm && !lm[1].includes('Hall') && !lm[1].includes('Room')) {
      lecturer = lm[1].trim();
    }
  }

  if (!type) {
    const up = fullText.toUpperCase().replace(/_/g, ' ');
    if (up.includes('LECTURE ONLINE') || up.includes('LO')) {
      type = 'LO';
    } else if (up.includes('TUTORIAL') || up.includes('TU')) {
      type = 'TU';
    } else if (up.includes('PRACTICAL') || up.includes('PC')) {
      type = 'PC';
    } else if (up.includes('LAB') || up.includes('LB')) {
      type = 'LB';
    } else if (up.includes('EXAM') || up.includes('EX')) {
      type = 'EX';
    } else if (up.includes('VIVA') || up.includes('VV')) {
      type = 'VV';
    } else {
      type = 'LP';
    }
  }

  const { mode, typeLabel } = resolveTypeInfo(type);
  const fallbackDate = context ? formatISODate(context.year, context.month, 1) : '';

  return {
    date: date || '',
    startTime,
    endTime,
    courseCode,
    lecturer,
    room,
    type,
    typeLabel,
    mode,
    batch: context?.batch || '',
    source: 'dom',
  };
}

/**
 * Main DOM Scraping Orchestrator
 */
export function scrapeTimetableFromDOM(
  doc: Document = document,
  url: string = window.location.href
): ScrapeResult {
  const context = extractPageContext(doc, url);
  let rawEvents: Partial<TimetableEvent>[] = [];

  // 1. Structured View Scraper (Month, Week, or Day)
  if (context.view === 'month') {
    rawEvents = scrapeMonthView(doc, context);
  } else if (context.view === 'week') {
    rawEvents = scrapeWeekView(doc, context);
  } else if (context.view === 'day') {
    rawEvents = scrapeDayView(doc, context);
  }

  // 2. If structured view found nothing (e.g. Real ACA compact badges), use scrapeAcaBadges
  if (rawEvents.length === 0) {
    rawEvents = scrapeAcaBadges(doc, context);
  }

  // 3. Fallback if still nothing found
  if (rawEvents.length === 0 && context.view !== 'month') {
    rawEvents = scrapeMonthView(doc, context);
  }

  if (rawEvents.length === 0) {
    rawEvents = scrapeGenericFallback(doc, context);
  }

  // If an active modal is open, merge its rich details
  const activeModalEvent = scrapeActiveModal(doc, context);
  if (activeModalEvent) {
    rawEvents.push(activeModalEvent);
  }

  const rawEventCount = rawEvents.length;

  // Normalize all raw records
  const normalizedEvents = rawEvents.map((raw) =>
    normalizeEvent(raw, context.batch)
  );

  // Deduplicate and resolve summary
  const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(normalizedEvents);
  const summary = computeSummary(uniqueEvents, duplicatesRemoved, 'dom');

  return {
    context,
    events: uniqueEvents,
    summary,
    rawEventCount,
  };
}
