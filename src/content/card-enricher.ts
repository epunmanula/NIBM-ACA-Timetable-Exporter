/**
 * NIBM ACA Timetable Exporter - Automated Card & Modal Crawling Enricher
 * 
 * Automatically iterates through all timetable cards in the calendar view,
 * opens each card's detail modal, extracts lecturer, exact times, room/hall,
 * and lecture mode, then closes the modal and proceeds to the next.
 */

import {
  CalendarContext,
  TimetableEvent,
} from '../types/timetable';
import {
  formatISODate,
  getDayOfWeekName,
  normalizeEvent,
  normalizeTimeString,
  resolveTypeInfo,
} from './normalizer';
import {
  findDateForCard,
  getCalendarHeading,
  getElementCleanText,
  isCellOutsideMonth,
  parseHeadingMonthYear,
  resolveCellDate,
} from './calendar-parser';
import { scrapeActiveModal } from './dom-scraper';

export { getCalendarHeading, parseHeadingMonthYear, isCellOutsideMonth };

export interface CardDescriptor {
  element: HTMLElement;
  cellDate: string;
  previewText: string;
  courseHint?: string;
  typeHint?: string;
}

export interface ProgressCallbackData {
  current: number;
  total: number;
  cardText: string;
  event?: TimetableEvent;
  isComplete?: boolean;
}

export type ProgressCallback = (data: ProgressCallbackData) => void;

const TYPE_PREFIXES = 'LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC';
const BADGE_REGEX = new RegExp(`(?:^|\\b)(${TYPE_PREFIXES})(?:\\b|\\s*[-:]?\\s*)([A-Za-z0-9\\s/&.-]{1,25})`, 'i');

/**
 * Detects if an element belongs to the bottom timetable legend bar (e.g. "SM Seminar", "LP Lecture (Physical)").
 */
export function isLegendElement(el: Element): boolean {
  if (el.closest('footer, [class*="legend" i], [data-testid*="legend" i]')) {
    return true;
  }

  const text = (el.textContent || '').trim().toLowerCase();
  const legendPhrases = [
    'lecture (physical)',
    'lecture (online)',
    'course work',
    'seminar',
    'workshop',
    'presentation',
    'tutorial',
    'practical',
  ];

  if (legendPhrases.some((p) => text === p || text === `sm ${p}` || text === `ws ${p}` || text === `lp ${p}`)) {
    return true;
  }

  let curr: Element | null = el.parentElement;
  for (let depth = 0; depth < 5 && curr; depth++) {
    if (curr === document.body || curr.tagName === 'MAIN') break;
    const cText = (curr.textContent || '').toLowerCase();
    if (
      (cText.includes('lecture (physical)') || cText.includes('lecture (online)')) &&
      (cText.includes('tutorial') || cText.includes('exam') || cText.includes('viva'))
    ) {
      return true;
    }
    curr = curr.parentElement;
  }

  return false;
}

/**
 * Collects all distinct clickable timetable cards from the calendar DOM.
 */
