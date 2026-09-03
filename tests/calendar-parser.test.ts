import { describe, it, expect } from 'vitest';
import { resolveCellDate, resolveTypeInfo } from '../src/content/calendar-parser';
import { CalendarContext } from '../src/types/timetable';

describe('Calendar Parser - Month Boundary Resolution', () => {
  const context: CalendarContext = {
    connected: true,
    view: 'month',
    year: 2026,
    month: 9, // September 2026
    periodLabel: 'September 2026',
    batch: 'DSE241FT',
    url: 'https://aca.mynibm.com/dashboard?view=month&year=2026&month=8',
  };

  it('resolves normal inside-month days without modification', () => {
    const d1 = resolveCellDate(1, false, 1, context);
    expect(d1).toBe('2026-09-01');

    const d15 = resolveCellDate(15, false, 15, context);
    expect(d15).toBe('2026-09-15');

    const d30 = resolveCellDate(30, false, 30, context);
    expect(d30).toBe('2026-09-30');
  });

  it('correctly maps previous-month boundary days shown in the first week', () => {
    // E.g., August 31 (day 31) shown at index 0 of September grid
    const prevMonthDate = resolveCellDate(31, true, 0, context);
    expect(prevMonthDate).toBe('2026-08-31');

    const prevMonthDate2 = resolveCellDate(30, true, 0, context);
    expect(prevMonthDate2).toBe('2026-08-30');
  });

  it('correctly maps next-month boundary days shown in the final week', () => {
    // E.g., October 1, 2, 3 shown at indices 31, 32, 33 of September grid
    const nextMonthDate1 = resolveCellDate(1, true, 31, context);
    expect(nextMonthDate1).toBe('2026-10-01');

    const nextMonthDate2 = resolveCellDate(2, true, 32, context);
    expect(nextMonthDate2).toBe('2026-10-02');
  });

  it('handles year boundary rollovers seamlessly', () => {
    // January 2026 showing December 31, 2025
    const janContext: CalendarContext = {
      ...context,
      year: 2026,
      month: 1,
      periodLabel: 'January 2026',
    };
    const decDate = resolveCellDate(31, true, 0, janContext);
    expect(decDate).toBe('2025-12-31');

    // December 2026 showing January 1, 2027
    const decContext: CalendarContext = {
      ...context,
      year: 2026,
      month: 12,
      periodLabel: 'December 2026',
    };
    const nextJanDate = resolveCellDate(1, true, 34, decContext);
    expect(nextJanDate).toBe('2027-01-01');
  });
});
