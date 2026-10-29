/* ============================================================
   CHARTS.JS — Chart.js chart initializations
   Every series is computed from the signed-in organization's
   records (window.NB). No demo values, no random numbers: an
   empty workspace renders an empty chart, not invented data.
   ============================================================ */
'use strict';

let leadOverviewChart, leadSourcesChart;
const reportChartInstances = {};
let overviewChartDays = 7;

/* ---- Lead Overview Chart (Line/Area) ---- */
function initLeadOverviewChart(days = 7) {
  const ctx = document.getElementById('lead-overview-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  overviewChartDays = days;

  const leads = Array.isArray(window.NB?.leads) ? window.NB.leads : [];
  const hasData = (window.NB?.loadState?.leads === 'ready') && leads.length > 0;

  const labels = [];
  const leadSeries = [];
  const customerSeries = [];
  const today = new Date();

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offset);
    const nextDay = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1);
    labels.push(days <= 7
      ? day.toLocaleDateString('en-IN', { weekday: 'short' })
      : day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }));
    const createdThatDay = leads.filter(lead => {
      if (!lead.created_at) return false;
      const created = new Date(lead.created_at);
      return created >= day && created < nextDay;
    });
    leadSeries.push(hasData ? createdThatDay.length : 0);
    customerSeries.push(hasData
      ? createdThatDay.filter(lead => ['Won', 'Converted'].includes(lead.status)).length
      : 0);
  }

  if (leadOverviewChart) leadOverviewChart.destroy();
  leadOverviewChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Leads created',
          data: leadSeries,
          fill: true,
          backgroundColor: 'rgba(37,99,235,0.08)',
          borderColor: '#2563EB',
          borderWidth: 2,
          pointBackgroundColor: '#2563EB',
          pointRadius: 2.5,
          pointHoverRadius: 5,
          tension: 0.4,
        },
        {
          label: 'Won / Converted',
          data: customerSeries,
          fill: true,
          backgroundColor: 'rgba(124,58,237,0.07)',
          borderColor: '#7C3AED',
          borderWidth: 2,
          pointBackgroundColor: '#7C3AED',
          pointRadius: 2.5,
          pointHoverRadius: 5,
          tension: 0.4,
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: {
            font: { family: 'Inter', size: 12 },
            color: '#64748B',
            boxWidth: 12,
            padding: 16,
          }
        },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#fff',
          bodyColor: '#CBD5E1',
          borderColor: '#1E293B',
          borderWidth: 1,
          padding: 12,
          titleFont: { family: 'Inter', weight: '700' },
          bodyFont: { family: 'Inter' },
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(226,232,240,0.6)', drawBorder: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8', maxTicksLimit: 8 }
        },
        y: {
          grid: { color: 'rgba(226,232,240,0.6)', drawBorder: false },
          ticks: { font: { family: 'Inter', size: 11 }, color: '#94A3B8', padding: 8 },
          beginAtZero: true,
        }
      }
    }
  });
}

window.updateLeadChart = function(days) {
  initLeadOverviewChart(Number(days) || 7);
};

/* ---- Lead Sources Donut Chart ---- */
function initLeadSourcesChart() {
  const ctx = document.getElementById('lead-sources-chart');
  if (!ctx || typeof Chart === 'undefined') return;

  const leads = Array.isArray(window.NB?.leads) ? window.NB.leads : [];
  const colors = ['#2563EB', '#8B5CF6', '#22C55E', '#F59E0B', '#EC4899', '#94A3B8'];

  // Count by the label the user picked; fall back to the stored source value.
  const counts = new Map();
  leads.forEach(lead => {
    const label = lead.custom_fields?.source_label || lead.source || 'Other';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  let sources = Array.from(counts.keys());
  let data = sources.map(label => counts.get(label));
  if (!sources.length) {
    sources = ['No data yet'];
    data = [1];
  }
  const total = data.reduce((sum, value) => sum + value, 0);
  const percentages = data.map(value => (total ? Math.round((value / total) * 100) : 0));

  if (leadSourcesChart) leadSourcesChart.destroy();
  leadSourcesChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: sources,
      datasets: [{
        data,
        backgroundColor: colors,
        borderWidth: 2,
        borderColor: '#ffffff',
        hoverBorderWidth: 3,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#0F172A',
          titleColor: '#fff',
          bodyColor: '#CBD5E1',
          padding: 10,
          titleFont: { family: 'Inter', weight: '700' },
          bodyFont: { family: 'Inter', size: 12 },
        }
      }
    }
  });

  // Custom legend
  const legendEl = document.getElementById('sources-legend');
  if (legendEl) {
    legendEl.innerHTML = leads.length
      ? sources.map((s, i) => `
        <div class="legend-item">
          <div class="legend-label">
            <div class="legend-dot" style="background:${colors[i % colors.length]}"></div>
            <span>${s}</span>
          </div>
          <span class="legend-value"><b>${data[i]}</b> (${percentages[i]}%)</span>
        </div>
      `).join('')
      : '<div class="legend-item"><span class="legend-value">No leads recorded yet.</span></div>';
  }

  const totalEl = document.getElementById('sources-total');
  if (totalEl) {
    totalEl.textContent = window.NB?.loadState?.leads === 'ready' ? String(leads.length) : '—';
  }
}

