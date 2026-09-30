/**
 * NIBM ACA Timetable Exporter - Content Script Coordinator
 * 
 * Runs on https://aca.mynibm.com/*
 * - Listens for DOM changes with debounced MutationObserver (React/Next.js support)
 * - Orchestrates DOM extraction and API interception fallback
 * - Handles runtime messaging with extension popup and background service worker
 * - Guarantees ZERO external network communication and zero credential leakage
 */

import {
  ExtensionMessage,
  ScraperState,
  TimetableEvent,
} from '../types/timetable';
import { setupApiInterceptor } from './api-interceptor';
import {
  getCalendarHeading,
  getElementCleanText,
  parseHeadingMonthYear,
} from './calendar-parser';
import { scrapeActiveModal, scrapeTimetableFromDOM } from './dom-scraper';
import { computeMultiMonthPeriodLabel, computeSummary, deduplicateEvents, mergeModalIntoEvents } from './normalizer';
import { loadScraperState, saveScraperState } from '../storage/storage';
import { enrichAllCardsSequentially, scanAllMonthsSequentially } from './card-enricher';

let currentState: ScraperState = {
  context: {
    connected: true,
    view: 'unknown',
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
    periodLabel: '',
    batch: '',
    url: window.location.href,
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

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastUrl = window.location.href;

import { parseApiPayload } from './api-interceptor';

/**
 * Checks performance resource entries for timetable API requests.
 */
async function checkPerformanceForLectureApi(): Promise<TimetableEvent[]> {
  try {
    const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
    const lectureUrls = resources
      .map((r) => r.name)
      .filter((u) => u.includes('lectures') || (u.includes('dashboard') && u.includes('_rsc')));

    if (lectureUrls.length > 0) {
      const targetUrl = lectureUrls[lectureUrls.length - 1];
      const res = await fetch(targetUrl, { credentials: 'same-origin' });
      if (res.ok) {
        const text = await res.text();
        try {
          const json = JSON.parse(text);
          return parseApiPayload(json, currentState.context.batch);
        } catch {
          // text or RSC response
        }
      }
    }
  } catch (err) {
    console.debug('[NIBM Exporter] Resource check:', err);
  }
  return [];
}

/**
 * Executes scraping cycle and updates internal state + local storage.
 */
async function runExtraction(force = false): Promise<ScraperState> {
  if (currentState.debugMode) {
    console.log('[NIBM Exporter] Running extraction scan (force=' + force + ')...');
  }

  const domResult = scrapeTimetableFromDOM(document, window.location.href);

  // Check performance resource fallback if DOM events have empty times
  let apiEvents: TimetableEvent[] = [];
  try {
    apiEvents = await checkPerformanceForLectureApi();
  } catch {
    // safe fallback
  }

  // Combine newly found DOM events with existing accumulated events and API events
  const combined = [
    ...currentState.events,
    ...domResult.events,
    ...apiEvents,
  ];
  const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(combined);
  const strategy = apiEvents.length > 0 || currentState.events.some((e) => e.source === 'api')
    ? domResult.events.length > 0
      ? 'hybrid'
      : 'api'
    : 'dom';

  const multiPeriod = computeMultiMonthPeriodLabel(uniqueEvents, domResult.context.periodLabel);
  const summary = computeSummary(uniqueEvents, duplicatesRemoved, strategy);

  currentState = {
    ...currentState,
    context: {
      ...domResult.context,
      periodLabel: multiPeriod,
    },
    events: uniqueEvents,
    summary,
  };

  // Persist locally
  saveScraperState(currentState);

  if (currentState.debugMode) {
    console.log('[NIBM Exporter] Extraction complete:', {
      batch: currentState.context.batch,
      period: currentState.context.periodLabel,
      uniqueEvents: currentState.events.length,
      strategy,
    });
  }

  return currentState;
}

/**
 * Debounced trigger for DOM mutations
 */
function requestDebouncedExtraction(delayMs = 600) {
  if (debounceTimer) {
    clearTimeout(debounceTimer);
  }
  debounceTimer = setTimeout(async () => {
    await runExtraction(false);
  }, delayMs);
}

/**
 * Observe Next.js / React SPA navigation and dynamic DOM hydration
 */
function setupDomObserver() {
  const observer = new MutationObserver((mutations) => {
    // Check if URL changed (SPA client-side navigation)
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      requestDebouncedExtraction(400);
      return;
    }

    // Check if calendar cells or table nodes were added or modified
    let calendarMutated = false;
    for (const mutation of mutations) {
      if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
        for (const node of Array.from(mutation.addedNodes)) {
          if (node instanceof HTMLElement) {
            const tag = node.tagName.toLowerCase();
            const cls = (node.className || '').toString();
            if (
              tag === 'table' ||
              tag === 'td' ||
              tag === 'div' ||
              cls.includes('calendar') ||
              cls.includes('grid') ||
              cls.includes('event') ||
              cls.includes('day')
            ) {
              calendarMutated = true;
              break;
            }
          }
        }
      }
      if (calendarMutated) break;
    }

    if (calendarMutated) {
      requestDebouncedExtraction(600);
    }
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });
}