export function collectCalendarCards(
  doc: Document = document,
  context: CalendarContext
): CardDescriptor[] {
  const cardDescriptors: CardDescriptor[] = [];

  // 1. Resolve current active heading and exact month/year
  const activeHeading = getCalendarHeading(doc);
  const parsedHM = activeHeading ? parseHeadingMonthYear(activeHeading) : null;
  const activeContext: CalendarContext = {
    ...context,
    year: parsedHM?.year || context.year,
    month: parsedHM?.month || context.month,
    periodLabel: activeHeading || context.periodLabel,
  };

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
      if (children.length >= 28 && children.length <= 49) {
        const dayHeaderNames = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const nonHeaderCells = children.filter((c) => {
          const t = getElementCleanText(c).toLowerCase();
          return !dayHeaderNames.includes(t);
        });
        if (nonHeaderCells.length >= 28) {
          cells = nonHeaderCells;
          break;
        }
      }
    }
  }

  if (cells.length > 0) {
    cells.forEach((cell, index) => {
      // Resolve cell date
      let resolvedDate = '';
      const dateAttr = cell.getAttribute('data-date') || cell.getAttribute('data-day');
      if (dateAttr && /^\d{4}-\d{2}-\d{2}$/.test(dateAttr)) {
        resolvedDate = dateAttr;
      } else {
        let dayNum: number | null = null;
        const allDesc = Array.from(cell.querySelectorAll('*'));
        for (const d of allDesc) {
          if (d.children.length > 0) continue;
          const t = getElementCleanText(d);
          if (/^([1-9]|[12]\d|3[01])$/.test(t)) {
            dayNum = parseInt(t, 10);
            break;
          }
          const mName = t.match(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[,\s]+([1-9]|[12]\d|3[01])$/i);
          if (mName) {
            dayNum = parseInt(mName[1], 10);
            break;
          }
        }

        if (dayNum === null) {
          const cleanCell = getElementCleanText(cell);
          const startMatch = cleanCell.match(/^([1-9]|[12]\d|3[01])\b/);
          if (startMatch) dayNum = parseInt(startMatch[1], 10);
        }

        if (dayNum !== null) {
          const isOutside = isCellOutsideMonth(cell);
          resolvedDate = resolveCellDate(dayNum, isOutside, index, activeContext);
        }
      }

      if (!resolvedDate) return;

      // 1. Structured cards (.event-card, [class*="event-card"], etc.)
      const structuredCards = Array.from(
        cell.querySelectorAll('.event-card, [class*="event-card"], [class*="event-pill"], [class*="lecture-badge"]')
      ).filter((sc) => !isLegendElement(sc)) as HTMLElement[];

      if (structuredCards.length > 0) {
        for (const sc of structuredCards) {
          cardDescriptors.push({
            element: sc,
            cellDate: resolvedDate,
            previewText: getElementCleanText(sc),
          });
        }
        return;
      }

      // 2. Compact badges: LP MC, LP DL & CO, PC DL & CO, LP DM - 1, etc.
      const candidates = Array.from(cell.querySelectorAll('*')).filter((el) => {
        if (el.children.length > 2) return false;
        if (isLegendElement(el)) return false;
        const t = getElementCleanText(el);
        return t.length >= 3 && t.length <= 40 && BADGE_REGEX.test(t);
      });

      const distinct = candidates.filter(
        (el) => !Array.from(el.children).some((c) => candidates.includes(c))
      ) as HTMLElement[];

      for (const badge of distinct) {
        // Resolve clickable wrapper within the cell
        let clickable: HTMLElement = badge;
        let curr: HTMLElement | null = badge;
        while (curr && curr !== cell && curr !== doc.body) {
          const tag = curr.tagName.toLowerCase();
          const cls = (curr.className || '').toString().toLowerCase();
          const role = curr.getAttribute('role') || '';
          if (
            tag === 'button' ||
            tag === 'a' ||
            role === 'button' ||
            cls.includes('cursor-pointer') ||
            cls.includes('event') ||
            cls.includes('badge') ||
            cls.includes('pill') ||
            cls.includes('card')
          ) {
            clickable = curr;
            break;
          }
          curr = curr.parentElement;
        }

        const rawText = getElementCleanText(badge);
        const match = rawText.match(BADGE_REGEX);
        const typeHint = match ? match[1].toUpperCase() : undefined;
        let courseHint = match ? match[2].trim() : undefined;
        if (courseHint && courseHint.startsWith('-')) courseHint = courseHint.slice(1).trim();

        cardDescriptors.push({
          element: clickable,
          cellDate: resolvedDate,
          previewText: rawText,
          typeHint,
          courseHint,
        });
      }
    });
  }

  // Fallback: If no cards found via standard cells, search elements strictly inside grid/calendar containers
  if (cardDescriptors.length === 0) {
    const allCandidates = Array.from(doc.querySelectorAll('*')).filter((el) => {
      if (['SCRIPT', 'STYLE', 'SVG', 'PATH', 'HEAD', 'NAV', 'HEADER', 'FOOTER'].includes(el.tagName)) return false;
      if (el.closest('footer, [role="dialog"], header, nav')) return false;
      if (isLegendElement(el)) return false;
      if (el.children.length > 3) return false;
      const t = getElementCleanText(el);
      return t.length >= 3 && t.length <= 40 && BADGE_REGEX.test(t);
    }) as HTMLElement[];

    const distinct = allCandidates.filter(
      (el) => !Array.from(el.children).some((c) => allCandidates.includes(c))
    );

    for (const badge of distinct) {
      const resolvedDate = findDateForCard(badge, activeContext);
      const rawText = getElementCleanText(badge);
      const match = rawText.match(BADGE_REGEX);

      // ONLY include if a real calendar day was associated
      if (resolvedDate) {
        cardDescriptors.push({
          element: badge,
          cellDate: resolvedDate,
          previewText: rawText,
          typeHint: match ? match[1].toUpperCase() : undefined,
          courseHint: match ? match[2].trim() : undefined,
        });
      }
    }
  }

  return cardDescriptors;
}

