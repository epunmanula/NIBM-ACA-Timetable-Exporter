/**
 * NIBM ACA Timetable Exporter - Interactive Landing Page Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // 1. Mobile Navigation Toggle
  const navToggle = document.getElementById('navToggle');
  const navLinks = document.querySelector('.nav-links');
  if (navToggle && navLinks) {
    navToggle.addEventListener('click', () => {
      navLinks.classList.toggle('open');
    });
  }

  // 2. FAQ Accordion
  const faqItems = document.querySelectorAll('.faq-item');
  faqItems.forEach((item) => {
    const questionBtn = item.querySelector('.faq-question');
    if (questionBtn) {
      questionBtn.addEventListener('click', () => {
        const isActive = item.classList.contains('active');
        faqItems.forEach((f) => f.classList.remove('active'));
        if (!isActive) {
          item.classList.add('active');
        }
      });
    }
  });

  // 3. Hero Visual Mockup Dynamic Loop Animation
  const mockupBannerText = document.getElementById('mockupBannerText');
  const mockupProgressBar = document.getElementById('mockupProgressBar');
  if (mockupBannerText && mockupProgressBar) {
    const mockCards = [
      { text: 'Enriching card 2 of 13: [Dec 2026] EX GUI (15%)...', pct: 15 },
      { text: 'Enriching card 7 of 13: [Dec 2026] LP OS (54%)...', pct: 54 },
      { text: 'Enriching card 8 of 13: [Dec 2026] LP EAD (62%)...', pct: 62 },
      { text: 'Enriching card 12 of 13: [Dec 2026] LP DMW (92%)...', pct: 92 },
      { text: 'Completed crawling 13 cards! All details captured.', pct: 100 },
    ];
    let cardIdx = 1;
    setInterval(() => {
      cardIdx = (cardIdx + 1) % mockCards.length;
      const item = mockCards[cardIdx];
      mockupBannerText.textContent = item.text;
      mockupProgressBar.style.width = `${item.pct}%`;
    }, 2800);
  }

  // 4. Interactive Live Demo Engine
  const btnStartDemo = document.getElementById('btnStartDemo');
  const btnDownloadDemoCsv = document.getElementById('btnDownloadDemoCsv');
  const btnResetDemo = document.getElementById('btnResetDemo');

  const demoStatusText = document.getElementById('demoStatusText');
  const demoDot = document.getElementById('demoDot');
  const demoProgressFill = document.getElementById('demoProgressFill');
  const demoTableBody = document.getElementById('demoTableBody');

  const demoStatMonths = document.getElementById('demoStatMonths');
  const demoStatCards = document.getElementById('demoStatCards');

  // Sample data simulating real NIBM ACA Timetable multi-month schedule
  const sampleEvents = [
    {
      date: '2026-10-06',
      day: 'Tuesday',
      time: '09:00 - 12:00',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      code: 'OS',
      name: 'Operating Systems',
      lecturer: 'Dr. Perera',
      room: 'Lecture Hall 18 - 1st Fl',
      mode: 'Physical',
      monthTag: 'Month 1: Oct 2026',
    },
    {
      date: '2026-10-06',
      day: 'Tuesday',
      time: '13:00 - 16:00',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      code: 'OS',
      name: 'Operating Systems',
      lecturer: 'Dr. Perera',
      room: 'Lecture Hall 18 - 1st Fl',
      mode: 'Physical',
      monthTag: 'Month 1: Oct 2026',
    },
    {
      date: '2026-10-15',
      day: 'Thursday',
      time: '09:00 - 12:00',
      type: 'LB',
      typeLabel: 'Lab Session',
      code: 'EAD',
      name: 'Enterprise App Dev',
      lecturer: 'Ms. Fernando',
      room: 'Lab 02',
      mode: 'Physical',
      monthTag: 'Month 1: Oct 2026',
    },
    {
      date: '2026-11-03',
      day: 'Tuesday',
      time: '09:00 - 12:00',
      type: 'TU',
      typeLabel: 'Tutorial',
      code: 'APF',
      name: 'Agile Programming Frameworks',
      lecturer: 'Mr. Gunasekara',
      room: 'Hall 4A',
      mode: 'Physical',
      monthTag: 'Month 2: Nov 2026',
    },
    {
      date: '2026-11-17',
      day: 'Tuesday',
      time: '13:00 - 16:00',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      code: 'DMW',
      name: 'Data Warehousing & Mining',
      lecturer: 'Dr. Wickramasinghe',
      room: 'Lecture Hall 18 - 1st Fl',
      mode: 'Physical',
      monthTag: 'Month 2: Nov 2026',
    },
    {
      date: '2026-12-02',
      day: 'Wednesday',
      time: '09:00 - 12:00',
      type: 'EX',
      typeLabel: 'Examination',
      code: 'GUI',
      name: 'GUI Application Development',
      lecturer: 'Exam Division',
      room: 'Auditorium 1',
      mode: 'Physical',
      monthTag: 'Month 3: Dec 2026',
    },
    {
      date: '2026-12-07',
      day: 'Monday',
      time: '09:00 - 12:00',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      code: 'OS',
      name: 'Operating Systems',
      lecturer: 'Dr. Perera',
      room: 'Lecture Hall 18 - 1st Fl',
      mode: 'Physical',
      monthTag: 'Month 3: Dec 2026',
    },
    {
      date: '2026-12-07',
      day: 'Monday',
      time: '13:00 - 16:00',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      code: 'OS',
      name: 'Operating Systems',
      lecturer: 'Dr. Perera',
      room: 'Lecture Hall 18 - 1st Fl',
      mode: 'Physical',
      monthTag: 'Month 3: Dec 2026',
    },
    {
      date: '2026-12-08',
      day: 'Tuesday',
      time: '09:00 - 12:00',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      code: 'EAD',
      name: 'Enterprise App Dev',
      lecturer: 'Ms. Fernando',
      room: 'Lecture Hall 18 - 1st Fl',
      mode: 'Physical',
      monthTag: 'Month 3: Dec 2026',
    },
    {
      date: '2026-12-08',
      day: 'Tuesday',
      time: '13:00 - 16:00',
      type: 'LP',
      typeLabel: 'Lecture (Physical)',
      code: 'EAD',
      name: 'Enterprise App Dev',
      lecturer: 'Ms. Fernando',
      room: 'Lecture Hall 18 - 1st Fl',
      mode: 'Physical',
      monthTag: 'Month 3: Dec 2026',
    },
  ];

  let isDemoRunning = false;
  let crawledDemoEvents = [];

  function resetDemo() {
    isDemoRunning = false;
    crawledDemoEvents = [];
    demoStatusText.textContent = 'Engine Ready • Standby';
    demoDot.className = 'demo-dot';
    demoProgressFill.style.width = '0%';
    demoStatMonths.textContent = '0 / 3';
    demoStatCards.textContent = '0';
    demoTableBody.innerHTML = `
      <tr class="demo-empty-row">
        <td colspan="8">Click <strong>"Start Interactive Demo Scan"</strong> to watch records populate in real-time.</td>
      </tr>
    `;
    btnStartDemo.disabled = false;
    btnDownloadDemoCsv.disabled = true;
  }

  if (btnResetDemo) btnResetDemo.addEventListener('click', resetDemo);

  if (btnStartDemo) {
    btnStartDemo.addEventListener('click', async () => {
      if (isDemoRunning) return;
      isDemoRunning = true;
      btnStartDemo.disabled = true;
      btnDownloadDemoCsv.disabled = true;
      demoTableBody.innerHTML = '';
      demoDot.className = 'demo-dot running';

      const total = sampleEvents.length;
      crawledDemoEvents = [];

      for (let i = 0; i < total; i++) {
        const ev = sampleEvents[i];
        const currentMonthNum = i < 3 ? 1 : i < 5 ? 2 : 3;
        const currentMonthName = currentMonthNum === 1 ? 'October 2026' : currentMonthNum === 2 ? 'November 2026' : 'December 2026';

        // Update status text
        demoStatusText.textContent = `[Month ${currentMonthNum}/3: ${currentMonthName}] Opening modal & crawling card: ${ev.type} ${ev.code}...`;
        demoStatMonths.textContent = `${currentMonthNum} / 3`;

        const pct = Math.round(((i + 1) / total) * 100);
        demoProgressFill.style.width = `${pct}%`;
        demoStatCards.textContent = (i + 1).toString();

        // Append row
        const tr = document.createElement('tr');
        const badgeClass = ev.type === 'LP' ? 'type-lp' : ev.type === 'LB' ? 'type-lb' : ev.type === 'EX' ? 'type-ex' : 'type-other';

        tr.innerHTML = `
          <td><strong>${ev.date}</strong></td>
          <td>${ev.day}</td>
          <td>${ev.time}</td>
          <td><span class="type-pill ${badgeClass}">${ev.type}</span></td>
          <td><strong>${ev.code}</strong> ${ev.name}</td>
          <td>${ev.lecturer}</td>
          <td>${ev.room}</td>
          <td>${ev.mode}</td>
        `;
        demoTableBody.appendChild(tr);

        // Scroll table to bottom smoothly
        const tableWrapper = document.querySelector('.demo-table-wrapper');
        if (tableWrapper) tableWrapper.scrollTop = tableWrapper.scrollHeight;

        crawledDemoEvents.push(ev);

        // Simulate realistic network/modal settling latency
        await new Promise((r) => setTimeout(r, 220));
      }

      demoStatusText.textContent = `✓ Multi-month scan complete! Collected ${total} events across 3 months. Ready to export.`;
      demoDot.className = 'demo-dot finished';
      btnDownloadDemoCsv.disabled = false;
      btnStartDemo.disabled = false;
      isDemoRunning = false;
    });
  }

  // 5. Download Sample Demo CSV
  if (btnDownloadDemoCsv) {
    btnDownloadDemoCsv.addEventListener('click', () => {
      if (crawledDemoEvents.length === 0) return;

      // RFC 4180 CSV builder with UTF-8 BOM
      const BOM = '\uFEFF';
      const headers = ['Date', 'Day', 'Start Time', 'End Time', 'Type', 'Type Label', 'Course Code', 'Course Name', 'Lecturer', 'Room', 'Mode', 'Batch'];
      
      const escapeCell = (val) => {
        if (!val) return '';
        const str = String(val);
        if (/[",\r\n]/.test(str)) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      const rows = crawledDemoEvents.map((ev) => {
        const [st, et] = ev.time.split(' - ');
        return [
          escapeCell(ev.date),
          escapeCell(ev.day),
          escapeCell(st),
          escapeCell(et),
          escapeCell(ev.type),
          escapeCell(ev.typeLabel),
          escapeCell(ev.code),
          escapeCell(ev.name),
          escapeCell(ev.lecturer),
          escapeCell(ev.room),
          escapeCell(ev.mode),
          escapeCell('DSE261FT'),
        ].join(',');
      });

      const csvContent = BOM + [headers.join(','), ...rows].join('\r\n') + '\r\n';

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'NIBM_Timetable_DSE261FT_Oct_2026_Dec_2026_Demo.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 500);
    });
  }
});
