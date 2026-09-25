/* ============================================================
   CHARTS.JS — Chart.js chart initializations
   ============================================================ */
'use strict';

let leadOverviewChart, leadSourcesChart;

/* ---- Lead Overview Chart (Line/Area) ---- */
function initLeadOverviewChart(days = 30) {
  const ctx = document.getElementById('lead-overview-chart');
  if (!ctx || typeof Chart === 'undefined') return;
  const labels = generateLabels(days);
  const leads = generateData(days, 60, 120);
  const customers = generateData(days, 20, 70);

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
          pointRadius: 3,
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
          pointRadius: 3,
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
  const sources = ['Website','Instagram','Facebook','WhatsApp','Referral','Other'];
  const data    = [35, 20, 18, 12, 10, 5];
  const colors  = ['#2563EB','#EC4899','#3B82F6','#10B981','#F59E0B','#94A3B8'];

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
        <span class="legend-value">${data[i]}%</span>
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
  initLeadOverviewChart(30);
  initLeadSourcesChart();
  initReportCharts();

  window.addEventListener('resize', () => {
    if (leadOverviewChart) leadOverviewChart.resize();
    if (leadSourcesChart) leadSourcesChart.resize();
  });
});