/**
 * Dispatches a simulated user click with mouse & pointer sequences to activate React listeners.
 */
export function simulateClick(element: HTMLElement): void {
  try {
    element.scrollIntoView({ behavior: 'instant', block: 'center', inline: 'center' });
  } catch {
    // ignore
  }

  const rect = element.getBoundingClientRect();
  const clientX = rect.left + Math.max(rect.width / 2, 2);
  const clientY = rect.top + Math.max(rect.height / 2, 2);

  const opts: MouseEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX,
    clientY,
  };

  try {
    if (typeof PointerEvent !== 'undefined') {
      element.dispatchEvent(new PointerEvent('pointerdown', opts));
    }
  } catch {
    // fallback if environment doesn't allow PointerEvent constructor
  }

  element.dispatchEvent(new MouseEvent('mousedown', opts));

  try {
    if (typeof PointerEvent !== 'undefined') {
      element.dispatchEvent(new PointerEvent('pointerup', opts));
    }
  } catch {
    // fallback
  }

  element.dispatchEvent(new MouseEvent('mouseup', opts));
  element.dispatchEvent(new MouseEvent('click', opts));

  if (typeof element.click === 'function') {
    element.click();
  }
}

/**
 * Detects if a detail modal/dialog is currently visible in the DOM.
 */
export function getOpenModal(doc: Document = document): HTMLElement | null {
  const dialogs = doc.querySelectorAll(
    '[role="dialog"], [aria-modal="true"], div[data-state="open"][role="dialog"], div[data-radix-portal] div[role="dialog"], div[class*="dialog" i], div[class*="modal" i], div[class*="popup" i], div[class*="fixed"][class*="z-"]'
  );

  for (const el of Array.from(dialogs)) {
    // Exclude our own extension overlay
    if (el.id === 'nibm-scraper-overlay' || el.closest('#nibm-scraper-overlay')) continue;

    const htmlEl = el as HTMLElement;
    const text = (el.textContent || '').trim();
    if (text.length < 5) continue;

    // 1. Explicit dialog or aria-modal
    const isExplicitDialog =
      el.getAttribute('role') === 'dialog' ||
      el.getAttribute('aria-modal') === 'true' ||
      el.hasAttribute('data-radix-portal') ||
      el.classList.contains('modal') ||
      el.classList.contains('dialog');

    if (isExplicitDialog) {
      return htmlEl;
    }

    // 2. Timetable modal indicator checks
    const hasTime = /\d{1,2}[:.]\d{2}/.test(text) || /\b(?:am|pm)\b/i.test(text);
    const hasTimetableContent = /(?:lecture|exam|tutorial|practical|seminar|workshop|hall|room|online|dr\.|prof\.|approved|pending|module|course|batch)/i.test(text);

    if (hasTime || hasTimetableContent) {
      return htmlEl;
    }
  }

  return null;
}

/**
 * Closes any currently active modal safely.
 */
export async function closeAnyOpenModal(doc: Document = document): Promise<boolean> {
  const modal = getOpenModal(doc);
  if (!modal) return true;

  // 1. Click close button
  const buttons = Array.from(modal.querySelectorAll('button, [role="button"]')) as HTMLElement[];
  const closeBtn = buttons.find((b) => {
    const aria = (b.getAttribute('aria-label') || '').toLowerCase();
    const title = (b.getAttribute('title') || '').toLowerCase();
    const cls = (b.className || '').toString().toLowerCase();
    const txt = (b.textContent || '').trim().toLowerCase();
    return (
      aria.includes('close') ||
      title.includes('close') ||
      cls.includes('close') ||
      txt === '✕' ||
      txt === '×' ||
      txt === 'x' ||
      txt === 'close' ||
      b.querySelector('svg.lucide-x, svg[class*="close"]') !== null
    );
  }) || buttons.find((b) => b.querySelector('svg') !== null);

  if (closeBtn) {
    simulateClick(closeBtn);
  }

  // 2. Dispatch Escape keydown events
  const escOpts = { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true };
  modal.dispatchEvent(new KeyboardEvent('keydown', escOpts));
  doc.dispatchEvent(new KeyboardEvent('keydown', escOpts));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new KeyboardEvent('keydown', escOpts));
  }

  // 3. Click backdrop if present
  const backdrop = doc.querySelector('div[class*="backdrop"], div[class*="overlay"], [data-state="open"][class*="fixed"]');
  if (backdrop && backdrop !== modal && !modal.contains(backdrop)) {
    simulateClick(backdrop as HTMLElement);
  }

  // Wait for modal to disappear
  for (let i = 0; i < 10; i++) {
    await new Promise((r) => setTimeout(r, 35));
    if (!getOpenModal(doc)) return true;
  }

  return !getOpenModal(doc);
}

