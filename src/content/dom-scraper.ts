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

    // 2. Otherwise look for compact badges (real ACA website: LP MC, LP APF, TU APF)
    const BADGE_REGEX = /\b(LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC)(?![a-z])\s*[-:]?\s*([A-Za-z0-9\s/-]{1,15})/i;
    const candidates = Array.from(cell.querySelectorAll('*')).filter((el) => {
      if (el.children.length > 2) return false;
      const t = getElementCleanText(el);
      return t.length >= 3 && t.length <= 35 && BADGE_REGEX.test(t);
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
  const BADGE_REGEX = new RegExp(`(?:^|\\b)(${TYPE_PREFIXES})(?:\\b|\\s*[-:]?\\s*)([A-Za-z0-9\\s/-]{1,15})`, 'i');

  // Query all leaf or near-leaf elements
  const candidates = Array.from(doc.querySelectorAll('*')).filter((el) => {
    if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'HEAD'].includes(el.tagName)) return false;
    if (el.closest('footer, [role="dialog"], header, nav')) return false;

    // Must be leaf or small container (<= 3 children)
    if (el.children.length > 3) return false;

    const t = getElementCleanText(el);
    if (t.length < 3 || t.length > 40) return false;
    if (t.toLowerCase().includes('lecture (physical)') || t.toLowerCase().includes('lecture (online)')) return false;

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
  const dialog = doc.querySelector('[role="dialog"], [class*="modal"], [class*="popup"], div[class*="fixed"][class*="z-"]');
  if (!dialog) return null;

  const text = getElementCleanText(dialog);
  if (!text.includes('AM') && !text.includes('PM') && !text.includes(':') && !text.includes('202')) return null;

  // Title / Course code (e.g. "MC", "APF")
  let courseCode = '';
  const titleEl = dialog.querySelector('h1, h2, h3, h4, strong, [class*="font-bold"]');
  if (titleEl) {
    const ht = getElementCleanText(titleEl);
    if (ht.length <= 15 && !ht.includes('AM') && !ht.includes('202')) {
      courseCode = ht;
    }
  }

  // Date (e.g. "Friday, September 11, 2026")
  let date = '';
  const dateMatch = text.match(/([A-Z][a-z]+),\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
  if (dateMatch) {
    const MONTHS = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const mIdx = MONTHS.indexOf(dateMatch[2]) + 1;
    const day = parseInt(dateMatch[3], 10);
    const year = parseInt(dateMatch[4], 10);
    if (mIdx > 0) {
      date = formatISODate(year, mIdx, day);
    }
  }

  // Time (e.g. "9:00 AM – 12:00 PM")
  let startTime = '';
  let endTime = '';
  const timeMatch = text.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*[–—~-]\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i);
  if (timeMatch) {
    startTime = normalizeTimeString(timeMatch[1]);
    endTime = normalizeTimeString(timeMatch[2]);
  }

  // Lecturer (e.g. "Mr Sankha Jayawardana", "Ms W M A D Weerathunga")
  let lecturer = '';
  const pEls = Array.from(dialog.querySelectorAll('p, div, span'));
  for (const pel of pEls) {
    if (pel.children.length > 2) continue;
    const pt = getElementCleanText(pel);
    const m = pt.match(/\b((?:Dr|Prof|Mr|Ms|Mrs)\.?\s+(?:[A-Z]\.?\s+)*[A-Za-z]+(?:\s+[A-Za-z]+){1,3})\b/);
    if (m && !pt.includes('Hall')) {
      lecturer = m[1].trim();
      break;
    }
  }

  // Room (e.g. "Lecture Hall 18 - 1st Fl")
  let room = '';
  for (const pel of pEls) {
    if (pel.children.length > 2) continue;
    const pt = getElementCleanText(pel);
    if (/^(?:Lecture\s+Hall|Hall|Lab|Room|LH|Audi|Auditorium)\b/i.test(pt)) {
      room = pt;
      break;
    }
  }
  if (!room) {
    const roomMatch = text.match(
      /\b((?:Lecture\s+Hall|Hall|Lab|Room|LH|Audi|Auditorium)[-\s]?[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9\s]+)?)\b/i
    );
    if (roomMatch) {
      room = roomMatch[1].trim();
    }
  }

  // Type (e.g. "LECTURE_PHYSICAL" -> "LP")
  let type = '';
  const upper = text.toUpperCase();
  if (upper.includes('LECTURE_PHYSICAL') || upper.includes('LECTURE PHYSICAL') || upper.includes('LP')) {
    type = 'LP';
  } else if (upper.includes('LECTURE_ONLINE') || upper.includes('LECTURE ONLINE') || upper.includes('LO')) {
    type = 'LO';
  } else if (upper.includes('TUTORIAL') || upper.includes('TU')) {
    type = 'TU';
  } else if (upper.includes('LAB') || upper.includes('LB')) {
    type = 'LB';
  }

  const { mode, typeLabel } = resolveTypeInfo(type);

  const fallbackDate = context ? formatISODate(context.year, context.month, 1) : '';

  return {
    date: date || fallbackDate,
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
