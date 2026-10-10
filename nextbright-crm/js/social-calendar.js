/* =============================================================================
   social-calendar.js — NextBright CRM
   Unified Social & Messaging Content Calendar View
   ============================================================================= */

'use strict';

(function () {
  let currentDate = new Date();
  let filterChannel = 'all';

  function initSocialCalendar() {
    renderCalendar();
    setupEventListeners();
  }

  function setupEventListeners() {
    const prevBtn = document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('cal-next-month');
    const todayBtn = document.getElementById('cal-today');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
      });
    }

    if (todayBtn) {
      todayBtn.addEventListener('click', () => {
        currentDate = new Date();
        renderCalendar();
      });
    }

    const channelSelect = document.getElementById('cal-filter-channel');
    if (channelSelect) {
      channelSelect.addEventListener('change', (e) => {
        filterChannel = e.target.value;
        renderCalendar();
      });
    }
  }

  function getAllScheduledItems() {
    const items = [];

    // Instagram posts from localStorage
    try {
      const igPosts = JSON.parse(localStorage.getItem('nb_instagram_posts') || '[]');
      igPosts.forEach(post => {
        if (post.scheduled_at) {
          items.push({
            id: post.id,
            channel: 'instagram',
            title: `IG (${post.type}): ${post.caption.substring(0, 30)}...`,
            date: new Date(post.scheduled_at),
            status: post.status,
            media_url: post.media_url
          });
        }
      });
    } catch (e) {}

    // WhatsApp campaigns from localStorage
    try {
      const waCamps = JSON.parse(localStorage.getItem('nb_wa_campaigns') || '[]');
      waCamps.forEach(camp => {
        if (camp.scheduled_at) {
          items.push({
            id: camp.id,
            channel: 'whatsapp',
            title: `WA Camp: ${camp.name}`,
            date: new Date(camp.scheduled_at),
            status: camp.status
          });
        }
      });
    } catch (e) {}

    return items;
  }

  function renderCalendar() {
    const monthYearLabel = document.getElementById('cal-month-year');
    const gridContainer = document.getElementById('social-calendar-grid');
    if (!gridContainer) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (monthYearLabel) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      monthYearLabel.textContent = `${monthNames[month]} ${year}`;
    }

    const firstDayIndex = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();

    let items = getAllScheduledItems();
    if (filterChannel !== 'all') {
      items = items.filter(i => i.channel === filterChannel);
    }

    let html = '';
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Headers
    dayHeaders.forEach(dh => {
      html += `<div style="font-weight: 600; text-align: center; padding: 10px; font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">${dh}</div>`;
    });

    // Previous month padding cells
    for (let x = firstDayIndex; x > 0; x--) {
      const dayNum = prevMonthDays - x + 1;
      html += `
        <div style="background: var(--navy-50); opacity: 0.4; padding: 8px; min-height: 90px; border: 1px solid var(--border-light); font-size: 0.75rem;">
          <span style="font-weight: 600; color: var(--text-muted);">${dayNum}</span>
        </div>
      `;
    }

    const todayStr = new Date().toDateString();

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const cellDate = new Date(year, month, day);
      const isToday = cellDate.toDateString() === todayStr;

      // Find items matching this day
      const dayItems = items.filter(item => item.date.toDateString() === cellDate.toDateString());

      html += `
        <div class="cal-day-cell" style="background: ${isToday ? '#f0f7ff' : 'white'}; padding: 8px; min-height: 100px; border: 1px solid var(--border-light); border-radius: 6px; display: flex; flex-direction: column; justify-content: space-between; position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 0.85rem; ${isToday ? 'color: var(--primary); background: rgba(59,130,246,0.15); padding: 2px 6px; border-radius: 4px;' : 'color: var(--text-dark);'}">
              ${day}
            </span>
            ${dayItems.length > 0 ? `<span class="badge badge-primary" style="font-size: 0.65rem;">${dayItems.length}</span>` : ''}
          </div>

          <div style="margin-top: 6px; display: flex; flex-direction: column; gap: 4px; flex: 1; overflow-y: auto; max-height: 70px;">
            ${dayItems.map(item => {
              const isWA = item.channel === 'whatsapp';
              const color = isWA ? '#25d366' : '#e1306c';
              const bg = isWA ? 'rgba(37, 211, 102, 0.12)' : 'rgba(225, 48, 108, 0.12)';

              return `
                <div style="background: ${bg}; border-left: 3px solid ${color}; padding: 3px 6px; border-radius: 3px; font-size: 0.7rem; font-weight: 500; color: var(--text-dark); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.title}">
                  ${item.title}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    gridContainer.innerHTML = html;
  }

  window.NextBrightCalendar = {
    init: initSocialCalendar,
    render: renderCalendar
  };

  document.addEventListener('DOMContentLoaded', () => {
    initSocialCalendar();
  });
})();
