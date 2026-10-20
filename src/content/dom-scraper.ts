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
  isLegendElement,
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
      if (isLegendElement(el)) return false;
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
    if (isLegendElement(el)) return false;
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

    // NEVER fabricate an event on day 1 if no real calendar day is associated
    if (!resolvedDate) {
      continue;
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
/**
 * Helper to locate the real active modal/dialog element in the document,
 * avoiding full-screen empty backdrops or navigation bars.
 */
export function findActiveModalDialog(doc: Document = document): HTMLElement | null {
  const dialogs = doc.querySelectorAll(
    '[role="dialog"], [aria-modal="true"], div[data-state="open"][role="dialog"], div[data-radix-portal] div[role="dialog"], div[class*="dialog" i], div[class*="modal" i], div[class*="popup" i], div[class*="fixed"][class*="z-"]'
  );

  for (const el of Array.from(dialogs)) {
    if (el.id === 'nibm-scraper-overlay' || el.closest('#nibm-scraper-overlay')) continue;
    const htmlEl = el as HTMLElement;
    const text = (el.textContent || '').trim();
    if (text.length < 5) continue;

    const hasTime = /\d{1,2}[:.]\d{2}/.test(text) || /\b(?:am|pm)\b/i.test(text);
    const hasTimetableContent = /(?:lecture|exam|tutorial|practical|seminar|workshop|hall|room|online|dr\.|prof\.|approved|pending|module|course|batch)/i.test(text);

    if (hasTime || hasTimetableContent) {
      const inner = el.querySelector('[role="dialog"], [aria-modal="true"]') as HTMLElement | null;
      return inner || htmlEl;
    }
  }

  return null;
}

/**
 * Strategy 1E: Active Modal / Dialog Scraper
 * If a lecture details modal is open on the page, extracts its rich metadata.
 */
export function scrapeActiveModal(
  modalOrDoc: Element | Document = document,
  context?: CalendarContext
): Partial<TimetableEvent> | null {
  let dialog: HTMLElement | null = null;

  if (modalOrDoc instanceof Element) {
    if (modalOrDoc.getAttribute('role') === 'dialog' || modalOrDoc.getAttribute('aria-modal') === 'true') {
      dialog = modalOrDoc as HTMLElement;
    } else {
      const inner = modalOrDoc.querySelector('[role="dialog"], [aria-modal="true"]') as HTMLElement | null;
      dialog = inner || (modalOrDoc as HTMLElement);
    }
  } else {
    dialog = findActiveModalDialog(modalOrDoc);
  }

  if (!dialog) return null;

  const fullText = (dialog.innerText || dialog.textContent || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!fullText.includes(':') && !fullText.includes('AM') && !fullText.includes('PM') && !fullText.includes('202')) {
    return null;
  }

  // 1. Extract Course Code / Title from modal header
  let courseCode = '';
  const headerEl = dialog.querySelector('h1, h2, h3, h4, [class*="title" i], [class*="header" i], [class*="font-semibold" i], [class*="font-bold" i]');
  if (headerEl) {
    const hText = (headerEl.textContent || '').trim();
    if (hText && hText.length <= 35 && !hText.includes('AM') && !hText.includes('PM') && !hText.includes(':')) {
      courseCode = hText;
    }
  }

  // 2. Date Parsing
  let date = '';
  const MONTHS = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dateMatch = fullText.match(/\b([A-Z][a-z]+),\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\b/) ||
                    fullText.match(/\b([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})\b/);
  if (dateMatch) {
    const monthName = dateMatch.length === 5 ? dateMatch[2] : dateMatch[1];
    const day = parseInt(dateMatch.length === 5 ? dateMatch[3] : dateMatch[2], 10);
    const year = parseInt(dateMatch.length === 5 ? dateMatch[4] : dateMatch[3], 10);
    const mIdx = MONTHS.indexOf(monthName) + 1;
    if (mIdx > 0 && !isNaN(day) && !isNaN(year)) {
      date = formatISODate(year, mIdx, day);
    }
  }

  // 3. Time Range Parsing (supports en-dash –, em-dash —, hyphens, and "to")
  let startTime = '';
  let endTime = '';
  const TIME_RANGE_REGEX = /(\d{1,2}[:.]\d{2}\s*(?:[aApP][mM])?)\s*[\u2010-\u2015\u2212\u002d\u2013\u2014~-]\s*(\d{1,2}[:.]\d{2}\s*(?:[aApP][mM])?)/;
  const timeMatch = fullText.match(TIME_RANGE_REGEX);
  if (timeMatch) {
    let rawStart = timeMatch[1].trim();
    let rawEnd = timeMatch[2].trim();

    const endHasPm = /pm/i.test(rawEnd);
    const startHasMeridiem = /(?:am|pm)/i.test(rawStart);

    if (!startHasMeridiem && endHasPm) {
      const startH = parseInt(rawStart.split(/[:.]/)[0], 10);
      if (startH >= 1 && startH <= 6) {
        rawStart += ' PM';
      } else if (startH >= 8 && startH <= 11) {
        rawStart += ' AM';
      }
    }

    startTime = normalizeTimeString(rawStart);
    endTime = normalizeTimeString(rawEnd);
  }

  // 4. Type Badges Parsing
  let type = '';
  const allBadges = Array.from(dialog.querySelectorAll('[class*="badge" i], [class*="tag" i], [class*="pill" i], span, div')).map((el) =>
    (el.textContent || '').trim().toUpperCase()
  );

  for (const b of allBadges) {
    if (b === 'LAB' || b === 'LB') { type = 'LB'; break; }
    if (b.includes('LECTURE ONLINE') || b === 'LO') { type = 'LO'; break; }
    if (b.includes('LECTURE PHYSICAL') || b.includes('LECTURE') || b === 'LP') { type = 'LP'; break; }
    if (b.includes('TUTORIAL') || b === 'TU') { type = 'TU'; break; }
    if (b.includes('PRACTICAL') || b === 'PC') { type = 'PC'; break; }
    if (b.includes('EXAM') || b === 'EX') { type = 'EX'; break; }
    if (b.includes('VIVA') || b === 'VV') { type = 'VV'; break; }
    if (b.includes('PRESENTATION') || b === 'PR') { type = 'PR'; break; }
    if (b.includes('WORKSHOP') || b === 'WS') { type = 'WS'; break; }
    if (b.includes('SEMINAR') || b === 'SM') { type = 'SM'; break; }
    if (b.includes('COURSE WORK') || b === 'CW') { type = 'CW'; break; }
  }

  if (!type) {
    if (/\bLAB\b/i.test(fullText)) type = 'LB';
    else if (/\bTUTORIAL\b/i.test(fullText)) type = 'TU';
    else if (/\bPRACTICAL\b/i.test(fullText)) type = 'PC';
    else if (/\bEXAM\b/i.test(fullText)) type = 'EX';
    else if (/\bVIVA\b/i.test(fullText)) type = 'VV';
    else if (/\bPRESENTATION\b/i.test(fullText)) type = 'PR';
    else if (/\bONLINE\b/i.test(fullText)) type = 'LO';
    else type = 'LP';
  }

  // 5. Room / Venue Parsing
  let room = '';
  const ROOM_KEYWORD_REGEX = /\b(?:Lecture\s+Hall|Harison\s+Hall|Auditorium|Hall|Lab|Room|LH|Audi)\b/i;
  const dialogEls = Array.from(dialog.querySelectorAll('p, div, span, li, h4, h5'));

  // 5A. Check individual elements
  for (const el of dialogEls) {
    if (el.children.length > 2) continue;
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (
      ROOM_KEYWORD_REGEX.test(txt) &&
      !/(?:approved|pending|am\b|pm\b|\b20\d\d\b)/i.test(txt) &&
      txt.length <= 45
    ) {
      const cleaned = txt.replace(/\b(?:LECTURE\s+(?:PHYSICAL|ONLINE)|APPROVED|PENDING|TUTORIAL|LAB)\b.*/i, '').trim();
      if (cleaned) {
        room = cleaned;
        break;
      }
    }
  }

  // 5B. Check full text fallback
  if (!room) {
    const roomMatch = fullText.match(
      /\b((?:Lecture\s+Hall|Harison\s+Hall|Auditorium|Hall|Lab|Room|LH|Audi)\s+[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9\s]+?(?=\s*(?:LECTURE|APPROVED|PENDING|TUTORIAL|LAB|AM|PM|\d{1,2}[:.]|$)))?)/i
    );
    if (roomMatch) {
      room = roomMatch[1].trim();
    }
  }

  // 5C. Check map pin icon
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
        if (rowText && rowText !== courseCode && !rowText.includes('AM') && !rowText.includes('PM')) {
          room = rowText.replace(/\b(?:LECTURE\s+(?:PHYSICAL|ONLINE)|APPROVED|PENDING|TUTORIAL|LAB)\b.*/i, '').trim();
          break;
        }
      }
    }
  }

  // 6. Lecturer Parsing
  let lecturer = '';

  // 6A. Check individual elements for title prefix (e.g. "Ms W M A D Weerathunga", "Mr Wijekoon Mudiyanselage")
  const TITLE_PREFIX_REGEX = /^(?:Dr|Prof|Mr|Ms|Mrs|Miss|Eng|Rev)\.?\s+/i;
  for (const el of dialogEls) {
    if (el.children.length > 2) continue;
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
    if (TITLE_PREFIX_REGEX.test(txt) && !/(?:hall|room|floor|fl\b|lab\b|approved|pending|lecture)/i.test(txt)) {
      lecturer = txt;
      break;
    }
  }

  // 6B. Search lines in dialog text (preserving line boundaries)
  if (!lecturer) {
    const rawLines = (dialog.innerText || dialog.textContent || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of rawLines) {
      const m = line.match(/\b((?:Dr|Prof|Mr|Ms|Mrs|Miss|Eng|Rev)\.?\s+(?:[A-Za-z]\.?\s*)*[A-Za-z]+(?:\s+[A-Za-z]+){0,4})\b/i);
      if (m) {
        const cleaned = m[1].replace(/\b(?:Lecture|Hall|Room|Lab|Approved|Pending|Physical|Online)\b.*/i, '').trim();
        if (cleaned && cleaned.split(/\s+/).length >= 2) {
          lecturer = cleaned;
          break;
        }
      }
    }
  }

  // 6C. Fallback to user icon next to lecturer name
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
        if (rowText && rowText !== room && rowText !== courseCode && !rowText.includes('AM') && !rowText.includes('PM')) {
          lecturer = rowText;
          break;
        }
      }
    }
  }

  // Course code fallback
  if (!courseCode) {
    const firstWord = fullText.split(/\s+/)[0];
    if (firstWord && firstWord.length <= 20 && !firstWord.includes(':')) {
      courseCode = firstWord;
    }
  }

  const { mode, typeLabel } = resolveTypeInfo(type);

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
