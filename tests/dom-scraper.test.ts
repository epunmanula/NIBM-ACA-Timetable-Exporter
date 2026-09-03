// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { scrapeTimetableFromDOM } from '../src/content/dom-scraper';

describe('DOM Scraper - ACA Calendar Simulation', () => {
  it('extracts and normalizes events from a simulated ACA month calendar grid', () => {
    // Construct simulated ACA calendar HTML
    document.body.innerHTML = `
      <div id="root">
        <header>
          <h1>Academic Calendar - September 2026</h1>
          <div class="batch-selector">
            <span class="active-batch">DSE241FT</span>
          </div>
          <div class="view-tabs">
            <button aria-selected="true">Month</button>
            <button aria-selected="false">Week</button>
            <button aria-selected="false">Day</button>
          </div>
        </header>

        <main>
          <div role="grid" class="calendar-grid">
            <!-- Outside Month Day (Aug 31) -->
            <div role="gridcell" class="day-cell outside-month text-muted" data-date="2026-08-31">
              <span class="day-num">31</span>
            </div>

            <!-- Day 1 (Sep 1) with 2 events -->
            <div role="gridcell" class="day-cell" data-date="2026-09-01">
              <span class="day-num">1</span>
              <div class="event-card lecture-physical" data-type="LP">
                <span class="badge">LP</span>
                <span class="time">08:30 - 10:30</span>
                <strong class="course-code">DSE501</strong>
                <span class="course-name">Software Architecture</span>
                <span class="lecturer">Dr. Perera</span>
                <span class="room">Hall 4A</span>
              </div>
              <div class="event-card lecture-online" data-type="LO">
                <span class="badge">LO</span>
                <span class="time">13:00 - 15:00</span>
                <strong class="course-code">DSE502</strong>
                <span class="course-name">Advanced Database Systems</span>
                <span class="lecturer">Prof. Silva</span>
                <span class="room">Online</span>
              </div>
            </div>

            <!-- Day 2 (Sep 2) with a Tutorial -->
            <div role="gridcell" class="day-cell" data-date="2026-09-02">
              <span class="day-num">2</span>
              <div class="event-card" data-type="TU">
                <span class="badge">TU</span>
                <span class="time">10:30 - 12:30</span>
                <strong class="course-code">DSE501</strong>
                <span class="lecturer">Mr. Bandara</span>
                <span class="room">Lab 2</span>
              </div>
            </div>

            <!-- Empty cells to complete 28 cells for grid test -->
            ${Array.from({ length: 27 })
              .map(
                (_, i) => `
              <div role="gridcell" class="day-cell">
                <span class="day-num">${i + 3}</span>
              </div>
            `
              )
              .join('')}
          </div>
        </main>
      </div>
    `;

    const result = scrapeTimetableFromDOM(
      document,
      'https://aca.mynibm.com/dashboard?view=month&year=2026&month=8&batch=c1a2-3b4c-5d6e'
    );

    expect(result.context.connected).toBe(true);
    expect(result.context.view).toBe('month');
    expect(result.context.batch).toBe('DSE241FT');
    expect(result.context.periodLabel).toBe('September 2026');

    expect(result.events.length).toBe(3);

    // Event 1
    const ev1 = result.events[0];
    expect(ev1.date).toBe('2026-09-01');
    expect(ev1.dayOfWeek).toBe('Tuesday');
    expect(ev1.startTime).toBe('08:30');
    expect(ev1.endTime).toBe('10:30');
    expect(ev1.type).toBe('LP');
    expect(ev1.typeLabel).toBe('Lecture (Physical)');
    expect(ev1.courseCode).toBe('DSE501');
    expect(ev1.courseName).toBe('Software Architecture');
    expect(ev1.lecturer).toBe('Dr. Perera');
    expect(ev1.room).toBe('Hall 4A');
    expect(ev1.mode).toBe('Physical');
    expect(ev1.batch).toBe('DSE241FT');

    // Event 2
    const ev2 = result.events[1];
    expect(ev2.date).toBe('2026-09-01');
    expect(ev2.startTime).toBe('13:00');
    expect(ev2.endTime).toBe('15:00');
    expect(ev2.type).toBe('LO');
    expect(ev2.typeLabel).toBe('Lecture (Online)');
    expect(ev2.mode).toBe('Online');

    // Event 3
    const ev3 = result.events[2];
    expect(ev3.date).toBe('2026-09-02');
    expect(ev3.startTime).toBe('10:30');
    expect(ev3.endTime).toBe('12:30');
    expect(ev3.type).toBe('TU');
    expect(ev3.typeLabel).toBe('Tutorial');
    expect(ev3.room).toBe('Lab 2');

    // Summary checks
    expect(result.summary.totalFound).toBe(3);
    expect(result.summary.uniqueCount).toBe(3);
    expect(result.summary.duplicatesRemoved).toBe(0);
  });

  it('accurately parses real NIBM ACA compact badges (LP MC, LP APF, LP ECS - 1) and active modal', () => {
    document.body.innerHTML = `
      <div id="__next">
        <header>
          <h1>September 2026</h1>
          <button class="batch-dropdown">DSE262FT</button>
        </header>

        <div class="calendar-container">
          <!-- Tuesday Sep 1: 2 LP MC badges -->
          <div class="day-cell">
            <span class="day-header">1</span>
            <div class="badge-row">
              <div class="lecture-badge">LP MC</div>
            </div>
            <div class="badge-row">
              <div class="lecture-badge">LP MC</div>
            </div>
          </div>

          <!-- Wednesday Sep 2: 2 LP APF badges -->
          <div class="day-cell">
            <span class="day-header">2</span>
            <div class="lecture-badge">LP APF</div>
            <div class="lecture-badge">LP APF</div>
          </div>

          <!-- Friday Sep 4: 2 LP ECS - 1 badges -->
          <div class="day-cell">
            <span class="day-header">4</span>
            <div class="lecture-badge">LP ECS - 1</div>
            <div class="lecture-badge">LP ECS - 1</div>
          </div>

          <!-- Monday Sep 14: 4 badges -->
          <div class="day-cell">
            <span class="day-header">14</span>
            <div class="lecture-badge">LP APF</div>
            <div class="lecture-badge">TU APF</div>
          </div>

          <!-- Active Modal currently open for Tuesday Sep 1 -->
          <div role="dialog" class="modal-dialog">
            <h3>MC</h3>
            <p>Tuesday, September 1, 2026</p>
            <p>9:00 AM – 12:00 PM</p>
            <p>Ms W M A D Weerathunga</p>
            <p>Lecture Hall 18 - 1st Fl</p>
            <span class="tag">LECTURE PHYSICAL</span>
            <span class="status">APPROVED</span>
          </div>

          <!-- Footer Legend that should be ignored -->
          <footer>
            <span>LP Lecture (Physical)</span>
            <span>LO Lecture (Online)</span>
            <span>TU Tutorial</span>
          </footer>
        </div>
      </div>
    `;

    const result = scrapeTimetableFromDOM(
      document,
      'https://aca.mynibm.com/dashboard?view=month&year=2026&month=8&batch=5359921f-9f77-4335-946f-e54cb90fb4bf'
    );

    expect(result.context.batch).toBe('DSE262FT');
    expect(result.context.periodLabel).toBe('September 2026');

    // Check Day 1 MC merged with modal
    const day1Event = result.events.find(
      (e) => e.date === '2026-09-01' && e.courseCode === 'MC' && e.startTime
    );
    expect(day1Event).toBeDefined();
    expect(day1Event?.startTime).toBe('09:00');
    expect(day1Event?.endTime).toBe('12:00');
    expect(day1Event?.lecturer).toBe('Ms W M A D Weerathunga');
    expect(day1Event?.room).toBe('Lecture Hall 18 - 1st Fl');
    expect(day1Event?.type).toBe('LP');

    // Check Day 4 ECS - 1
    const day4Event = result.events.find((e) => e.date === '2026-09-04');
    expect(day4Event).toBeDefined();
    expect(day4Event?.courseCode).toBe('ECS - 1');

    // Check Day 14 TU APF
    const day14Tu = result.events.find((e) => e.date === '2026-09-14' && e.type === 'TU');
    expect(day14Tu).toBeDefined();
    expect(day14Tu?.courseCode).toBe('APF');
    expect(day14Tu?.typeLabel).toBe('Tutorial');
  });

  it('accurately parses unspaced adjacent spans like <span>LP</span><span>MC</span>', () => {
    document.body.innerHTML = `
      <div id="__next">
        <header>
          <h1>September 2026</h1>
          <button class="batch-dropdown">DSE262FT</button>
        </header>
        <div class="calendar-grid">
          <div class="day-cell">
            <span class="day-number">1</span>
            <div class="event-pill"><span class="font-bold">LP</span><span>MC</span></div>
            <div class="event-pill"><span class="font-bold">LP</span><span>MC</span></div>
          </div>
          <div class="day-cell">
            <span class="day-number">2</span>
            <div class="event-pill"><span class="font-bold">LP</span><span>APF</span></div>
          </div>
        </div>
      </div>
    `;

    const result = scrapeTimetableFromDOM(
      document,
      'https://aca.mynibm.com/dashboard?view=month&year=2026&month=8&batch=5359921f-9f77-4335-946f-e54cb90fb4bf'
    );

    expect(result.events.length).toBeGreaterThanOrEqual(2);
    const day1 = result.events.filter((e) => e.date === '2026-09-01');
    expect(day1.length).toBeGreaterThanOrEqual(1);
    expect(day1[0].type).toBe('LP');
    expect(day1[0].courseCode).toBe('MC');

    const day2 = result.events.find((e) => e.date === '2026-09-02');
    expect(day2).toBeDefined();
    expect(day2?.type).toBe('LP');
    expect(day2?.courseCode).toBe('APF');
  });
});
