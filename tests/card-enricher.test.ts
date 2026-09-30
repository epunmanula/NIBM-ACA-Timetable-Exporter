// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import {
  collectCalendarCards,
  getOpenModal,
  closeAnyOpenModal,
  enrichAllCardsSequentially,
  getCalendarHeading,
  findNextMonthButton,
} from '../src/content/card-enricher';
import { computeMultiMonthPeriodLabel } from '../src/content/normalizer';
import { CalendarContext } from '../src/types/timetable';

describe('Card Enricher - Automated Sequential Card Scraping', () => {
  const mockContext: CalendarContext = {
    connected: true,
    view: 'month',
    year: 2026,
    month: 9,
    periodLabel: 'September 2026',
    batch: 'DSE261FT',
    url: 'https://aca.mynibm.com/dashboard?view=month&year=2026&month=8&batch=bb340759',
  };

  it('correctly collects distinct card descriptors across multiple day cells', () => {
    document.body.innerHTML = `
      <div id="root">
        <div role="grid" class="calendar-grid">
          <!-- Day 1: 3 cards -->
          <div role="gridcell" class="day-cell" data-date="2026-09-01">
            <span class="day-num">1</span>
            <div class="card cursor-pointer"><span>VV OOP</span></div>
            <div class="card cursor-pointer"><span>LP DL & CO</span></div>
            <div class="card cursor-pointer"><span>LP ECS - 1</span></div>
          </div>

          <!-- Day 2: 2 cards -->
          <div role="gridcell" class="day-cell" data-date="2026-09-02">
            <span class="day-num">2</span>
            <div class="card cursor-pointer"><span>PC DL & CO</span></div>
            <div class="card cursor-pointer"><span>LP DL & CO</span></div>
          </div>

          <!-- Day 3: 2 cards -->
          <div role="gridcell" class="day-cell" data-date="2026-09-03">
            <span class="day-num">3</span>
            <div class="card cursor-pointer"><span>LP DM - 1</span></div>
            <div class="card cursor-pointer"><span>LP DM - 1</span></div>
          </div>

          <!-- Fill up to 28 cells -->
          ${Array.from({ length: 25 })
            .map((_, i) => `<div role="gridcell" class="day-cell"><span class="day-num">${i + 4}</span></div>`)
            .join('')}
        </div>
      </div>
    `;

    const cards = collectCalendarCards(document, mockContext);

    expect(cards.length).toBe(7);

    // Verify Day 1
    expect(cards[0].cellDate).toBe('2026-09-01');
    expect(cards[0].previewText).toBe('VV OOP');
    expect(cards[1].cellDate).toBe('2026-09-01');
    expect(cards[1].previewText).toBe('LP DL & CO');
    expect(cards[1].courseHint).toBe('DL & CO');
    expect(cards[2].cellDate).toBe('2026-09-01');
    expect(cards[2].previewText).toBe('LP ECS - 1');

    // Verify Day 2
    expect(cards[3].cellDate).toBe('2026-09-02');
    expect(cards[3].previewText).toBe('PC DL & CO');
    expect(cards[3].typeHint).toBe('PC');

    // Verify Day 3
    expect(cards[5].cellDate).toBe('2026-09-03');
    expect(cards[5].previewText).toBe('LP DM - 1');
    expect(cards[6].cellDate).toBe('2026-09-03');
    expect(cards[6].previewText).toBe('LP DM - 1');
  });

  it('detects and closes active modal properly', async () => {
    document.body.innerHTML = `
      <div id="root"></div>
      <div role="dialog" class="fixed z-50">
        <h3>DM - 1</h3>
        <p>Thursday, September 3, 2026</p>
        <p>1:00 PM – 4:00 PM</p>
        <p>Mr Wijekoon Mudiyanselage</p>
        <p>Lecture Hall 18 - 1st H</p>
        <span class="badge">LECTURE_PHYSICAL</span>
        <button aria-label="Close" class="close-btn">✕</button>
      </div>
    `;

    const modal = getOpenModal(document);
    expect(modal).not.toBeNull();

    const closeBtn = document.querySelector('.close-btn') as HTMLElement;
    closeBtn.addEventListener('click', () => {
      modal?.remove();
    });

    await closeAnyOpenModal(document);
    expect(getOpenModal(document)).toBeNull();
  });

  it('sequentially clicks cards and crawls modal details', async () => {
    document.body.innerHTML = `
      <div id="root">
        <div role="grid">
          <div role="gridcell" data-date="2026-09-03">
            <span class="day-num">3</span>
            <div id="card1" class="cursor-pointer"><span>LP DM - 1</span></div>
          </div>
          ${Array.from({ length: 27 })
            .map((_, i) => `<div role="gridcell"><span class="day-num">${i + 4}</span></div>`)
            .join('')}
        </div>
      </div>
    `;

    const card1 = document.getElementById('card1')!;
    card1.addEventListener('click', () => {
      const modal = document.createElement('div');
      modal.setAttribute('role', 'dialog');
      modal.className = 'fixed z-50';
      modal.innerHTML = `
        <h3>DM - 1</h3>
        <p>Thursday, September 3, 2026</p>
        <p>1:00 PM – 4:00 PM</p>
        <p>Mr Wijekoon Mudiyanselage</p>
        <p>Lecture Hall 18 - 1st H</p>
        <span class="badge">LECTURE_PHYSICAL</span>
        <button aria-label="Close" class="close-btn">✕</button>
      `;

      modal.querySelector('.close-btn')!.addEventListener('click', () => {
        modal.remove();
      });

      document.body.appendChild(modal);
    });

    const progressSpy = vi.fn();

    const results = await enrichAllCardsSequentially(document, mockContext, progressSpy);

    expect(results.length).toBe(1);
    expect(results[0].date).toBe('2026-09-03');
    expect(results[0].startTime).toBe('13:00');
    expect(results[0].endTime).toBe('16:00');
    expect(results[0].courseCode).toBe('DM - 1');
    expect(results[0].lecturer).toBe('Mr Wijekoon Mudiyanselage');
    expect(results[0].room).toBe('Lecture Hall 18 - 1st H');
    expect(results[0].type).toBe('LP');
    expect(results[0].mode).toBe('Physical');

    expect(progressSpy).toHaveBeenCalled();
  });

  it('detects calendar heading and next month navigation button', () => {
    document.body.innerHTML = `
      <header class="calendar-header">
        <button aria-label="Previous Month">&lt;</button>
        <button aria-label="Next Month">&gt;</button>
        <button>Today</button>
        <h2>October 2026</h2>
      </header>
    `;

    const heading = getCalendarHeading(document);
    expect(heading).toBe('October 2026');

    const nextBtn = findNextMonthButton(document);
    expect(nextBtn).not.toBeNull();
    expect(nextBtn?.getAttribute('aria-label')).toBe('Next Month');
  });

  it('computes unified multi-month period labels correctly', () => {
    const events = [
      {
        id: '1',
        date: '2026-09-02',
        dayOfWeek: 'Wednesday',
        startTime: '09:00',
        endTime: '12:00',
        type: 'LP',
        typeLabel: 'Lecture (Physical)',
        courseCode: 'DM - 1',
        courseName: '',
        lecturer: 'Mr. Wijekoon',
        room: 'Hall 18',
        mode: 'Physical' as const,
        batch: 'DSE261FT',
        source: 'dom' as const,
      },
      {
        id: '2',
        date: '2026-10-15',
        dayOfWeek: 'Thursday',
        startTime: '13:00',
        endTime: '16:00',
        type: 'LP',
        typeLabel: 'Lecture (Physical)',
        courseCode: 'DM - 1',
        courseName: '',
        lecturer: 'Mr. Wijekoon',
        room: 'Hall 18',
        mode: 'Physical' as const,
        batch: 'DSE261FT',
        source: 'dom' as const,
      },
    ];

    const label = computeMultiMonthPeriodLabel(events, 'September 2026');
    expect(label).toContain('Sep 2026 – Oct 2026');
    expect(label).toContain('2 Months');
  });

  it('correctly resolves card dates when calendar is navigated to December 2026', () => {
    document.body.innerHTML = `
      <div class="calendar-wrapper">
        <header>
          <span>December 2026</span>
          <button>DSE261FT</button>
        </header>
        <div class="grid grid-cols-7">
          <div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div><div>Sun</div>
          <div class="day-cell"></div>
          <div class="day-cell"><span>1</span></div>
          <div class="day-cell">
            <span>2</span>
            <div class="card cursor-pointer"><span>EX GUI</span></div>
          </div>
          <div class="day-cell"><span>3</span></div>
          <div class="day-cell"><span>4</span></div>
          <div class="day-cell"><span>5</span></div>
          <div class="day-cell"><span>6</span></div>
          <div class="day-cell">
            <span>7</span>
            <div class="card cursor-pointer"><span>LP OS</span></div>
            <div class="card cursor-pointer"><span>LP OS</span></div>
          </div>
          <div class="day-cell">
            <span>8</span>
            <div class="card cursor-pointer"><span>LP EAD</span></div>
            <div class="card cursor-pointer"><span>LP EAD</span></div>
          </div>
          ${Array.from({ length: 28 }, (_, i) => `<div class="day-cell"><span>${i + 9}</span></div>`).join('')}
        </div>
        <footer>
          <div>LP Lecture (Physical)   SM Seminar   WS Workshop</div>
        </footer>
      </div>
    `;

    const activeContext: CalendarContext = {
      connected: true,
      view: 'month',
      year: 2026,
      month: 9, // stale September context
      periodLabel: 'September 2026',
      batch: 'DSE261FT',
      url: 'https://aca.mynibm.com/dashboard?view=month&year=2026&month=11',
    };

    const cards = collectCalendarCards(document, activeContext);

    // Should find EX GUI (Dec 2), 2x LP OS (Dec 7), 2x LP EAD (Dec 8) = 5 cards
    // And exclude SM Seminar / WS Workshop from footer
    expect(cards.length).toBe(5);
    expect(cards[0].previewText).toContain('EX GUI');
    expect(cards[0].cellDate).toBe('2026-12-02');

    expect(cards[1].previewText).toContain('LP OS');
    expect(cards[1].cellDate).toBe('2026-12-07');

    expect(cards[2].previewText).toContain('LP OS');
    expect(cards[2].cellDate).toBe('2026-12-07');

    expect(cards[3].previewText).toContain('LP EAD');
    expect(cards[3].cellDate).toBe('2026-12-08');

    expect(cards[4].previewText).toContain('LP EAD');
    expect(cards[4].cellDate).toBe('2026-12-08');
  });
});