/**
 * Waits for a modal to become visible within maxWaitMs.
 */
export async function waitForModal(doc: Document = document, maxWaitMs = 650): Promise<HTMLElement | null> {
  const startTime = Date.now();
  while (Date.now() - startTime < maxWaitMs) {
    const modal = getOpenModal(doc);
    if (modal) return modal;
    await new Promise((r) => setTimeout(r, 30));
  }
  return getOpenModal(doc);
}

/**
 * Visual Progress Overlay on the Web Page
 */
let overlayElement: HTMLElement | null = null;
let cancelRequested = false;

export function showScraperOverlay(doc: Document = document, text: string, onStop?: () => void): void {
  if (overlayElement) {
    updateScraperOverlay(text);
    return;
  }

  cancelRequested = false;
  const overlay = doc.createElement('div');
  overlay.id = 'nibm-scraper-overlay';
  overlay.setAttribute('style', `
    position: fixed;
    top: 18px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 2147483647;
    background: #0f172a;
    color: #f8fafc;
    padding: 10px 18px;
    border-radius: 9999px;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 12px;
    pointer-events: auto;
    transition: all 0.2s ease;
  `);

  overlay.innerHTML = `
    <div style="width: 14px; height: 14px; border: 2px solid #38bdf8; border-top-color: transparent; border-radius: 50%; animation: nibm-spin 0.8s linear infinite;"></div>
    <span id="nibm-overlay-msg">${text}</span>
    <button id="nibm-overlay-stop-btn" style="background: #ef4444; color: white; border: none; border-radius: 6px; padding: 3px 9px; font-size: 11px; font-weight: 600; cursor: pointer; transition: opacity 0.2s;">Stop</button>
    <style>
      @keyframes nibm-spin { to { transform: rotate(360deg); } }
      #nibm-overlay-stop-btn:hover { opacity: 0.85; }
    </style>
  `;

  const stopBtn = overlay.querySelector('#nibm-overlay-stop-btn') as HTMLElement;
  if (stopBtn) {
    stopBtn.onclick = () => {
      cancelRequested = true;
      if (onStop) onStop();
      updateScraperOverlay('Cancelling...');
    };
  }

  (doc.body || doc.documentElement).appendChild(overlay);
  overlayElement = overlay;
}

export function updateScraperOverlay(text: string): void {
  if (!overlayElement) return;
  const msgEl = overlayElement.querySelector('#nibm-overlay-msg');
  if (msgEl) msgEl.textContent = text;
}

export function hideScraperOverlay(successMessage?: string): void {
  if (!overlayElement) return;

  if (successMessage) {
    overlayElement.innerHTML = `
      <span style="color: #4ade80; font-weight: 600;">✓</span>
      <span style="color: #f8fafc;">${successMessage}</span>
    `;
    setTimeout(() => {
      overlayElement?.remove();
      overlayElement = null;
    }, 2200);
  } else {
    overlayElement.remove();
    overlayElement = null;
  }
}

/**
 * Automatically crawls and clicks all timetable cards sequentially,
 * opening each detail modal and extracting rich details.
 */
