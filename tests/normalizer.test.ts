import { describe, it, expect } from 'vitest';
import {
  resolveTypeInfo,
  normalizeTimeString,
  parseTimeRange,
  formatISODate,
  getDayOfWeekName,
  generateEventFingerprint,
  normalizeEvent,
  deduplicateEvents,
  computeSummary,
} from '../src/content/normalizer';
import { TimetableEvent } from '../src/types/timetable';

describe('Normalizer - Type Info Resolution', () => {
  it('correctly maps known ACA lecture codes to human-readable labels and modes', () => {
    const lp = resolveTypeInfo('LP');
    expect(lp.normalizedCode).toBe('LP');
    expect(lp.typeLabel).toBe('Lecture (Physical)');
    expect(lp.mode).toBe('Physical');

    const lo = resolveTypeInfo('LO');
    expect(lo.normalizedCode).toBe('LO');
    expect(lo.typeLabel).toBe('Lecture (Online)');
    expect(lo.mode).toBe('Online');

    const tu = resolveTypeInfo('TU');
    expect(tu.normalizedCode).toBe('TU');
    expect(tu.typeLabel).toBe('Tutorial');
    expect(tu.mode).toBe('Physical');

    const lb = resolveTypeInfo('LB');
    expect(lb.normalizedCode).toBe('LB');
    expect(lb.typeLabel).toBe('Lab');

    const ex = resolveTypeInfo('EX');
    expect(ex.normalizedCode).toBe('EX');
    expect(ex.typeLabel).toBe('Exam');

    const vv = resolveTypeInfo('VV');
    expect(vv.normalizedCode).toBe('VV');
    expect(vv.typeLabel).toBe('Viva');

    const pc = resolveTypeInfo('PC');
    expect(pc.normalizedCode).toBe('PC');
    expect(pc.typeLabel).toBe('Practical');
  });

  it('handles lowercase, bracketed, or messy type strings', () => {
    const res1 = resolveTypeInfo('[LP]');
    expect(res1.normalizedCode).toBe('LP');
    expect(res1.typeLabel).toBe('Lecture (Physical)');

    const res2 = resolveTypeInfo('lo');
    expect(res2.normalizedCode).toBe('LO');
    expect(res2.typeLabel).toBe('Lecture (Online)');
  });

  it('preserves unknown types without inventing false labels', () => {
    const unk = resolveTypeInfo('Special Revision Session');
    expect(unk.typeLabel).toBe('Special Revision Session');
    expect(unk.mode).toBe('Unknown');

    const onlineUnk = resolveTypeInfo('Guest Lecture (Online Zoom)');
    expect(onlineUnk.typeLabel).toBe('Guest Lecture (Online Zoom)');
    expect(onlineUnk.mode).toBe('Online');
  });

  it('returns empty fallback for blank type', () => {
    const blank = resolveTypeInfo('');
    expect(blank.normalizedCode).toBe('');
    expect(blank.typeLabel).toBe('');
    expect(blank.mode).toBe('Unknown');
  });
});

describe('Normalizer - Time Parsing & Normalization', () => {
  it('normalizes 24h and 12h times into HH:mm format', () => {
    expect(normalizeTimeString('08:30')).toBe('08:30');
    expect(normalizeTimeString('8:30')).toBe('08:30');
    expect(normalizeTimeString('8.30 AM')).toBe('08:30');
    expect(normalizeTimeString('02:15 PM')).toBe('14:15');
    expect(normalizeTimeString('2:15 pm')).toBe('14:15');
    expect(normalizeTimeString('12:00 PM')).toBe('12:00');
    expect(normalizeTimeString('12:00 AM')).toBe('00:00');
  });

  it('parses combined time ranges accurately', () => {
    const r1 = parseTimeRange('08:30 - 10:30');
    expect(r1.startTime).toBe('08:30');
    expect(r1.endTime).toBe('10:30');

    const r2 = parseTimeRange('8.30 AM to 12.30 PM');
    expect(r2.startTime).toBe('08:30');
    expect(r2.endTime).toBe('12:30');

    const r3 = parseTimeRange('09:00 – 11:00');
    expect(r3.startTime).toBe('09:00');
    expect(r3.endTime).toBe('11:00');
  });
});

describe('Normalizer - Date Handling', () => {
  it('formats ISO dates YYYY-MM-DD correctly with zero-padding', () => {
    expect(formatISODate(2026, 9, 3)).toBe('2026-09-03');
    expect(formatISODate(2026, 12, 25)).toBe('2026-12-25');
  });

  it('resolves correct day of week in local calendar', () => {
    expect(getDayOfWeekName('2026-09-03')).toBe('Thursday');
    expect(getDayOfWeekName('2026-09-01')).toBe('Tuesday');
    expect(getDayOfWeekName('invalid-date')).toBe('');
  });
});

describe('Normalizer - Deduplication and Fingerprinting', () => {
  const sampleEvent1: TimetableEvent = {
    id: '',
    date: '2026-09-01',
    dayOfWeek: 'Tuesday',
    startTime: '08:30',
    endTime: '10:30',
    type: 'LP',
    typeLabel: 'Lecture (Physical)',
    courseCode: 'DSE501',
    courseName: 'Software Architecture',
    lecturer: 'Dr. Perera',
    room: 'Hall 4A',
    mode: 'Physical',
    batch: 'DSE241FT',
    source: 'dom',
  };

  it('generates consistent fingerprints for identical data', () => {
    const fp1 = generateEventFingerprint(sampleEvent1);
    const fp2 = generateEventFingerprint({ ...sampleEvent1 });
    expect(fp1).toBe(fp2);
    expect(fp1.startsWith('ev_')).toBe(true);
  });

  it('generates different fingerprints for distinct events', () => {
    const fp1 = generateEventFingerprint(sampleEvent1);
    const fp2 = generateEventFingerprint({ ...sampleEvent1, startTime: '10:30' });
    expect(fp1).not.toBe(fp2);
  });

  it('eliminates duplicate events and merges richer fields', () => {
    const duplicateWithoutRoom: TimetableEvent = {
      ...sampleEvent1,
      room: '',
      lecturer: '',
    };

    const duplicateWithRoom: TimetableEvent = {
      ...sampleEvent1,
      room: 'Hall 4A',
      lecturer: 'Dr. Perera',
    };

    const { uniqueEvents, duplicatesRemoved } = deduplicateEvents([
      duplicateWithoutRoom,
      duplicateWithRoom,
    ]);

    expect(duplicatesRemoved).toBe(1);
    expect(uniqueEvents).toHaveLength(1);
    expect(uniqueEvents[0].room).toBe('Hall 4A');
    expect(uniqueEvents[0].lecturer).toBe('Dr. Perera');
  });

  it('computes summary with missing fields breakdown correctly', () => {
    const eventWithMissingFields: TimetableEvent = {
      ...sampleEvent1,
      lecturer: '',
      room: '',
    };

    const summary = computeSummary([sampleEvent1, eventWithMissingFields], 1, 'dom');
    expect(summary.totalFound).toBe(3);
    expect(summary.uniqueCount).toBe(2);
    expect(summary.duplicatesRemoved).toBe(1);
    expect(summary.missingFieldsBreakdown.lecturer).toBe(1);
    expect(summary.missingFieldsBreakdown.room).toBe(1);
    expect(summary.missingFieldsCount).toBe(2);
  });
});
