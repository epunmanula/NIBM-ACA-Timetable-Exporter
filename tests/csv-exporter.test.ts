import { describe, it, expect } from 'vitest';
import {
  escapeCsvCell,
  generateTimetableCsv,
  generateCsvFilename,
} from '../src/export/csv-exporter';
import { TimetableEvent, ExportColumnOption, CalendarContext } from '../src/types/timetable';

describe('CSV Exporter - RFC 4180 Escaping', () => {
  it('leaves standard alphanumeric strings unquoted', () => {
    expect(escapeCsvCell('Software Engineering')).toBe('Software Engineering');
    expect(escapeCsvCell('DSE501')).toBe('DSE501');
    expect(escapeCsvCell('08:30')).toBe('08:30');
  });

  it('quotes cells containing commas', () => {
    expect(escapeCsvCell('Colombo, Sri Lanka')).toBe('"Colombo, Sri Lanka"');
    expect(escapeCsvCell('Hall 4A, Level 2')).toBe('"Hall 4A, Level 2"');
  });

  it('escapes internal double quotes by doubling them per RFC 4180', () => {
    expect(escapeCsvCell('Special "Guest" Lecture')).toBe('"Special ""Guest"" Lecture"');
    expect(escapeCsvCell('"Quotes Around"')).toBe('"""Quotes Around"""');
  });

  it('quotes cells containing newline or carriage return characters', () => {
    expect(escapeCsvCell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
    expect(escapeCsvCell("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
  });

  it('handles null and undefined gracefully without outputting literals', () => {
    expect(escapeCsvCell(null)).toBe('');
    expect(escapeCsvCell(undefined)).toBe('');
    expect(escapeCsvCell('')).toBe('');
  });
});

describe('CSV Exporter - CSV File Generation & Excel Compatibility', () => {
  const columns: ExportColumnOption[] = [
    { key: 'date', label: 'Date', enabled: true },
    { key: 'dayOfWeek', label: 'Day', enabled: true },
    { key: 'startTime', label: 'Start Time', enabled: true },
    { key: 'endTime', label: 'End Time', enabled: true },
    { key: 'type', label: 'Type', enabled: true },
    { key: 'typeLabel', label: 'Type Label', enabled: true },
    { key: 'courseCode', label: 'Course Code', enabled: true },
    { key: 'courseName', label: 'Course Name', enabled: true },
    { key: 'lecturer', label: 'Lecturer', enabled: true },
    { key: 'room', label: 'Room', enabled: true },
    { key: 'mode', label: 'Mode', enabled: true },
    { key: 'batch', label: 'Batch', enabled: true },
  ];

  const events: TimetableEvent[] = [
    {
      id: 'ev_1',
      date: '2026-09-01',
      dayOfWeek: 'Tuesday',
      startTime: '08:30',
      endTime: '10:30',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      courseCode: 'DSE501',
      courseName: 'Software Architecture & Design',
      lecturer: 'Dr. Perera',
      room: 'Hall 4A',
      mode: 'Physical',
      batch: 'DSE241FT',
      source: 'dom',
    },
    {
      id: 'ev_2',
      date: '2026-09-02',
      dayOfWeek: 'Wednesday',
      startTime: '13:00',
      endTime: '15:00',
      type: 'LO',
      typeLabel: 'Lecture (Online)',
      courseCode: 'DSE502',
      courseName: 'මෘදුකාංග ඉංජිනේරු විද්‍යාව (Software Engineering)',
      lecturer: 'Prof. Silva',
      room: 'Online (Zoom)',
      mode: 'Online',
      batch: 'DSE241FT',
      source: 'dom',
    },
  ];

  it('prepends UTF-8 Byte Order Mark (\\uFEFF) for Excel compatibility', () => {
    const csv = generateTimetableCsv(events, columns);
    expect(csv.startsWith('\uFEFF')).toBe(true);
  });

  it('uses CRLF (\\r\\n) line endings as required for Excel compatibility', () => {
    const csv = generateTimetableCsv(events, columns);
    // Strip BOM for inspection
    const body = csv.slice(1);
    const lines = body.split('\r\n');
    expect(lines.length).toBe(4); // Header + 2 rows + trailing empty line
    expect(lines[0]).toBe(
      'Date,Day,Start Time,End Time,Type,Type Label,Course Code,Course Name,Lecturer,Room,Mode,Batch'
    );
  });

  it('correctly preserves Sinhala and Unicode characters', () => {
    const csv = generateTimetableCsv(events, columns);
    expect(csv).toContain('මෘදුකාංග ඉංජිනේරු විද්‍යාව');
  });

  it('filters columns based on enabled property', () => {
    const subsetCols: ExportColumnOption[] = [
      { key: 'date', label: 'Date', enabled: true },
      { key: 'startTime', label: 'Start Time', enabled: true },
      { key: 'courseCode', label: 'Course Code', enabled: true },
      { key: 'lecturer', label: 'Lecturer', enabled: false }, // Disabled
    ];

    const csv = generateTimetableCsv(events, subsetCols);
    const body = csv.slice(1);
    const header = body.split('\r\n')[0];
    expect(header).toBe('Date,Start Time,Course Code');
    expect(header).not.toContain('Lecturer');
  });
});

describe('CSV Exporter - Filename Generation', () => {
  const context: CalendarContext = {
    connected: true,
    view: 'month',
    year: 2026,
    month: 9,
    periodLabel: 'September 2026',
    batch: 'DSE241FT',
    url: 'https://aca.mynibm.com/dashboard',
  };

  it('generates clean standard filename from batch and period', () => {
    const name = generateCsvFilename(context, false);
    expect(name).toBe('NIBM_Timetable_DSE241FT_2026-09.csv');
  });

  it('appends Filtered suffix when filtering is applied', () => {
    const name = generateCsvFilename(context, true);
    expect(name).toBe('NIBM_Timetable_DSE241FT_2026-09_Filtered.csv');
  });

  it('sanitizes problematic characters in batch names', () => {
    const dirtyContext: CalendarContext = {
      ...context,
      batch: 'DSE/24.1 FT (Special)',
    };
    const name = generateCsvFilename(dirtyContext, false);
    expect(name).toMatch(/^NIBM_Timetable_DSE_24_1_FT_Special_2026-09\.csv$/);
  });
});