export async function enrichAllCardsSequentially(
  doc: Document = document,
  context: CalendarContext,
  onProgress?: ProgressCallback
): Promise<TimetableEvent[]> {
  // Resolve fresh heading and context from active calendar DOM
  const activeHeading = getCalendarHeading(doc);
  const parsedHM = activeHeading ? parseHeadingMonthYear(activeHeading) : null;
  const activeContext: CalendarContext = {
    ...context,
    year: parsedHM?.year || context.year,
    month: parsedHM?.month || context.month,
    periodLabel: activeHeading || context.periodLabel,
  };

  const cards = collectCalendarCards(doc, activeContext);

  if (cards.length === 0) {
    return [];
  }

  // Make sure page is clear before starting
  await closeAnyOpenModal(doc);

  showScraperOverlay(
    doc,
    `Scraping timetable cards: 0 of ${cards.length} (0%)...`,
    () => {
      cancelRequested = true;
    }
  );

  const enrichedEvents: TimetableEvent[] = [];

  for (let i = 0; i < cards.length; i++) {
    if (cancelRequested) {
      break;
    }

    const card = cards[i];
    const cardNum = i + 1;
    const percent = Math.round((cardNum / cards.length) * 100);
    const label = `Scraping card ${cardNum} of ${cards.length}: ${card.previewText} (${percent}%)...`;

    updateScraperOverlay(label);
    if (onProgress) {
      onProgress({
        current: cardNum,
        total: cards.length,
        cardText: card.previewText,
      });
    }

    // Click card
    simulateClick(card.element);

    // Wait for modal to appear
    let modal = await waitForModal(doc, 700);

    // Retry clicking on inner element or parent if modal didn't open
    if (!modal) {
      if (card.element.firstElementChild) {
        simulateClick(card.element.firstElementChild as HTMLElement);
        modal = await waitForModal(doc, 450);
      } else if (card.element.parentElement) {
        simulateClick(card.element.parentElement);
        modal = await waitForModal(doc, 450);
      }
    }

    if (modal) {
      // Scrape rich details from active modal using activeContext
      const modalData = scrapeActiveModal(doc, activeContext);

      // Prioritize card.cellDate which is the real cell date on the active calendar grid
      const finalDate = (card.cellDate && /^\d{4}-\d{2}-\d{2}$/.test(card.cellDate))
        ? card.cellDate
        : (modalData?.date || card.cellDate);
      const finalCourse = modalData?.courseCode || card.courseHint || card.previewText;
      const finalType = modalData?.type || card.typeHint || 'LP';
      const { typeLabel, mode } = resolveTypeInfo(finalType);

      const event = normalizeEvent(
        {
          date: finalDate,
          dayOfWeek: getDayOfWeekName(finalDate),
          startTime: modalData?.startTime || '',
          endTime: modalData?.endTime || '',
          type: finalType,
          typeLabel: modalData?.typeLabel || typeLabel,
          courseCode: finalCourse,
          courseName: modalData?.courseName || '',
          lecturer: modalData?.lecturer || '',
          room: modalData?.room || '',
          mode: modalData?.mode || mode,
          batch: activeContext.batch,
          source: 'dom',
          rawText: modalData?.rawText || card.previewText,
        },
        activeContext.batch
      );

      enrichedEvents.push(event);

      if (onProgress) {
        onProgress({
          current: cardNum,
          total: cards.length,
          cardText: card.previewText,
          event,
        });
      }

      // Close modal
      await closeAnyOpenModal(doc);
    } else {
      // Modal didn't open - fallback to basic badge details so the event is not lost
      const { typeLabel, mode } = resolveTypeInfo(card.typeHint || 'LP');
      const fallbackEvent = normalizeEvent(
        {
          date: card.cellDate,
          dayOfWeek: getDayOfWeekName(card.cellDate),
          startTime: '',
          endTime: '',
          type: card.typeHint || 'LP',
          typeLabel,
          courseCode: card.courseHint || card.previewText,
          courseName: '',
          lecturer: '',
          room: mode === 'Online' ? 'Online' : '',
          mode,
          batch: activeContext.batch,
          source: 'dom',
          rawText: card.previewText,
        },
        activeContext.batch
      );

      enrichedEvents.push(fallbackEvent);
    }

    // Brief settling pause between card clicks
    await new Promise((r) => setTimeout(r, 45));
  }

  // Ensure any modal left is closed
  await closeAnyOpenModal(doc);

  hideScraperOverlay(
    `Done! ${enrichedEvents.length} timetable cards scraped & enriched successfully.`
  );

  if (onProgress) {
    onProgress({
      current: cards.length,
      total: cards.length,
      cardText: 'Completed',
      isComplete: true,
    });
  }

  return enrichedEvents;
}

/**
 * Finds the Next Month navigation button (">") in the calendar header.
 */