/* ---- Mini Report Charts ---- */
function initReportCharts() {
  if (typeof Chart === 'undefined') return;
  const leads = Array.isArray(window.NB?.leads) ? window.NB.leads : [];
  const conversations = Array.isArray(window.NB?.conversations) ? window.NB.conversations : [];
  const deals = Array.isArray(window.NB?.deals) ? window.NB.deals : [];
  const hasLeads = (window.NB?.loadState?.leads === 'ready');

  const days = 7;
  const buckets = Array.from({ length: days }, () => 0);
  const today = new Date();
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  const countSince = records => records.filter(record => {
    const created = record?.created_at ? new Date(record.created_at) : null;
    return created && created >= since;
  }).length;

  const miniChartOpts = (color, series) => ({
    type: 'line',
    data: {
      labels: ['','','','','','',''],
      datasets: [{
        data: series,
        fill: true,
        backgroundColor: color + '15',
        borderColor: color,
        borderWidth: 2,
        pointRadius: 0,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: {display:false}, tooltip: {enabled:false} },
      scales: { x:{display:false}, y:{display:false, beginAtZero:true} }
    }
  });

  // One real series per report card: leads created per day over the last week,
  // customers won per day, deals created per day, and outbound messages per day.
  const perDay = records => {
    const series = buckets.slice();
    records.forEach(record => {
      const created = record?.created_at ? new Date(record.created_at) : null;
      if (!created || created < since) return;
      const index = Math.floor((created - since) / (24 * 60 * 60 * 1000));
      if (index >= 0 && index < series.length) series[index] += 1;
    });
    return series;
  };

  const seriesBySource = {
    'conversion-chart': hasLeads ? perDay(leads) : buckets.slice(),
    'revenue-chart': hasLeads ? perDay(deals) : buckets.slice(),
    'growth-chart': hasLeads ? perDay(leads.filter(lead => ['Won', 'Converted'].includes(lead.status))) : buckets.slice(),
    'messages-chart': perDay(conversations.flatMap(conversation => conversation.messages || []))
  };
  const chartDefs = [
    { id:'conversion-chart', color:'#2563EB' },
    { id:'revenue-chart',    color:'#10B981' },
    { id:'growth-chart',     color:'#7C3AED' },
    { id:'messages-chart',   color:'#F59E0B' },
  ];
  chartDefs.forEach(({id, color}) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (reportChartInstances[id]) reportChartInstances[id].destroy();
    reportChartInstances[id] = new Chart(el, miniChartOpts(color, seriesBySource[id] || buckets.slice()));
  });
}

/* ---- Init ---- */
function refreshCRMCharts() {
  initLeadOverviewChart(overviewChartDays || 7);
  initLeadSourcesChart();
  initReportCharts();
}
window.refreshCRMCharts = refreshCRMCharts;

document.addEventListener('DOMContentLoaded', () => {
  refreshCRMCharts();

  window.addEventListener('resize', () => {
    if (leadOverviewChart) leadOverviewChart.resize();
    if (leadSourcesChart) leadSourcesChart.resize();
  });
});
