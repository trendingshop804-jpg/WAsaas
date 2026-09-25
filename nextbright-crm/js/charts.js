/* ============================================================
   CHARTS.JS — Chart.js chart initializations
   ============================================================ */
'use strict';

let leadOverviewChart, leadSourcesChart;

/* ---- Lead Overview Chart (Line/Area) ---- */
function initLeadOverviewChart(days = 30) {
  const ctx = document.getElementById('lead-overview-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  const labels = days === 7
    ? ['Aug 10', 'Aug 11', 'Aug 12', 'Aug 13', 'Aug 14', 'Aug 15', 'Aug 16']
    : generateLabels(days);
  const leads = days === 7
    ? [28, 42, 51, 60, 68, 78, 88]
    : generateData(days, 42, 112);
  const customers = days === 7
    ? [14, 25, 31, 40, 42, 49, 55]
    : generateData(days, 18, 74);

  if (leadOverviewChart) leadOverviewChart.destroy();
  leadOverviewChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Leads',
          data: leads,
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
          label: 'Customers',
          data: customers,
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
  initLeadOverviewChart(days);
};

/* ---- Lead Sources Donut Chart ---- */
function initLeadSourcesChart() {
  const ctx = document.getElementById('lead-sources-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  const sources = ['Website','Instagram','Facebook','WhatsApp','Referral','Others'];
  const data    = [31, 21, 17, 14, 9, 8];
  const counts  = [78, 52, 41, 34, 22, 21];
  const colors  = ['#2563EB','#8B5CF6','#22C55E','#F59E0B','#EC4899','#94A3B8'];

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
    legendEl.innerHTML = sources.map((s, i) => `
      <div class="legend-item">
        <div class="legend-label">
          <div class="legend-dot" style="background:${colors[i]}"></div>
          <span>${s}</span>
        </div>
        <span class="legend-value"><b>${counts[i]}</b> (${data[i]}%)</span>
      </div>
    `).join('');
  }
}

/* ---- Mini Report Charts ---- */
function initReportCharts() {
  if (typeof Chart === 'undefined') return;
  const miniChartOpts = (color) => ({
    type: 'line',
    data: {
      labels: ['','','','','','',''],
      datasets: [{
        data: generateData(7, 30, 100),
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

  const chartDefs = [
    { id:'conversion-chart', color:'#2563EB' },
    { id:'revenue-chart',    color:'#10B981' },
    { id:'growth-chart',     color:'#7C3AED' },
    { id:'messages-chart',   color:'#F59E0B' },
  ];
  chartDefs.forEach(({id, color}) => {
    const el = document.getElementById(id);
    if (el) new Chart(el, miniChartOpts(color));
  });
}

/* ---- Helpers ---- */
function generateLabels(days) {
  const labels = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    if (days <= 7)  labels.push(d.toLocaleDateString('en-IN', {weekday:'short'}));
    else if (days <= 30) { if (i % 3 === 0) labels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})); else labels.push(''); }
    else { if (i % 10 === 0) labels.push(d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})); else labels.push(''); }
  }
  return labels;
}

function generateData(count, min, max) {
  return Array.from({length:count}, () => Math.floor(Math.random() * (max-min) + min));
}

/* ---- Init ---- */
document.addEventListener('DOMContentLoaded', () => {
  initLeadOverviewChart(7);
  initLeadSourcesChart();
  initReportCharts();

  window.addEventListener('resize', () => {
    if (leadOverviewChart) leadOverviewChart.resize();
    if (leadSourcesChart) leadSourcesChart.resize();
  });
});
