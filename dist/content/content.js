"use strict";
(() => {
  // src/types/timetable.ts
  var KNOWN_TYPES = {
    LP: { label: "Lecture (Physical)", mode: "Physical" },
    LO: { label: "Lecture (Online)", mode: "Online" },
    TU: { label: "Tutorial", mode: "Physical" },
    LB: { label: "Lab", mode: "Physical" },
    SM: { label: "Seminar", mode: "Physical" },
    WS: { label: "Workshop", mode: "Physical" },
    EX: { label: "Exam", mode: "Physical" },
    VV: { label: "Viva", mode: "Physical" },
    PR: { label: "Presentation", mode: "Physical" },
    CW: { label: "Course Work", mode: "Unknown" },
    PC: { label: "Practical", mode: "Physical" }
  };

  // src/content/normalizer.ts
  function resolveTypeInfo(rawType) {
    const clean = (rawType || "").trim().toUpperCase();
    if (!clean) {
      return {
        normalizedCode: "",
        typeLabel: "",
        mode: "Unknown"
      };
    }
    if (clean.includes("LECTURE PHYSICAL") || clean.includes("LECTURE (PHYSICAL)")) {
      return { normalizedCode: "LP", typeLabel: KNOWN_TYPES.LP.label, mode: "Physical" };
    }
    if (clean.includes("LECTURE ONLINE") || clean.includes("LECTURE (ONLINE)")) {
      return { normalizedCode: "LO", typeLabel: KNOWN_TYPES.LO.label, mode: "Online" };
    }
    if (clean.includes("TUTORIAL")) {
      return { normalizedCode: "TU", typeLabel: KNOWN_TYPES.TU.label, mode: "Physical" };
    }
    if (clean.includes("PRACTICAL")) {
      return { normalizedCode: "PC", typeLabel: KNOWN_TYPES.PC.label, mode: "Physical" };
    }
    if (clean.includes("SEMINAR")) {
      return { normalizedCode: "SM", typeLabel: KNOWN_TYPES.SM.label, mode: "Physical" };
    }
    if (clean.includes("WORKSHOP")) {
      return { normalizedCode: "WS", typeLabel: KNOWN_TYPES.WS.label, mode: "Physical" };
    }
    if (clean.includes("EXAM")) {
      return { normalizedCode: "EX", typeLabel: KNOWN_TYPES.EX.label, mode: "Physical" };
    }
    if (clean.includes("VIVA")) {
      return { normalizedCode: "VV", typeLabel: KNOWN_TYPES.VV.label, mode: "Physical" };
    }
    if (clean.includes("PRESENTATION")) {
      return { normalizedCode: "PR", typeLabel: KNOWN_TYPES.PR.label, mode: "Physical" };
    }
    if (clean.includes("COURSE WORK") || clean.includes("COURSEWORK")) {
      return { normalizedCode: "CW", typeLabel: KNOWN_TYPES.CW.label, mode: "Unknown" };
    }
    if (clean.includes("LAB")) {
      return { normalizedCode: "LB", typeLabel: KNOWN_TYPES.LB.label, mode: "Physical" };
    }
    if (KNOWN_TYPES[clean]) {
      return {
        normalizedCode: clean,
        typeLabel: KNOWN_TYPES[clean].label,
        mode: KNOWN_TYPES[clean].mode
      };
    }
    for (const [code, info] of Object.entries(KNOWN_TYPES)) {
      const pattern = new RegExp(`(^|\\b|\\[)${code}(\\b|\\]|$)`, "i");
      if (pattern.test(clean)) {
        return {
          normalizedCode: code,
          typeLabel: info.label,
          mode: info.mode
        };
      }
    }
    const lower = rawType.toLowerCase();
    let mode = "Unknown";
    if (lower.includes("online") || lower.includes("zoom") || lower.includes("teams")) {
      mode = "Online";
    } else if (lower.includes("physical") || lower.includes("hall") || lower.includes("campus")) {
      mode = "Physical";
    }
    return {
      normalizedCode: clean.length <= 4 ? clean : clean.slice(0, 4),
      typeLabel: rawType.trim(),
      mode
    };
  }
  function normalizeTimeString(timeStr) {
    if (!timeStr) return "";
    const clean = timeStr.trim();
    const match12 = clean.match(/^(\d{1,2})[:.](\d{2})\s*(am|pm)?$/i);
    if (match12) {
      let hour = parseInt(match12[1], 10);
      const minute = match12[2];
      const modifier = match12[3] ? match12[3].toLowerCase() : null;
      if (modifier === "pm" && hour < 12) hour += 12;
      if (modifier === "am" && hour === 12) hour = 0;
      const hh = hour.toString().padStart(2, "0");
      return `${hh}:${minute}`;
    }
    const match24 = clean.match(/^(\d{1,2})[:.](\d{2})$/);
    if (match24) {
      const hh = parseInt(match24[1], 10).toString().padStart(2, "0");
      const mm = match24[2];
      return `${hh}:${mm}`;
    }
    const matchEmbed = clean.match(/\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i);
    if (matchEmbed && (matchEmbed[0].includes(":") || matchEmbed[0].includes("."))) {
      let hour = parseInt(matchEmbed[1], 10);
      const minute = matchEmbed[2];
      const modifier = matchEmbed[3] ? matchEmbed[3].toLowerCase() : null;
      if (modifier === "pm" && hour < 12) hour += 12;
      if (modifier === "am" && hour === 12) hour = 0;
      const hh = hour.toString().padStart(2, "0");
      return `${hh}:${minute}`;
    }
    return "";
  }
  function mergeModalIntoEvents(events, modal) {
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
      if (modal.mode && modal.mode !== "Unknown") target.mode = modal.mode;
      return true;
    }
    return false;
  }
  function parseTimeRange(timeRangeStr) {
    if (!timeRangeStr) return { startTime: "", endTime: "" };
    const parts = timeRangeStr.split(/[-–—~]|to/i).map((p) => p.trim());
    if (parts.length >= 2) {
      return {
        startTime: normalizeTimeString(parts[0]),
        endTime: normalizeTimeString(parts[1])
      };
    }
    return {
      startTime: normalizeTimeString(parts[0] || ""),
      endTime: ""
    };
  }
  function formatISODate(year, month, day) {
    const y = year.toString();
    const m = month.toString().padStart(2, "0");
    const d = day.toString().padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  function getDayOfWeekName(dateStr) {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return "";
    const [y, m, d] = dateStr.split("-").map(Number);
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString("en-US", { weekday: "long" });
  }
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash |= 0;
    }
    return Math.abs(hash).toString(16).padStart(8, "0");
  }
  function generateEventFingerprint(ev) {
    const course = (ev.courseCode || ev.courseName || "").toUpperCase().trim();
    const key = [
      ev.date || "",
      ev.startTime || "",
      ev.endTime || "",
      (ev.type || "").toUpperCase(),
      course,
      (ev.room || "").toLowerCase().trim(),
      (ev.lecturer || "").toLowerCase().trim(),
      (ev.batch || "").toUpperCase().trim()
    ].join("|");
    return `ev_${hashString(key)}`;
  }
  function normalizeEvent(raw, defaultBatch = "", defaultDate = "") {
    const date = raw.date ? raw.date.trim() : defaultDate;
    const dayOfWeek = raw.dayOfWeek || getDayOfWeekName(date);
    const rawTimeRange = raw.startTime && raw.endTime ? "" : raw.rawText || "";
    let startTime = normalizeTimeString(raw.startTime || "");
    let endTime = normalizeTimeString(raw.endTime || "");
    if ((!startTime || !endTime) && rawTimeRange) {
      const parsed = parseTimeRange(rawTimeRange);
      if (!startTime && parsed.startTime) startTime = parsed.startTime;
      if (!endTime && parsed.endTime) endTime = parsed.endTime;
    }
    const { normalizedCode, typeLabel, mode } = resolveTypeInfo(raw.type || "");
    const courseCode = (raw.courseCode || "").trim();
    const courseName = (raw.courseName || "").trim();
    const lecturer = (raw.lecturer || "").trim();
    const room = (raw.room || "").trim();
    const batch = (raw.batch || defaultBatch || "").trim();
    const source = raw.source || "dom";
    const eventData = {
      id: raw.id || "",
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
      rawText: raw.rawText || ""
    };
    if (!eventData.id) {
      eventData.id = generateEventFingerprint(eventData);
    }
    return eventData;
  }
  function deduplicateEvents(events) {
    const result = [];
    let duplicatesRemoved = 0;
    for (const ev of events) {
      const course = (ev.courseCode || ev.courseName || "").toUpperCase().trim();
      const evRoom = (ev.room || "").toLowerCase().trim();
      const evLec = (ev.lecturer || "").toLowerCase().trim();
      const existingIndex = result.findIndex((item) => {
        const itemCourse = (item.courseCode || item.courseName || "").toUpperCase().trim();
        const itemRoom = (item.room || "").toLowerCase().trim();
        const itemLec = (item.lecturer || "").toLowerCase().trim();
        const sameDateAndType = item.date === ev.date && (item.type || "").toUpperCase() === (ev.type || "").toUpperCase() && (itemCourse === course || !itemCourse || !course);
        if (!sameDateAndType) return false;
        if (item.startTime && ev.startTime) {
          return item.startTime === ev.startTime && item.endTime === ev.endTime;
        }
        if ((item.startTime || itemRoom || itemLec) && !ev.startTime && !evRoom && !evLec) {
          return true;
        }
        if (!item.startTime && !itemRoom && !itemLec && (ev.startTime || evRoom || evLec)) {
          return true;
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
          mode: existing.mode !== "Unknown" ? existing.mode : ev.mode
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
  function computeSummary(events, duplicatesRemoved, strategy = "dom") {
    const missing = {
      startTime: 0,
      endTime: 0,
      type: 0,
      courseCode: 0,
      courseName: 0,
      lecturer: 0,
      room: 0
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
      lastScannedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString("en-LK", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit"
      })
    };
  }

  // src/content/api-interceptor.ts
  function parseApiDateTime(dtStr) {
    if (!dtStr) return { date: "", time: "" };
    try {
      const dt = new Date(dtStr);
      if (!isNaN(dt.getTime())) {
        const year = dt.getFullYear();
        const month = (dt.getMonth() + 1).toString().padStart(2, "0");
        const day = dt.getDate().toString().padStart(2, "0");
        const hours = dt.getHours().toString().padStart(2, "0");
        const minutes = dt.getMinutes().toString().padStart(2, "0");
        return {
          date: `${year}-${month}-${day}`,
          time: `${hours}:${minutes}`
        };
      }
    } catch {
    }
    const match = dtStr.match(/(\d{4}-\d{2}-\d{2})[T\s](\d{1,2}:\d{2})/);
    if (match) {
      return {
        date: match[1],
        time: normalizeTimeString(match[2])
      };
    }
    return { date: "", time: "" };
  }
  function parseApiPayload(payload, defaultBatch = "") {
    if (!payload) return [];
    let items = [];
    if (Array.isArray(payload)) {
      items = payload;
    } else if (typeof payload === "object") {
      if (Array.isArray(payload.lectures)) items = payload.lectures;
      else if (Array.isArray(payload.events)) items = payload.events;
      else if (Array.isArray(payload.data)) items = payload.data;
      else if (Array.isArray(payload.schedule)) items = payload.schedule;
      else if (Array.isArray(payload.items)) items = payload.items;
    }
    const parsedEvents = [];
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const startObj = parseApiDateTime(item.startAt || item.startTime || item.start || item.from);
      const endObj = parseApiDateTime(item.endAt || item.endTime || item.end || item.to);
      const date = item.date || startObj.date || "";
      const startTime = startObj.time || normalizeTimeString(item.startTime || "");
      const endTime = endObj.time || normalizeTimeString(item.endTime || "");
      const type = item.type || item.lectureType || item.eventType || item.code || "";
      const courseCode = item.courseCode || item.moduleCode || item.subjectCode || item.module?.code || item.course?.code || "";
      const courseName = item.courseName || item.moduleName || item.subjectName || item.module?.name || item.course?.name || item.title || "";
      const lecturer = item.lecturer || item.lecturerName || item.lecturer?.name || item.staff || item.teacher || "";
      const room = item.room || item.roomName || item.hall || item.hallName || item.venue || item.location || "";
      const batch = item.batch || item.batchCode || item.batchName || defaultBatch || "";
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
            source: "api"
          },
          defaultBatch,
          date
        );
        parsedEvents.push(normalized);
      }
    }
    return parsedEvents;
  }
  function setupApiInterceptor(callback) {
    try {
      const script = document.createElement("script");
      script.src = chrome.runtime.getURL("content/page-interceptor.js");
      script.onload = () => script.remove();
      (document.head || document.documentElement).appendChild(script);
    } catch (err) {
      console.debug("[NIBM Exporter] Page interceptor injection skipped:", err);
    }
    const messageHandler = (event) => {
      if (event.origin !== window.location.origin) return;
      if (!event.data || event.data.type !== "NIBM_ACA_API_INTERCEPTED") return;
      try {
        const events = parseApiPayload(event.data.payload);
        if (events.length > 0) {
          callback(events, event.data.sourceUrl || "api");
        }
      } catch {
      }
    };
    window.addEventListener("message", messageHandler);
    return () => {
      window.removeEventListener("message", messageHandler);
    };
  }

  // src/content/calendar-parser.ts
  var MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];
  function extractPageContext(doc = document, currentUrl = window.location.href) {
    const urlObj = new URL(currentUrl);
    const params = urlObj.searchParams;
    let view = "unknown";
    const urlView = (params.get("view") || "").toLowerCase();
    if (urlView === "month" || urlView === "week" || urlView === "day") {
      view = urlView;
    } else {
      const activeBtn = doc.querySelector(
        '[aria-selected="true"], button[class*="active"], button[data-state="active"]'
      );
      const btnText = (activeBtn?.textContent || "").toLowerCase();
      if (btnText.includes("month")) view = "month";
      else if (btnText.includes("week")) view = "week";
      else if (btnText.includes("day")) view = "day";
      else view = "month";
    }
    let batch = "";
    const batchId = params.get("batch") || void 0;
    const batchRegex = /\b([A-Z]{2,5}\d{2,4}[A-Z\d]*)\b/;
    const batchElements = doc.querySelectorAll(
      '[data-testid*="batch"], [class*="batch"], [aria-label*="batch"], button, select, h1, h2, h3, header span, .dropdown-trigger'
    );
    for (const el of Array.from(batchElements)) {
      const text = el.textContent || "";
      const match = text.match(batchRegex);
      if (match && match[1]) {
        if (!["BATCH", "STUDENT", "MONTH", "WEEK", "NIBM"].includes(match[1])) {
          batch = match[1];
          break;
        }
      }
    }
    if (!batch) {
      const select = doc.querySelector("select");
      if (select && select.selectedOptions && select.selectedOptions[0]) {
        const optText = select.selectedOptions[0].textContent?.trim() || "";
        const m = optText.match(batchRegex);
        if (m) batch = m[1];
      }
    }
    if (!batch && batchId) {
      batch = `Batch-${batchId.slice(0, 8)}`;
    } else if (!batch) {
      batch = "Default Batch";
    }
    let year = parseInt(params.get("year") || "", 10);
    let month = parseInt(params.get("month") || "", 10);
    let periodLabel = "";
    const headingElements = doc.querySelectorAll(
      'h1, h2, h3, h4, [class*="title"], [class*="heading"], [class*="calendar-header"], [data-testid*="calendar-header"]'
    );
    for (const el of Array.from(headingElements)) {
      const txt = (el.textContent || "").trim();
      for (let mIndex = 0; mIndex < MONTH_NAMES.length; mIndex++) {
        const mName = MONTH_NAMES[mIndex];
        if (txt.includes(mName)) {
          const yMatch = txt.match(/\b(20\d\d)\b/);
          if (yMatch) {
            year = parseInt(yMatch[1], 10);
            month = mIndex + 1;
            periodLabel = `${mName} ${year}`;
            break;
          }
        }
      }
      if (periodLabel) break;
    }
    const now = /* @__PURE__ */ new Date();
    if (!year || isNaN(year)) year = now.getFullYear();
    if (!month || isNaN(month)) {
      month = now.getMonth() + 1;
    } else if (month <= 11 && params.has("month")) {
      if (!periodLabel) {
        const mVal = month;
        month = mVal >= 1 && mVal <= 12 ? mVal : mVal + 1;
      }
    }
    if (!periodLabel) {
      const mName = MONTH_NAMES[(month - 1 + 12) % 12];
      periodLabel = `${mName} ${year}`;
    }
    const isAcaDomain = urlObj.hostname === "aca.mynibm.com" || urlObj.hostname.endsWith(".mynibm.com") || urlObj.href.includes("aca.mynibm.com");
    return {
      connected: isAcaDomain,
      view,
      year,
      month,
      periodLabel,
      batch,
      batchId,
      url: currentUrl
    };
  }
  function resolveCellDate(dayNum, isOutsideMonth, cellIndex, context) {
    let { year, month } = context;
    if (isOutsideMonth) {
      if (cellIndex < 14 && dayNum > 15) {
        month -= 1;
        if (month < 1) {
          month = 12;
          year -= 1;
        }
      } else if (cellIndex > 20 && dayNum < 15) {
        month += 1;
        if (month > 12) {
          month = 1;
          year += 1;
        }
      }
    }
    return formatISODate(year, month, dayNum);
  }
  function getElementCleanText(el) {
    if ("innerText" in el && typeof el.innerText === "string") {
      const it = el.innerText;
      if (it) return it.replace(/\s+/g, " ").trim();
    }
    const clone = el.cloneNode(true);
    const junk = clone.querySelectorAll("script, style, noscript, svg");
    junk.forEach((j) => j.remove());
    const allChildren = clone.querySelectorAll("*");
    allChildren.forEach((child) => {
      child.insertAdjacentText("afterend", " ");
    });
    return (clone.textContent || "").replace(/\s+/g, " ").trim();
  }
  function parseEventCard(cardEl, resolvedDate, context) {
    const baseText = getElementCleanText(cardEl);
    const titleAttr = cardEl.getAttribute("title") || "";
    const ariaAttr = cardEl.getAttribute("aria-label") || "";
    const rawText = `${baseText} ${titleAttr} ${ariaAttr}`.replace(/\s+/g, " ").trim();
    const attrType = cardEl.getAttribute("data-type") || cardEl.getAttribute("data-event-type");
    const attrCourse = cardEl.getAttribute("data-course") || cardEl.getAttribute("data-course-code");
    const attrRoom = cardEl.getAttribute("data-room") || cardEl.getAttribute("data-hall");
    const attrLecturer = cardEl.getAttribute("data-lecturer");
    const attrTime = cardEl.getAttribute("data-time") || cardEl.getAttribute("data-time-range");
    let eventType = attrType || "";
    if (!eventType) {
      const pill = cardEl.querySelector('[class*="type"], [class*="badge"], [class*="tag"], span');
      const pillText = pill ? (pill.textContent || "").trim().toUpperCase() : "";
      if (pillText && resolveTypeInfo(pillText).normalizedCode) {
        eventType = pillText;
      } else {
        const typeMatch = rawText.match(/\b(LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC)\b/i);
        if (typeMatch) {
          eventType = typeMatch[1].toUpperCase();
        }
      }
    }
    let startTime = "";
    let endTime = "";
    if (attrTime) {
      const parsed = parseTimeRange(attrTime);
      startTime = parsed.startTime;
      endTime = parsed.endTime;
    } else {
      const timeMatch = rawText.match(
        /(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*(?:[-–—~]|to)\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i
      );
      if (timeMatch) {
        startTime = normalizeTimeString(timeMatch[1]);
        endTime = normalizeTimeString(timeMatch[2]);
      } else {
        const singleTimeMatch = rawText.match(/\b(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\b/i);
        if (singleTimeMatch) {
          startTime = normalizeTimeString(singleTimeMatch[1]);
        }
      }
    }
    let courseCode = attrCourse || "";
    if (!courseCode) {
      const codeEl = cardEl.querySelector(
        '[class*="course-code"], [class*="module-code"], [class*="subject-code"], [class*="code"]'
      );
      if (codeEl) {
        courseCode = getElementCleanText(codeEl).replace(/\s+/g, "");
      }
    }
    if (!courseCode) {
      const codeMatch = rawText.match(/\b([A-Z]{2,5}[-\s]?\d{2,4})\b/);
      if (codeMatch) {
        courseCode = codeMatch[1].replace(/\s+/g, "");
      } else {
        const hyphenMatch = rawText.match(/\b([A-Z]{2,5}\s*-\s*\d{1,2})\b/);
        if (hyphenMatch) {
          courseCode = hyphenMatch[1].replace(/\s+/g, " ");
        } else {
          const words = rawText.split(/[\s,–—~-]+/).map((w) => w.trim().toUpperCase());
          const IGNORE_WORDS = /* @__PURE__ */ new Set([
            "LP",
            "LO",
            "TU",
            "LB",
            "SM",
            "WS",
            "EX",
            "VV",
            "PR",
            "CW",
            "PC",
            "AM",
            "PM",
            "HALL",
            "LAB",
            "ROOM",
            "ONLINE",
            "ZOOM",
            "MON",
            "TUE",
            "WED",
            "THU",
            "FRI",
            "SAT",
            "SUN"
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
    let lecturer = attrLecturer || "";
    if (!lecturer) {
      const lecEl = cardEl.querySelector(
        '[class*="lecturer"], [class*="teacher"], [class*="instructor"], [class*="staff"], [data-testid*="lecturer"]'
      );
      if (lecEl) {
        lecturer = getElementCleanText(lecEl);
      }
    }
    if (!lecturer) {
      const lecMatch = rawText.match(
        /\b((?:Dr|Prof|Mr|Ms|Mrs)\.?\s+(?:[A-Z]\.?\s+)*[A-Z][a-z]+(?:\s+(?!(?:Hall|Lab|Room|LH|Audi|Online|Lecture)\b)[A-Z][a-z]+)?)\b/
      );
      if (lecMatch) {
        lecturer = lecMatch[1].trim();
      }
    }
    let room = attrRoom || "";
    if (!room) {
      const roomEl = cardEl.querySelector(
        '[class*="room"], [class*="hall"], [class*="venue"], [class*="location"], [data-testid*="room"]'
      );
      if (roomEl) {
        room = getElementCleanText(roomEl);
      }
    }
    if (!room) {
      const roomMatch = rawText.match(
        /\b((?:Lecture\s+Hall|Hall|Lab|Room|LH|Audi|Auditorium)[-\s]?[A-Za-z0-9]+(?:\s*-\s*[A-Za-z0-9\s]+)?)\b/i
      );
      if (roomMatch) {
        room = roomMatch[1].trim();
      } else if (rawText.toLowerCase().includes("online") || rawText.toLowerCase().includes("zoom")) {
        room = "Online";
      }
    }
    let courseName = "";
    const nameEl = cardEl.querySelector(
      '[class*="course-name"], [class*="module-name"], [class*="subject-name"], [class*="subject"], h4, h5, h6, strong, b'
    );
    if (nameEl) {
      const t = getElementCleanText(nameEl);
      if (t && t !== courseCode && t !== eventType && !t.includes(startTime) && t !== lecturer && t !== room) {
        courseName = t;
      }
    }
    if (!courseName) {
      const lines = (cardEl.textContent || "").split("\n").map((l) => l.trim()).filter((l) => l.length > 2);
      for (const line of lines) {
        if (line !== courseCode && line !== eventType && line !== lecturer && line !== room && !line.includes(startTime) && !line.match(/^\d+$/)) {
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
      source: "dom",
      rawText
    };
  }

  // src/content/dom-scraper.ts
  function isCellOutsideCurrentMonth(el) {
    const checkString = `${el.className || ""} ${el.getAttribute("data-state") || ""}`.toLowerCase();
    const outsideKeywords = [
      "outside",
      "other-month",
      "prev-month",
      "next-month",
      "muted",
      "opacity-40",
      "opacity-50",
      "text-gray-300",
      "text-gray-400",
      "day-outside",
      "disabled"
    ];
    return outsideKeywords.some((kw) => checkString.includes(kw));
  }
  function scrapeMonthView(doc, context) {
    const events = [];
    const cellSelectors = [
      '[role="gridcell"]',
      'td[class*="day"]',
      "td",
      '[data-testid*="day-cell"]',
      '[data-testid*="calendar-day"]',
      'div[class*="calendar-day"]',
      'div[class*="day-cell"]',
      'div[class*="DayCell"]',
      'div[class*="calendar_cell"]',
      ".rbc-day-bg",
      ".fc-daygrid-day"
    ];
    let cells = [];
    for (const selector of cellSelectors) {
      const found = Array.from(doc.querySelectorAll(selector));
      if (found.length >= 28) {
        cells = found;
        break;
      }
    }
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
      let dayNum = null;
      const dateAttr = cell.getAttribute("data-date") || cell.getAttribute("data-day");
      let resolvedDate = "";
      if (dateAttr && /^\d{4}-\d{2}-\d{2}$/.test(dateAttr)) {
        resolvedDate = dateAttr;
      } else {
        const allDesc = Array.from(cell.querySelectorAll("*"));
        for (const d of allDesc) {
          if (d.children.length > 0) continue;
          const t = getElementCleanText(d);
          if (/^([1-9]|[12]\d|3[01])$/.test(t)) {
            dayNum = parseInt(t, 10);
            break;
          }
        }
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
      const structuredCards = Array.from(
        cell.querySelectorAll('.event-card, [class*="event-card"]')
      );
      if (structuredCards.length > 0) {
        for (const card of structuredCards) {
          events.push(parseEventCard(card, resolvedDate, context));
        }
        return;
      }
      const BADGE_REGEX = /\b(LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC)(?![a-z])\s*[-:]?\s*([A-Za-z0-9\s/-]{1,15})/i;
      const candidates = Array.from(cell.querySelectorAll("*")).filter((el) => {
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
          if (courseCode.startsWith("-")) courseCode = courseCode.slice(1).trim();
          const reactProps = extractReactPropsFromElement(item);
          const { mode, typeLabel } = resolveTypeInfo(eventType);
          events.push({
            date: resolvedDate,
            dayOfWeek: getDayOfWeekName(resolvedDate),
            startTime: reactProps?.startTime ? normalizeTimeString(reactProps.startTime) : "",
            endTime: reactProps?.endTime ? normalizeTimeString(reactProps.endTime) : "",
            type: eventType,
            typeLabel,
            courseCode: reactProps?.courseCode || courseCode,
            courseName: reactProps?.courseName || "",
            lecturer: reactProps?.lecturer || "",
            room: reactProps?.room || (mode === "Online" ? "Online" : ""),
            mode,
            batch: context.batch,
            source: "dom",
            rawText
          });
        }
      }
    });
    return events;
  }
  function scrapeWeekView(doc, context) {
    const events = [];
    const colSelectors = [
      '[role="columnheader"]',
      "th",
      'div[class*="col"]',
      'div[class*="week-day"]',
      ".rbc-time-column"
    ];
    let columns = [];
    for (const sel of colSelectors) {
      const cols = Array.from(doc.querySelectorAll(sel));
      if (cols.length >= 5 && cols.length <= 7) {
        columns = cols;
        break;
      }
    }
    columns.forEach((col, idx) => {
      const headerText = col.textContent || "";
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
  function scrapeDayView(doc, context) {
    const events = [];
    let resolvedDate = formatISODate(context.year, context.month, 1);
    const header = doc.querySelector('h1, h2, h3, [class*="date-header"]');
    if (header) {
      const txt = header.textContent || "";
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
  function scrapeGenericFallback(doc, context) {
    const events = [];
    const candidates = Array.from(
      doc.querySelectorAll("div, li, tr, section, article")
    ).filter((el) => {
      const txt = el.textContent || "";
      return /\b(LP|LO|TU|LB|EX|WS|CW)\b/i.test(txt) && /\d{1,2}[:.]\d{2}/.test(txt) && el.children.length <= 8;
    });
    for (const item of candidates) {
      let resolvedDate = formatISODate(context.year, context.month, 1);
      const dateAttr = item.closest("[data-date]")?.getAttribute("data-date");
      if (dateAttr) resolvedDate = dateAttr;
      const ev = parseEventCard(item, resolvedDate, context);
      if (ev.courseCode || ev.type || ev.startTime) {
        events.push(ev);
      }
    }
    return events;
  }
  function extractReactPropsFromElement(el) {
    try {
      const keys = Object.keys(el);
      const reactKey = keys.find((k) => k.startsWith("__reactFiber$") || k.startsWith("__reactProps$"));
      if (!reactKey) return null;
      let curr = el[reactKey];
      for (let depth = 0; depth < 8 && curr; depth++) {
        const p = curr.memoizedProps || curr.props || curr;
        if (p) {
          const item = p.lecture || p.event || p.data || p.slot || p.item;
          if (item && typeof item === "object") {
            return {
              startTime: item.startAt || item.startTime || item.from,
              endTime: item.endAt || item.endTime || item.to,
              lecturer: item.lecturer || item.lecturerName || item.staff || item.teacher,
              room: item.hall || item.hallName || item.room || item.location || item.venue,
              courseName: item.moduleName || item.courseName || item.title || item.name,
              courseCode: item.moduleCode || item.courseCode || item.code || item.module
            };
          }
        }
        curr = curr.return || curr.parent;
      }
    } catch {
    }
    return null;
  }
  function scrapeAcaBadges(doc, context) {
    const events = [];
    const TYPE_PREFIXES = "LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC";
    const BADGE_REGEX = new RegExp(`(?:^|\\b)(${TYPE_PREFIXES})(?:\\b|\\s*[-:]?\\s*)([A-Za-z0-9\\s/-]{1,15})`, "i");
    const candidates = Array.from(doc.querySelectorAll("*")).filter((el) => {
      if (["SCRIPT", "STYLE", "SVG", "PATH", "HEAD"].includes(el.tagName)) return false;
      if (el.closest('footer, [role="dialog"], header, nav')) return false;
      if (el.children.length > 3) return false;
      const t = getElementCleanText(el);
      if (t.length < 3 || t.length > 40) return false;
      if (t.toLowerCase().includes("lecture (physical)") || t.toLowerCase().includes("lecture (online)")) return false;
      return BADGE_REGEX.test(t);
    });
    const distinct = candidates.filter((el) => {
      return !Array.from(el.children).some((c) => candidates.includes(c));
    });
    for (const badge of distinct) {
      const rawText = getElementCleanText(badge);
      const match = rawText.match(BADGE_REGEX);
      if (!match) continue;
      const eventType = match[1].toUpperCase();
      let courseCode = match[2].trim();
      if (courseCode.startsWith("-")) courseCode = courseCode.slice(1).trim();
      let resolvedDate = "";
      let curr = badge.parentElement;
      for (let depth = 0; depth < 8 && curr; depth++) {
        if (curr === doc.body || curr.tagName === "MAIN" || curr.id === "root") break;
        const dateAttr = curr.getAttribute("data-date") || curr.getAttribute("data-day");
        if (dateAttr && /^\d{4}-\d{2}-\d{2}$/.test(dateAttr)) {
          resolvedDate = dateAttr;
          break;
        }
        const dayCandidates = Array.from(curr.querySelectorAll("*"));
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
        startTime: reactProps?.startTime ? normalizeTimeString(reactProps.startTime) : "",
        endTime: reactProps?.endTime ? normalizeTimeString(reactProps.endTime) : "",
        type: eventType,
        typeLabel,
        courseCode: reactProps?.courseCode || courseCode,
        courseName: reactProps?.courseName || "",
        lecturer: reactProps?.lecturer || "",
        room: reactProps?.room || (mode === "Online" ? "Online" : ""),
        mode,
        batch: context.batch,
        source: "dom",
        rawText
      });
    }
    return events;
  }
  function scrapeActiveModal(doc = document, context) {
    const dialog = doc.querySelector('[role="dialog"], [class*="modal"], [class*="popup"], div[class*="fixed"][class*="z-"]');
    if (!dialog) return null;
    const text = getElementCleanText(dialog);
    if (!text.includes("AM") && !text.includes("PM") && !text.includes(":") && !text.includes("202")) return null;
    let courseCode = "";
    const titleEl = dialog.querySelector('h1, h2, h3, h4, strong, [class*="font-bold"]');
    if (titleEl) {
      const ht = getElementCleanText(titleEl);
      if (ht.length <= 15 && !ht.includes("AM") && !ht.includes("202")) {
        courseCode = ht;
      }
    }
    let date = "";
    const dateMatch = text.match(/([A-Z][a-z]+),\s+([A-Z][a-z]+)\s+(\d{1,2}),\s+(\d{4})/);
    if (dateMatch) {
      const MONTHS = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December"
      ];
      const mIdx = MONTHS.indexOf(dateMatch[2]) + 1;
      const day = parseInt(dateMatch[3], 10);
      const year = parseInt(dateMatch[4], 10);
      if (mIdx > 0) {
        date = formatISODate(year, mIdx, day);
      }
    }
    let startTime = "";
    let endTime = "";
    const timeMatch = text.match(/(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)\s*[–—~-]\s*(\d{1,2}[:.]\d{2}\s*(?:am|pm)?)/i);
    if (timeMatch) {
      startTime = normalizeTimeString(timeMatch[1]);
      endTime = normalizeTimeString(timeMatch[2]);
    }
    let lecturer = "";
    const pEls = Array.from(dialog.querySelectorAll("p, div, span"));
    for (const pel of pEls) {
      if (pel.children.length > 2) continue;
      const pt = getElementCleanText(pel);
      const m = pt.match(/\b((?:Dr|Prof|Mr|Ms|Mrs)\.?\s+(?:[A-Z]\.?\s+)*[A-Za-z]+(?:\s+[A-Za-z]+){1,3})\b/);
      if (m && !pt.includes("Hall")) {
        lecturer = m[1].trim();
        break;
      }
    }
    let room = "";
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
    let type = "";
    const upper = text.toUpperCase();
    if (upper.includes("LECTURE_PHYSICAL") || upper.includes("LECTURE PHYSICAL") || upper.includes("LP")) {
      type = "LP";
    } else if (upper.includes("LECTURE_ONLINE") || upper.includes("LECTURE ONLINE") || upper.includes("LO")) {
      type = "LO";
    } else if (upper.includes("TUTORIAL") || upper.includes("TU")) {
      type = "TU";
    } else if (upper.includes("LAB") || upper.includes("LB")) {
      type = "LB";
    }
    const { mode, typeLabel } = resolveTypeInfo(type);
    const fallbackDate = context ? formatISODate(context.year, context.month, 1) : "";
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
      batch: context?.batch || "",
      source: "dom"
    };
  }
  function scrapeTimetableFromDOM(doc = document, url = window.location.href) {
    const context = extractPageContext(doc, url);
    let rawEvents = [];
    if (context.view === "month") {
      rawEvents = scrapeMonthView(doc, context);
    } else if (context.view === "week") {
      rawEvents = scrapeWeekView(doc, context);
    } else if (context.view === "day") {
      rawEvents = scrapeDayView(doc, context);
    }
    if (rawEvents.length === 0) {
      rawEvents = scrapeAcaBadges(doc, context);
    }
    if (rawEvents.length === 0 && context.view !== "month") {
      rawEvents = scrapeMonthView(doc, context);
    }
    if (rawEvents.length === 0) {
      rawEvents = scrapeGenericFallback(doc, context);
    }
    const activeModalEvent = scrapeActiveModal(doc, context);
    if (activeModalEvent) {
      rawEvents.push(activeModalEvent);
    }
    const rawEventCount = rawEvents.length;
    const normalizedEvents = rawEvents.map(
      (raw) => normalizeEvent(raw, context.batch)
    );
    const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(normalizedEvents);
    const summary = computeSummary(uniqueEvents, duplicatesRemoved, "dom");
    return {
      context,
      events: uniqueEvents,
      summary,
      rawEventCount
    };
  }

  // src/storage/storage.ts
  var STORAGE_KEYS = {
    STATE: "nibm_aca_state",
    COLUMN_PREFS: "nibm_aca_column_prefs",
    FILTER_PREFS: "nibm_aca_filter_prefs",
    DEBUG_MODE: "nibm_aca_debug_mode",
    AUTO_REFRESH: "nibm_aca_auto_refresh"
  };
  var DEFAULT_STATE = {
    context: {
      connected: false,
      view: "unknown",
      year: (/* @__PURE__ */ new Date()).getFullYear(),
      month: (/* @__PURE__ */ new Date()).getMonth() + 1,
      periodLabel: "",
      batch: "",
      url: ""
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
        room: 0
      },
      strategyUsed: "none",
      lastScannedAt: ""
    },
    autoRefresh: false,
    debugMode: false
  };
  function hasChromeStorage() {
    return typeof chrome !== "undefined" && Boolean(chrome.storage?.local);
  }
  async function saveScraperState(state) {
    if (!hasChromeStorage()) return;
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.STATE]: state });
    } catch (err) {
      console.error("[NIBM Exporter] Failed to save state:", err);
    }
  }
  async function loadScraperState() {
    if (!hasChromeStorage()) return DEFAULT_STATE;
    try {
      const result = await chrome.storage.local.get(STORAGE_KEYS.STATE);
      return result[STORAGE_KEYS.STATE] || DEFAULT_STATE;
    } catch (err) {
      console.error("[NIBM Exporter] Failed to load state:", err);
      return DEFAULT_STATE;
    }
  }

  // src/content/content.ts
  var currentState = {
    context: {
      connected: true,
      view: "unknown",
      year: (/* @__PURE__ */ new Date()).getFullYear(),
      month: (/* @__PURE__ */ new Date()).getMonth() + 1,
      periodLabel: "",
      batch: "",
      url: window.location.href
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
        room: 0
      },
      strategyUsed: "none",
      lastScannedAt: ""
    },
    autoRefresh: false,
    debugMode: false
  };
  var debounceTimer = null;
  var lastUrl = window.location.href;
  async function checkPerformanceForLectureApi() {
    try {
      const resources = performance.getEntriesByType("resource");
      const lectureUrls = resources.map((r) => r.name).filter((u) => u.includes("lectures") || u.includes("dashboard") && u.includes("_rsc"));
      if (lectureUrls.length > 0) {
        const targetUrl = lectureUrls[lectureUrls.length - 1];
        const res = await fetch(targetUrl, { credentials: "same-origin" });
        if (res.ok) {
          const text = await res.text();
          try {
            const json = JSON.parse(text);
            return parseApiPayload(json, currentState.context.batch);
          } catch {
          }
        }
      }
    } catch (err) {
      console.debug("[NIBM Exporter] Resource check:", err);
    }
    return [];
  }
  async function runExtraction(force = false) {
    if (currentState.debugMode) {
      console.log("[NIBM Exporter] Running extraction scan (force=" + force + ")...");
    }
    const domResult = scrapeTimetableFromDOM(document, window.location.href);
    let apiEvents = [];
    try {
      apiEvents = await checkPerformanceForLectureApi();
    } catch {
    }
    const combined = [
      ...domResult.events,
      ...apiEvents,
      ...currentState.events.filter((e) => e.source === "api")
    ];
    const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(combined);
    const strategy = apiEvents.length > 0 || currentState.events.some((e) => e.source === "api") ? domResult.events.length > 0 ? "hybrid" : "api" : "dom";
    const summary = computeSummary(uniqueEvents, duplicatesRemoved, strategy);
    currentState = {
      ...currentState,
      context: domResult.context,
      events: uniqueEvents,
      summary
    };
    saveScraperState(currentState);
    if (currentState.debugMode) {
      console.log("[NIBM Exporter] Extraction complete:", {
        batch: currentState.context.batch,
        period: currentState.context.periodLabel,
        uniqueEvents: currentState.events.length,
        strategy
      });
    }
    return currentState;
  }
  function requestDebouncedExtraction(delayMs = 600) {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(async () => {
      await runExtraction(false);
    }, delayMs);
  }
  function setupDomObserver() {
    const observer = new MutationObserver((mutations) => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        requestDebouncedExtraction(400);
        return;
      }
      let calendarMutated = false;
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          for (const node of Array.from(mutation.addedNodes)) {
            if (node instanceof HTMLElement) {
              const tag = node.tagName.toLowerCase();
              const cls = (node.className || "").toString();
              if (tag === "table" || tag === "td" || tag === "div" || cls.includes("calendar") || cls.includes("grid") || cls.includes("event") || cls.includes("day")) {
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
      subtree: true
    });
  }
  function setupHistoryListeners() {
    const handleUrlChange = () => {
      if (window.location.href !== lastUrl) {
        lastUrl = window.location.href;
        requestDebouncedExtraction(400);
      }
    };
    window.addEventListener("popstate", handleUrlChange);
    const origPush = history.pushState;
    history.pushState = function(...args) {
      origPush.apply(this, args);
      handleUrlChange();
    };
    const origReplace = history.replaceState;
    history.replaceState = function(...args) {
      origReplace.apply(this, args);
      handleUrlChange();
    };
  }
  async function autoEnrichFromModals() {
    const TYPE_PREFIXES = "LP|LO|TU|LB|SM|WS|EX|VV|PR|CW|PC";
    const badgeRegex = new RegExp(`(?:^|\\b)(${TYPE_PREFIXES})(?:\\b|\\s*[-:]?\\s*)([A-Za-z0-9\\s/-]{1,15})`, "i");
    const candidates = Array.from(document.querySelectorAll("div, button, a")).filter((el) => {
      if (el.closest('footer, header, nav, [role="dialog"]')) return false;
      if (el.children.length > 2) return false;
      const txt = getElementCleanText(el);
      return txt.length >= 3 && txt.length <= 35 && badgeRegex.test(txt);
    });
    const badges = candidates.filter((el) => !Array.from(el.children).some((c) => candidates.includes(c)));
    for (let i = 0; i < badges.length; i++) {
      const badge = badges[i];
      if (typeof badge.click !== "function") continue;
      badge.click();
      await new Promise((r) => setTimeout(r, 70));
      const modalData = scrapeActiveModal(document, currentState.context);
      if (modalData && modalData.date) {
        mergeModalIntoEvents(currentState.events, modalData);
      }
      const closeBtn = document.querySelector(
        '[role="dialog"] button, [class*="modal"] button, [class*="close"], [aria-label*="close"]'
      );
      if (closeBtn && typeof closeBtn.click === "function") {
        closeBtn.click();
      } else {
        document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }));
      }
      await new Promise((r) => setTimeout(r, 40));
    }
    const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(currentState.events);
    currentState.events = uniqueEvents;
    currentState.summary = computeSummary(uniqueEvents, duplicatesRemoved, "dom");
    saveScraperState(currentState);
    return currentState;
  }
  function setupMessageListener() {
    chrome.runtime.onMessage.addListener(
      (message, _sender, sendResponse) => {
        switch (message.action) {
          case "PING":
            sendResponse({
              connected: true,
              url: window.location.href,
              batch: currentState.context.batch,
              period: currentState.context.periodLabel
            });
            break;
          case "SCAN_PAGE": {
            runExtraction(true).then((result) => {
              sendResponse(result);
            }).catch((err) => {
              sendResponse({ error: String(err) });
            });
            break;
          }
          case "ENRICH_DETAILS": {
            autoEnrichFromModals().then((result) => {
              sendResponse(result);
            }).catch((err) => {
              sendResponse({ error: String(err) });
            });
            break;
          }
          case "GET_STATE":
            sendResponse(currentState);
            break;
          case "SET_DEBUG_MODE": {
            currentState.debugMode = Boolean(message.payload);
            saveScraperState(currentState);
            sendResponse({ success: true, debugMode: currentState.debugMode });
            break;
          }
          case "TOGGLE_AUTO_REFRESH": {
            currentState.autoRefresh = Boolean(message.payload);
            saveScraperState(currentState);
            sendResponse({ success: true, autoRefresh: currentState.autoRefresh });
            break;
          }
          default:
            sendResponse({ error: "Unknown action" });
        }
        return true;
      }
    );
    document.addEventListener(
      "click",
      () => {
        setTimeout(() => {
          const modal = scrapeActiveModal(document, currentState.context);
          if (modal && modal.date && modal.courseCode) {
            const updated = mergeModalIntoEvents(currentState.events, modal);
            if (updated) {
              const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(currentState.events);
              currentState.events = uniqueEvents;
              currentState.summary = computeSummary(uniqueEvents, duplicatesRemoved, "dom");
              saveScraperState(currentState);
            }
          }
        }, 150);
      },
      true
    );
  }
  async function initialize() {
    const saved = await loadScraperState();
    if (saved && saved.events && saved.events.length > 0) {
      currentState = saved;
    }
    setupApiInterceptor((apiEvents) => {
      if (apiEvents.length > 0) {
        const merged = [...currentState.events, ...apiEvents];
        const { uniqueEvents, duplicatesRemoved } = deduplicateEvents(merged);
        const summary = computeSummary(uniqueEvents, duplicatesRemoved, "api");
        currentState = {
          ...currentState,
          events: uniqueEvents,
          summary
        };
        saveScraperState(currentState);
      }
    });
    setupDomObserver();
    setupHistoryListeners();
    setupMessageListener();
    if (document.readyState === "complete") {
      setTimeout(() => runExtraction(false), 500);
    } else {
      window.addEventListener("load", () => {
        setTimeout(() => runExtraction(false), 500);
      });
    }
  }
  initialize();
})();
