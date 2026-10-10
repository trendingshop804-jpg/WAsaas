/* =============================================================================
   campaign-analytics.js — NextBright CRM
   Multi-Channel Campaign Analytics, Delivery Funnel & ROI Performance Reports
   ============================================================================= */

'use strict';

(function () {
  let analyticsChartInstance = null;

  function initCampaignAnalytics() {
    renderAnalyticsCards();
    renderAnalyticsCharts();
    setupEventListeners();
  }

  function setupEventListeners() {
    const rangeSelect = document.getElementById('analytics-date-range');
    if (rangeSelect) {
      rangeSelect.addEventListener('change', () => {
        renderAnalyticsCards();
        renderAnalyticsCharts();
      });
    }

    const exportBtn = document.getElementById('btn-export-analytics-report');
    if (exportBtn) {
      exportBtn.addEventListener('click', exportAnalyticsReport);
    }
  }

  function renderAnalyticsCards() {
    // Collect stats from localStorage
    let totalSent = 470;
    let totalDelivered = 452;
    let totalRead = 368;
    let totalReplies = 98;

    try {
      const waCamps = JSON.parse(localStorage.getItem('nb_wa_campaigns') || '[]');
      waCamps.forEach(c => {
        totalSent += c.sent || 0;
        totalDelivered += c.delivered || 0;
        totalRead += c.read || 0;
        totalReplies += c.replied || 0;
      });
    } catch (e) {}

    const delRate = totalSent > 0 ? ((totalDelivered / totalSent) * 100).toFixed(1) : '98.2';
    const readRate = totalDelivered > 0 ? ((totalRead / totalDelivered) * 100).toFixed(1) : '81.4';
    const replyRate = totalRead > 0 ? ((totalReplies / totalRead) * 100).toFixed(1) : '26.6';

    const elSent = document.getElementById('analytics-card-sent');
    const elDel = document.getElementById('analytics-card-del-rate');
    const elRead = document.getElementById('analytics-card-read-rate');
    const elReply = document.getElementById('analytics-card-reply-rate');

    if (elSent) elSent.textContent = totalSent.toLocaleString();
    if (elDel) elDel.textContent = `${delRate}%`;
    if (elRead) elRead.textContent = `${readRate}%`;
    if (elReply) elReply.textContent = `${replyRate}%`;
  }

  function renderAnalyticsCharts() {
    const canvas = document.getElementById('campaign-performance-chart');
    if (!canvas || typeof Chart === 'undefined') return;

    if (analyticsChartInstance) {
      analyticsChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    analyticsChartInstance = new Chart(ctx, {
      type: 'line',
      data: {
        labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        datasets: [
          {
            label: 'WhatsApp Broadcasts Sent',
            data: [45, 120, 80, 160, 210, 95, 140],
            borderColor: '#25d366',
            backgroundColor: 'rgba(37, 211, 102, 0.1)',
            fill: true,
            tension: 0.35
          },
          {
            label: 'Instagram DM Interactions',
            data: [20, 45, 60, 85, 110, 140, 175],
            borderColor: '#e1306c',
            backgroundColor: 'rgba(225, 48, 108, 0.08)',
            fill: true,
            tension: 0.35
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'top' },
          tooltip: { mode: 'index', intersect: false }
        },
        scales: {
          y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  function exportAnalyticsReport() {
    const reportData = [
      ['Metric', 'Value'],
      ['Total Messages Sent', document.getElementById('analytics-card-sent')?.textContent || '470'],
      ['Delivery Rate', document.getElementById('analytics-card-del-rate')?.textContent || '98.2%'],
      ['Read / Open Rate', document.getElementById('analytics-card-read-rate')?.textContent || '81.4%'],
      ['Reply / Lead Conversion', document.getElementById('analytics-card-reply-rate')?.textContent || '26.6%'],
      ['Generated On', new Date().toLocaleString()]
    ];

    const csvContent = reportData.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign_analytics_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();

    if (window.showToast) window.showToast('Analytics report exported as CSV!', 'success');
  }

  window.NextBrightAnalytics = {
    init: initCampaignAnalytics,
    exportReport: exportAnalyticsReport
  };

  document.addEventListener('DOMContentLoaded', () => {
    initCampaignAnalytics();
  });
})();
