/**
 * NIBM ACA Timetable Exporter - Professional RFC 4180 CSV Engine
 * 
 * Features:
 * - RFC 4180 strict compliance: quote commas, quotes, line breaks, CRLF line endings
 * - UTF-8 Byte Order Mark (BOM: \uFEFF) for flawless Excel compatibility
 * - Full Unicode fidelity (Sinhala, English, Tamil, diacritics)
 * - Dynamic column filtering based on user preferences
 * - Local-only Blob download (zero external transmission)
 */

import { TimetableEvent, ExportColumnOption, CalendarContext } from '../types/timetable';

/**
 * Escapes a single CSV cell according to RFC 4180 rules.
 */
export function escapeCsvCell(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If value contains comma, quote, or newline, it MUST be quoted
  const needsQuotes = /[",\r\n]/.test(str);

  if (needsQuotes) {
    // RFC 4180: any quote within the field must be escaped by preceding it with another quote
    const escaped = str.replace(/"/g, '""');
    return `"${escaped}"`;
  }

  return str;
}

/**
 * Generates an RFC 4180 CSV string with UTF-8 BOM from timetable events.
 */
export function generateTimetableCsv(
  events: TimetableEvent[],
  columns: ExportColumnOption[]
): string {
  const activeCols = columns.filter((c) => c.enabled);
  if (activeCols.length === 0) {
    return '';
  }

  // Prepend UTF-8 BOM for Microsoft Excel compatibility
  const BOM = '\uFEFF';

  // Strictly sort events in chronological order: date ascending, then startTime ascending
  const sortedEvents = [...events].sort((a, b) => {
    const dateComp = (a.date || '').localeCompare(b.date || '');
    if (dateComp !== 0) return dateComp;
    return (a.startTime || '').localeCompare(b.startTime || '');
  });

  // Build Header Row
  const headerRow = activeCols.map((c) => escapeCsvCell(c.label)).join(',');

  // Build Data Rows with CRLF (\r\n) line endings
  const dataRows = sortedEvents.map((ev) => {
    return activeCols
      .map((col) => {
        const val = ev[col.key];
        return escapeCsvCell(val !== undefined && val !== null ? val : '');
      })
      .join(',');
  });

  const allLines = [headerRow, ...dataRows];
  return BOM + allLines.join('\r\n') + '\r\n';
}

/**
 * Generates a clean, sanitized filename for the exported timetable CSV.
 * E.g., "NIBM_Timetable_DSE241FT_2026-09.csv"
 */
export function generateCsvFilename(context: CalendarContext, isFiltered = false): string {
  const cleanBatch = (context.batch || 'Batch')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 25)
    .replace(/_+$/g, '');

  let period = '';
  if (context.periodLabel && (context.periodLabel.includes('–') || context.periodLabel.includes('Months'))) {
    period = context.periodLabel
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
  } else {
    const y = context.year || new Date().getFullYear();
    const m = (context.month || new Date().getMonth() + 1).toString().padStart(2, '0');
    period = `${y}-${m}`;
  }

  const suffix = isFiltered ? '_Filtered' : '';
  return `NIBM_Timetable_${cleanBatch || 'Batch'}_${period}${suffix}.csv`;
}

/**
 * Initiates local download via Blob and URL.createObjectURL.
 * Zero external calls or data leakage.
 */
export function downloadCsvLocally(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = blobUrl;
  link.setAttribute('download', filename);
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();

  // Clean up resource
  setTimeout(() => {
    document.body.removeChild(link);
    URL.revokeObjectURL(blobUrl);
  }, 500);
}
