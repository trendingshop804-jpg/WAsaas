/* =============================================================================
   social-calendar.js — NextBright CRM
   Unified Social & Messaging Content Calendar View
   Aggregates scheduled Instagram posts, Reels, and WhatsApp Campaigns
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
    const prevBtn = document.getElementById('social-cal-prev') || document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('social-cal-next') || document.getElementById('cal-next-month');
    const todayBtn = document.getElementById('social-cal-today') || document.getElementById('cal-today');

    if (prevBtn) {
      prevBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() - 1);
        renderCalendar();
      };
    }

    if (nextBtn) {
      nextBtn.onclick = () => {
        currentDate.setMonth(currentDate.getMonth() + 1);
        renderCalendar();
      };
    }

    if (todayBtn) {
      todayBtn.onclick = () => {
        currentDate = new Date();
        renderCalendar();
      };
    }

    const channelSelect = document.getElementById('social-cal-filter-channel') || document.getElementById('cal-filter-channel');
    if (channelSelect) {
      channelSelect.onchange = (e) => {
        filterChannel = e.target.value;
        renderCalendar();
      };
    }
  }

  function getAllScheduledItems() {
    const items = [];

    // Instagram posts
    try {
      const igPosts = JSON.parse(localStorage.getItem('nb_instagram_posts') || '[]');
      igPosts.forEach(post => {
        if (post.scheduled_at) {
          items.push({
            id: post.id,
            channel: 'instagram',
            type: post.type || 'post',
            title: `IG: ${(post.caption || 'Post').substring(0, 28)}...`,
            date: new Date(post.scheduled_at),
            status: post.status,
            media_url: post.media_url,
            raw: post
          });
        }
      });
    } catch (e) {}

    // WhatsApp campaigns
    try {
      const waCamps = JSON.parse(localStorage.getItem('nb_wa_campaigns') || '[]');
      waCamps.forEach(camp => {
        if (camp.scheduled_at) {
          items.push({
            id: camp.id,
            channel: 'whatsapp',
            type: 'campaign',
            title: `WA: ${camp.name}`,
            date: new Date(camp.scheduled_at),
            status: camp.status,
            raw: camp
          });
        }
      });
    } catch (e) {}

    return items;
  }

  function renderCalendar() {
    const monthYearLabel = document.getElementById('social-cal-month') || document.getElementById('cal-month-year');
    const gridContainer = document.getElementById('social-cal-grid') || document.getElementById('social-calendar-grid');
    if (!gridContainer) return;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    if (monthYearLabel) {
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
      monthYearLabel.textContent = `${monthNames[month]} ${year}`;
    }

    let items = getAllScheduledItems();
    if (filterChannel !== 'all') {
      items = items.filter(it => it.channel === filterChannel);
    }

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    let html = '';
    const dayHeaders = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayHeaders.forEach(d => {
      html += `<div style="text-align:center;font-weight:700;font-size:0.75rem;color:var(--text-muted);padding:8px 0;">${d}</div>`;
    });

    for (let i = 0; i < firstDay; i++) {
      html += `<div class="cal-cell empty" style="min-height:95px;background:var(--navy-50,#f8fafc);border:1px solid var(--border-light);border-radius:6px;opacity:0.4;"></div>`;
    }

    const today = new Date();

    for (let day = 1; day <= daysInMonth; day++) {
      const cellDate = new Date(year, month, day);
      const isToday = cellDate.toDateString() === today.toDateString();

      const dayItems = items.filter(item => {
        const d = item.date;
        return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
      });

      html += `
        <div class="cal-cell ${isToday ? 'today' : ''}" style="min-height:95px;background:#fff;border:1px solid var(--border-light);border-radius:6px;padding:6px;display:flex;flex-direction:column;gap:4px;position:relative;">
          <div style="font-size:0.75rem;font-weight:${isToday ? '800' : '600'};color:${isToday ? 'var(--brand-primary)' : 'var(--text-primary)'};display:flex;justify-content:space-between;align-items:center;">
            <span>${day}</span>
            ${isToday ? '<span style="font-size:0.6rem;background:var(--brand-primary);color:#fff;padding:1px 4px;border-radius:3px;">TODAY</span>' : ''}
          </div>
          <div style="display:flex;flex-direction:column;gap:3px;overflow-y:auto;max-height:70px;">
            ${dayItems.map(item => {
              const isWA = item.channel === 'whatsapp';
              const color = isWA ? '#25d366' : '#e1306c';
              const bg = isWA ? 'rgba(37, 211, 102, 0.12)' : 'rgba(225, 48, 108, 0.12)';

              return `
                <div style="background:${bg};border-left:3px solid ${color};padding:3px 5px;border-radius:3px;font-size:0.68rem;cursor:pointer;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(item.title)}" onclick="alert('${escapeHtml(item.title)}\\nChannel: ${item.channel.toUpperCase()}\\nStatus: ${item.status}\\nTime: ${item.date.toLocaleTimeString()}')">
                  <span style="font-weight:700;">${isWA ? '💬' : '📸'}</span> ${escapeHtml(item.title)}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    }

    gridContainer.innerHTML = html;
    if (typeof feather !== 'undefined') feather.replace();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.NextBrightCalendar = {
    init: initSocialCalendar,
    render: renderCalendar
  };

  document.addEventListener('DOMContentLoaded', () => {
    initSocialCalendar();
  });
})();