export function findNextMonthButton(doc: Document = document): HTMLElement | null {
  // Strategy 1: Explicit aria-label or title
  const ariaBtn = doc.querySelector(
    'button[aria-label*="next" i], button[title*="next" i], button[aria-label*="Next Month" i]'
  );
  if (ariaBtn) return ariaBtn as HTMLElement;

  // Strategy 2: Button with right-chevron SVG
  const svgs = doc.querySelectorAll('svg');
  for (const svg of Array.from(svgs)) {
    const cls = (svg.getAttribute('class') || '').toLowerCase();
    const html = (svg.innerHTML || '').toLowerCase();
    if (
      cls.includes('chevron-right') ||
      cls.includes('arrow-right') ||
      cls.includes('lucide-chevron-right') ||
      html.includes('m9 18 6-6-6-6') ||
      html.includes('9 5l7 7-7 7')
    ) {
      const btn = svg.closest('button');
      if (btn) return btn as HTMLElement;
    }
  }

  // Strategy 3: Buttons containing > symbol
  const allButtons = Array.from(doc.querySelectorAll('button'));
  for (const btn of allButtons) {
    const txt = (btn.textContent || '').trim();
    if (txt === '>' || txt === '›' || txt === '»') {
      return btn;
    }
  }

  // Strategy 4: Positioned near "Today" button in the navigation group
  const todayBtn = Array.from(doc.querySelectorAll('button')).find(
    (b) => (b.textContent || '').trim().toLowerCase() === 'today'
  );
  if (todayBtn) {
    let prev = todayBtn.previousElementSibling;
    while (prev) {
      if (prev.tagName.toLowerCase() === 'button') {
        return prev as HTMLElement;
      }
      prev = prev.previousElementSibling;
    }
  }

  return null;
}

/**
 * Automatically crawls all months that contain timetable cards sequentially.
 * Navigates to next months using the Next button until no more lecture cards are found
 * or maxMonths is reached.
 */
export async function scanAllMonthsSequentially(
  doc: Document = document,
  context: CalendarContext,
  maxMonths = 6,
  onProgress?: ProgressCallback
): Promise<TimetableEvent[]> {
  const accumulatedEvents: TimetableEvent[] = [];
  let monthsScanned = 0;
  let consecutiveEmptyMonths = 0;

  cancelRequested = false;

  while (monthsScanned < maxMonths && !cancelRequested) {
    monthsScanned++;

    // 1. Wait for calendar to be settled
    await new Promise((r) => setTimeout(r, 400));

    // 2. Resolve fresh month and year from active heading
    const currentHeading = getCalendarHeading(doc);
    const parsedHM = currentHeading ? parseHeadingMonthYear(currentHeading) : null;
    const activeYear = parsedHM?.year || context.year;
    const activeMonth = parsedHM?.month || context.month;

    const currentContext: CalendarContext = {
      ...context,
      year: activeYear,
      month: activeMonth,
      periodLabel: currentHeading || `${context.periodLabel || 'Month ' + monthsScanned}`,
    };

    const displayHeading = currentHeading || currentContext.periodLabel;

    showScraperOverlay(
      doc,
      `[Month ${monthsScanned}] Scanning ${displayHeading}...`,
      () => {
        cancelRequested = true;
      }
    );

    // 3. Enrich all cards in current month
    const monthEvents = await enrichAllCardsSequentially(doc, currentContext, (progress) => {
      if (onProgress) {
        onProgress({
          ...progress,
          cardText: `[${displayHeading}] ${progress.cardText}`,
        });
      }
    });

    if (monthEvents.length > 0) {
      accumulatedEvents.push(...monthEvents);
      consecutiveEmptyMonths = 0;
    } else {
      consecutiveEmptyMonths++;
    }

    if (cancelRequested || consecutiveEmptyMonths >= 2) {
      break;
    }

    // 4. Try navigating to next month
    const nextBtn = findNextMonthButton(doc);
    if (!nextBtn) {
      break; // No next month button
    }

    const prevHeading = currentHeading;
    simulateClick(nextBtn);

    // 5. Wait for calendar heading to change
    let advanced = false;
    for (let wait = 0; wait < 35; wait++) {
      await new Promise((r) => setTimeout(r, 70));
      const newHeading = getCalendarHeading(doc);
      if (newHeading && newHeading !== prevHeading) {
        advanced = true;
        break;
      }
    }

    if (!advanced) {
      break; // Could not advance further
    }

    // 6. Wait for new month's calendar DOM cells and cards to finish mounting
    await new Promise((r) => setTimeout(r, 600));
  }

  hideScraperOverlay(
    `Multi-month scan completed! Collected ${accumulatedEvents.length} events across ${monthsScanned} months.`
  );

  return accumulatedEvents;
}