/**
 * Listen for SPA history navigation events
 */
function setupHistoryListeners() {
  const handleUrlChange = () => {
    if (window.location.href !== lastUrl) {
      lastUrl = window.location.href;
      requestDebouncedExtraction(400);
    }
  };

  window.addEventListener('popstate', handleUrlChange);

  // Monkey-patch history pushState/replaceState
  const origPush = history.pushState;
  history.pushState = function (...args) {
    origPush.apply(this, args);
    handleUrlChange();
  };

  const origReplace = history.replaceState;
  history.replaceState = function (...args) {
    origReplace.apply(this, args);
    handleUrlChange();
  };
}

/**
 * Programmatically triggers modals for all visible cards sequentially to enrich lecturer, room, and time.
 */
async function autoEnrichFromModals(): Promise<ScraperState> {
  if (currentState.debugMode) {
    console.log('[NIBM Exporter] Starting automated card crawling & modal enrichment...');
  }

  const activeHeading = getCalendarHeading(document);
  const parsedHM = activeHeading ? parseHeadingMonthYear(activeHeading) : null;
  const activeContext: CalendarContext = {
    ...currentState.context,
    year: parsedHM?.year || currentState.context.year,
    month: parsedHM?.month || currentState.context.month,
    periodLabel: activeHeading || currentState.context.periodLabel,
  };

  const enrichedEvents = await enrichAllCardsSequentially(
    document,
    activeContext,
    (progress) => {
      // Send live progress update to popup
      try {
        chrome.runtime.sendMessage({
          action: 'ENRICH_PROGRESS',
          payload: progress,
        }).catch(() => {});
      } catch {
        // safe ignore if popup is closed
      }
    }
  );

  if (enrichedEvents.length > 0) {
    // Accumulate newly crawled rich events with all existing events
    const combined = [
      ...currentState.events,
      ...enrichedEvents,
    ];

    const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(combined);
    const multiPeriod = computeMultiMonthPeriodLabel(uniqueEvents, currentState.context.periodLabel);
    currentState = {
      ...currentState,
      context: {
        ...currentState.context,
        periodLabel: multiPeriod,
      },
      events: uniqueEvents,
      summary: computeSummary(uniqueEvents, duplicatesRemoved, 'dom'),
    };

    saveScraperState(currentState);
  }

  return currentState;
}

/**
 * Message handler for extension popup and background worker
 */
