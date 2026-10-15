/* Production-safe shared UI data helpers. No customer or demo records live here. */
'use strict';
(function () {
  const NB = window.NB = window.NB || {};
  const colors = ['#2563EB', '#7C3AED', '#10B981', '#F59E0B', '#EF4444', '#0EA5E9'];
  NB.avatarColor = function (name = '') { let hash = 0; for (const char of String(name)) hash = char.charCodeAt(0) + ((hash << 5) - hash); return colors[Math.abs(hash) % colors.length]; };
  NB.initials = function (name = '') { return String(name).split(/\s+/).filter(Boolean).map(part => part[0]).join('').toUpperCase().slice(0, 2) || '?'; };
  NB.ago = function (days = 0) { const date = new Date(); date.setDate(date.getDate() - Number(days || 0)); return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
  Object.assign(NB, { leads: NB.leads || [], customers: NB.customers || [], deals: NB.deals || {}, calls: NB.calls || [], conversations: NB.conversations || [], activityFeed: NB.activityFeed || [], tasks: NB.tasks || [], appointments: NB.appointments || [] });
})();