function setupMessageListener() {
  chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, _sender, sendResponse) => {
      switch (message.action) {
        case 'PING':
          sendResponse({
            connected: true,
            url: window.location.href,
            batch: currentState.context.batch,
            period: currentState.context.periodLabel,
          });
          break;

        case 'SCAN_PAGE': {
          runExtraction(true)
            .then(async (result) => {
              // Automatically enrich if cards lack lecturer, room, or times
              const needsEnrichment = result.events.length > 0 && result.events.some((e) => !e.lecturer || !e.room || !e.startTime);
              if (needsEnrichment) {
                const enriched = await autoEnrichFromModals();
                sendResponse(enriched);
              } else {
                sendResponse(result);
              }
            })
            .catch((err) => {
              sendResponse({ error: String(err) });
            });
          break;
        }

        case 'ENRICH_DETAILS': {
          autoEnrichFromModals()
            .then((result) => {
              sendResponse(result);
            })
            .catch((err) => {
              sendResponse({ error: String(err) });
            });
          break;
        }

        case 'SCAN_ALL_MONTHS': {
          const activeHeading = getCalendarHeading(document);
          const parsedHM = activeHeading ? parseHeadingMonthYear(activeHeading) : null;
          const activeContext: CalendarContext = {
            ...currentState.context,
            year: parsedHM?.year || currentState.context.year,
            month: parsedHM?.month || currentState.context.month,
            periodLabel: activeHeading || currentState.context.periodLabel,
          };

          scanAllMonthsSequentially(document, activeContext, 6, (progress) => {
            try {
              chrome.runtime.sendMessage({
                action: 'ENRICH_PROGRESS',
                payload: progress,
              }).catch(() => {});
            } catch {
              // safe ignore
            }
          })
            .then((scannedEvents) => {
              const combined = [...currentState.events, ...scannedEvents];
              const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(combined);
              const multiPeriod = computeMultiMonthPeriodLabel(
                uniqueEvents,
                currentState.context.periodLabel
              );
              currentState = {
                ...currentState,
                context: {
                  ...currentState.context,
                  periodLabel: multiPeriod,
                },
                events: uniqueEvents,
                summary: computeSummary(uniqueEvents, duplicatesRemoved, 'dom'),
              };
              saveScraperState(currentState);
              sendResponse(currentState);
            })
            .catch((err) => {
              sendResponse({ error: String(err) });
            });
          break;
        }

        case 'CLEAR_DATA': {
          currentState = {
            ...currentState,
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
          };
          saveScraperState(currentState);
          sendResponse(currentState);
          break;
        }

        case 'GET_STATE':
          sendResponse(currentState);
          break;

        case 'SET_DEBUG_MODE': {
          currentState.debugMode = Boolean(message.payload);
          saveScraperState(currentState);
          sendResponse({ success: true, debugMode: currentState.debugMode });
          break;
        }

        case 'TOGGLE_AUTO_REFRESH': {
          currentState.autoRefresh = Boolean(message.payload);
          saveScraperState(currentState);
          sendResponse({ success: true, autoRefresh: currentState.autoRefresh });
          break;
        }

        default:
          sendResponse({ error: 'Unknown action' });
      }
      return true; // Keep channel open for async response
    }
  );

  // Instant capture when user clicks any lecture card manually
  document.addEventListener(
    'click',
    () => {
      [100, 250, 450].forEach((delay) => {
        setTimeout(() => {
          const modal = scrapeActiveModal(document, currentState.context);
          if (modal && modal.date && modal.courseCode && (modal.lecturer || modal.room || modal.startTime)) {
            const updated = mergeModalIntoEvents(currentState.events, modal);
            if (updated) {
              const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(currentState.events);
              currentState.events = uniqueEvents;
              currentState.summary = computeSummary(uniqueEvents, duplicatesRemoved, 'dom');
              saveScraperState(currentState);
            }
          }
        }, delay);
      });
    },
    true
  );

  // MutationObserver on document.body for instant modal detection
  try {
    const modalObserver = new MutationObserver(() => {
      const dialog = document.querySelector(
        '[role="dialog"], [class*="modal"], [class*="popup"], div[class*="fixed"][class*="z-"]'
      );
      if (dialog) {
        setTimeout(() => {
          const modal = scrapeActiveModal(document, currentState.context);
          if (modal && modal.date && modal.courseCode && (modal.lecturer || modal.room || modal.startTime)) {
            const updated = mergeModalIntoEvents(currentState.events, modal);
            if (updated) {
              const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(currentState.events);
              currentState.events = uniqueEvents;
              currentState.summary = computeSummary(uniqueEvents, duplicatesRemoved, 'dom');
              saveScraperState(currentState);
            }
          }
        }, 80);
      }
    });

    modalObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  } catch {
    // safe fallback
  }
}

/**
 * Initialization lifecycle
 */
async function initialize() {
  // Load saved state if any
  const saved = await loadScraperState();
  if (saved && saved.events && saved.events.length > 0) {
    currentState = saved;
  }

  // Setup safe API interception fallback
  setupApiInterceptor((apiEvents) => {
    if (apiEvents.length > 0) {
      const merged = [...currentState.events, ...apiEvents];
      const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(merged);
      const summary = computeSummary(uniqueEvents, duplicatesRemoved, 'api');
      currentState = {
        ...currentState,
        events: uniqueEvents,
        summary,
      };
      saveScraperState(currentState);
    }
  });

  // Setup DOM and navigation observers
  setupDomObserver();
  setupHistoryListeners();
  setupMessageListener();

  // Initial scan after DOM settles
  if (document.readyState === 'complete') {
    setTimeout(() => runExtraction(false), 500);
  } else {
    window.addEventListener('load', () => {
      setTimeout(() => runExtraction(false), 500);
    });
  }
}

initialize();
