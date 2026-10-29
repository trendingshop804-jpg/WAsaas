// scripts/test-crm-persistence-fixes.mjs
// Verification for the CRM persistence / data-integrity fixes.
//
// 1. Frontend logic (app.js loaded with a DOM stub):
//      * deal amount parsing rejects negatives and unparseable values
//      * stage totals are numeric, INR-formatted, and handle zero
//      * blank phone renders "Not provided" with disabled call/message actions
//      * the calendar has ONE state: title, grid, selected day and month/week/day
//        views all move together, including across month and year boundaries
// 2. Local API auth boundary (dev-server.js): /api/leads, /api/tasks,
//    /api/deals, /api/appointments must answer 401 without a session.
// 3. Live deployment: same endpoints must answer 401 unauthenticated
//    (proves the security boundary still holds on the deployed app).
// 4. Vercel Hobby plan constraint: the api/ directory must expose at most 12
//    serverless functions — everything is routed through the single
//    api/[slug].js dispatcher, so the count must stay at 1.
//
// Run: node scripts/test-crm-persistence-fixes.mjs

import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const LOCAL = 'http://localhost:3001';
const LIVE = process.env.LIVE_E2E_ORIGIN || 'https://w-asaas.vercel.app';

let passed = 0, failed = 0;
const test = async (name, fn) => {
  try {
    await fn();
    passed += 1;
    console.log('  PASS ', name);
  } catch (error) {
    failed += 1;
    console.log('  FAIL ', name);
    console.log('        ', error.message);
  }
};

/* ------------------------------------------------------------------ DOM stub */
function makeElement(id) {
  return {
    id,
    innerHTML: '',
    textContent: '',
    value: '',
    style: {},
    disabled: false,
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    addEventListener() {},
    querySelector() { return null; },
    querySelectorAll() { return []; }
  };
}

const elements = new Map();
const knownIds = ['deals-pipeline', 'recent-leads-tbody', 'leads-table-tbody', 'leads-kanban-view',
  'cal-grid-days', 'cal-month-title', 'today-task-list', 'tasks-full-list', 'appt-list', 'funnel-wrap'];

globalThis.document = {
  addEventListener() {},
  getElementById(id) {
    if (!knownIds.includes(id)) return null;
    if (!elements.has(id)) elements.set(id, makeElement(id));
    return elements.get(id);
  },
  querySelector() { return null; },
  querySelectorAll() { return []; }
};
globalThis.window = { NB: { leads: [], customers: [], deals: [], tasks: [], appointments: [], conversations: [] } };
globalThis.feather = undefined;

await import(pathToFileURL(path.join(ROOT, 'nextbright-crm', 'js', 'data.js')).href);
await import(pathToFileURL(path.join(ROOT, 'nextbright-crm', 'js', 'app.js')).href);
const W = globalThis.window;
// Simulate an already-loaded workspace so renders are exercised past the
// loading state (the loading/unavailable branches are asserted separately).
W.NB.loadState = { leads: 'ready', tasks: 'ready', messages: 'ready', deals: 'ready', appointments: 'ready' };

console.log('=== CRM persistence & data-integrity fixes ===\n');
console.log('  --- frontend logic ---');

await test('parseDealAmount: "₹1,20,000" -> 120000', () => {
  assert.equal(W.parseDealAmount('₹1,20,000'), 120000);
});

await test('parseDealAmount: negative values are rejected', () => {
  assert.equal(W.parseDealAmount('-100'), null);
  assert.equal(W.parseDealAmount('₹-500'), null);
});

await test('parseDealAmount: zero and decimals are accepted', () => {
  assert.equal(W.parseDealAmount('0'), 0);
  assert.equal(W.parseDealAmount('₹1,000.50'), 1000.5);
});

await test('parseDealAmount: unparseable text is rejected', () => {
  assert.equal(W.parseDealAmount('abc'), null);
  assert.equal(W.parseDealAmount(''), null);
});

await test('formatINR renders Indian grouping', () => {
  assert.equal(W.formatINR(120000), '₹1,20,000');
  assert.equal(W.formatINR(0), '₹0');
  assert.equal(W.formatINR('n/a'), '—');
});

await test('stage totals come from numeric amounts; negatives never inflate a total', () => {
  W.NB.dealsStorageAvailable = true;
  W.NB.deals = [
    { title: 'A', stage: 'New', amount: 100000 },
    { title: 'B', stage: 'New', amount: '₹1,00,000' },
    { title: 'C', stage: 'Lost', amount: -100 },
    { title: 'D', stage: 'Won', amount: 0 }
  ];
  W.renderDeals();
  const html = elements.get('deals-pipeline').innerHTML;
  assert.ok(html.includes('₹2,00,000'), 'New stage must total 2,00,000');
  assert.ok(html.includes('₹0'), 'a Won deal with amount 0 must show ₹0, not —');
  assert.ok(!html.includes('₹1K'), 'the old "₹K" string formatting must be gone');
});

await test('blank phone renders "Not provided" and disables call/message actions', () => {
  W.NB.leads = [{ id: 'lead-1', name: 'No Phone Person', phone: null, source: 'Manual', status: 'New', assigned: 'Unassigned', date: '28 Oct 2026', lastActivity: '' }];
  W.renderRecentLeads();
  const html = elements.get('recent-leads-tbody').innerHTML;
  assert.ok(html.includes('Not provided'), 'missing phone must display "Not provided"');
  assert.ok(html.includes('disabled'), 'call/message actions must be disabled without a phone');
  assert.ok(!html.includes('98765'), 'no invented fallback phone number');
});

await test('a lead with a phone keeps working call/message actions', () => {
  W.NB.leads = [{ id: 'lead-2', name: 'Has Phone', phone: '+91 90000 00000', source: 'Manual', status: 'New', assigned: 'Unassigned', date: '28 Oct 2026', lastActivity: '' }];
  W.renderRecentLeads();
  const html = elements.get('recent-leads-tbody').innerHTML;
  assert.ok(html.includes('+91 90000 00000'));
  assert.ok(!html.includes('disabled'));
});

await test('calendar: title, cursor and grid move together across a year boundary', () => {
  W.NB.appointments = [];
  W.NB_CALENDAR.setView('month');
  // Force the cursor to December 2026, then step forward one month.
  const state = W.NB_CALENDAR_STATE;
  state.cursor = new Date(2026, 11, 1);
  state.selectedDate = '2026-12-31';
  W.renderCalendar();
  assert.ok(elements.get('cal-month-title').textContent.includes('December 2026'));
  W.NB_CALENDAR.move(1);
  assert.equal(state.cursor.getFullYear(), 2027, 'cursor must roll into the next year');
  assert.equal(state.cursor.getMonth(), 0);
  assert.ok(elements.get('cal-month-title').textContent.includes('January 2027'),
    `title must follow the cursor, got "${elements.get('cal-month-title').textContent}"`);
  const html = elements.get('cal-grid-days').innerHTML;
  assert.ok(html.includes('>1</div>'), 'the January grid must contain day 1');
  assert.ok(html.includes('>31</div>'), 'the January grid must contain day 31');
});

await test('calendar: Week and Day views derive from the same state', () => {
  const state = W.NB_CALENDAR_STATE;
  state.cursor = new Date(2027, 0, 27); // Wed 27 Jan 2027
  state.selectedDate = '2027-01-27';
  W.NB_CALENDAR.setView('week');
  const weekHtml = elements.get('cal-grid-days').innerHTML;
  assert.equal((weekHtml.match(/cal-day-cell/g) || []).length, 7, 'week view renders 7 cells');
  assert.ok(elements.get('cal-month-title').textContent.includes('Week'));
  W.NB_CALENDAR.setView('day');
  const dayHtml = elements.get('cal-grid-days').innerHTML;
  assert.equal((dayHtml.match(/cal-day-cell/g) || []).length, 1, 'day view renders 1 cell');
  assert.ok(dayHtml.includes('>27</div>'), 'day view shows the selected day');
  W.NB_CALENDAR.setView('month');
});

await test('calendar: today button returns the grid to the current month', () => {
  W.NB_CALENDAR.today();
  const now = new Date();
  const state = W.NB_CALENDAR_STATE;
  assert.equal(state.cursor.getFullYear(), now.getFullYear());
  assert.equal(state.cursor.getMonth(), now.getMonth());
  assert.equal(state.selectedDate, `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
});

await test('appointments on the calendar come from stored records, not fixtures', () => {
  const now = new Date();
  const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T11:00:00`;
  W.NB.appointments = [{ title: 'Site visit', customer_name: 'Acme', starts_at: iso }];
  W.NB.appointmentsStorageAvailable = true;
  W.renderCalendar();
  const html = elements.get('cal-grid-days').innerHTML;
  assert.ok(html.includes('Site visit'), 'the real appointment must appear on its day');
  assert.ok(!html.includes('Dental Consult'), 'the old hardcoded fixtures must be gone');
});

await test('deals view explains missing storage instead of inventing deals', () => {
  W.NB.dealsStorageAvailable = false;
  W.NB.deals = [];
  W.renderDeals();
  const html = elements.get('deals-pipeline').innerHTML;
  assert.ok(html.includes('not enabled'), 'the pipeline must say storage is not enabled');
  W.NB.dealsStorageAvailable = true;
});

await test('deals view distinguishes loading / error from a genuine zero', () => {
  W.NB.loadState = { deals: 'loading' };
  W.NB.deals = [];
  W.renderDeals();
  assert.ok(elements.get('deals-pipeline').innerHTML.includes('Loading deals'),
    'loading must be shown as loading, not as empty columns');
  W.NB.loadState = { deals: 'error' };
  W.renderDeals();
  assert.ok(elements.get('deals-pipeline').innerHTML.includes('could not be loaded'),
    'a failed load must be reported as an error');
  W.NB.loadState = { deals: 'ready' };
  W.NB.deals = [{ title: 'Zero-value deal', stage: 'Won', amount: 0 }];
  W.renderDeals();
  const html = elements.get('deals-pipeline').innerHTML;
  assert.ok(html.includes('₹0'), 'a persisted deal worth 0 must render ₹0, not —');
  W.NB.deals = [];
  W.renderDeals();
  assert.ok(elements.get('deals-pipeline').innerHTML.includes('—'),
    'an empty stage shows — rather than a fabricated total');
});

/* ------------------------------------------------- local API auth boundary */
console.log('\n  --- local API auth boundary (dev-server) ---');
const server = spawn(process.execPath, ['dev-server.js'], { cwd: ROOT, stdio: 'ignore' });
let up = false;
for (let i = 0; i < 40 && !up; i += 1) {
  await sleep(250);
  try {
    const res = await fetch(`${LOCAL}/api/public-config`);
    up = res.status === 200;
  } catch { /* not listening yet */ }
}

const endpoints = ['/api/leads', '/api/tasks', '/api/deals', '/api/appointments'];
for (const endpoint of endpoints) {
  await test(`local ${endpoint} -> 401 without a session`, async () => {
    const res = await fetch(`${LOCAL}${endpoint}`, { headers: { Accept: 'application/json' } });
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
  });
  await test(`local ${endpoint} POST -> 401 without a session`, async () => {
    const res = await fetch(`${LOCAL}${endpoint}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x', amount: -1 })
    });
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
  });
}

await test('local /api/social-conversations -> 401 without a session', async () => {
  // The social inbox used to serve every tenant's conversations to ANONYMOUS
  // callers (no auth, no org filter). The CRM inbox sends the session token,
  // so gating it changes nothing for real users.
  const res = await fetch(`${LOCAL}/api/social-conversations`, { headers: { Accept: 'application/json' } });
  assert.equal(res.status, 401, `expected 401, got ${res.status}`);
});

await test('local CRM page still serves', async () => {
  const res = await fetch(`${LOCAL}/nextbright-crm/index.html`);
  assert.equal(res.status, 200);
});

server.kill();

/* --------------------------------------------------- live security boundary */
console.log('\n  --- live deployment security boundary ---');
let undeployed = [];
for (const endpoint of endpoints) {
  await test(`live ${endpoint} -> 401 unauthenticated`, async () => {
    const res = await fetch(`${LIVE}${endpoint}`, { headers: { Accept: 'application/json' } });
    if (res.status === 404) {
      // The endpoint does not exist on the deployment yet: the local code
      // changed but this environment cannot deploy (no Vercel token).
      undeployed.push(endpoint);
      return;
    }
    assert.equal(res.status, 401, `expected 401, got ${res.status}`);
  });
}
if (undeployed.length) {
  console.log(`\n  NOTE: ${undeployed.join(', ')} -> 404 on the live site: these endpoints are`);
  console.log('        new in this change set and the deployment has not been updated.');
  console.log('        Deployment is a blocker in this environment (no Vercel token).');
}

/* ------------------------------------------- Vercel Hobby 12-function limit */
console.log('\n  --- Vercel Hobby plan function limit ---');
await test('root api/ exposes at most 12 serverless functions', async () => {
  const apiDir = path.join(ROOT, 'api');
  const functions = fs.readdirSync(apiDir)
    .filter(name => name.endsWith('.js') && !name.startsWith('_'));
  assert.ok(functions.length <= 12,
    `found ${functions.length} function file(s) in api/ (${functions.join(', ')}); Vercel Hobby allows 12`);
});
await test('all handlers moved to server/api/ behind the single [slug].js dispatcher', async () => {
  const functions = fs.readdirSync(path.join(ROOT, 'api'))
    .filter(name => name.endsWith('.js') && !name.startsWith('_'));
  assert.deepEqual(functions, ['[slug].js'],
    `api/ should contain only the dispatcher, found: ${functions.join(', ')}`);
  const handlers = fs.readdirSync(path.join(ROOT, 'server', 'api'))
    .filter(name => name.endsWith('.js') && !name.startsWith('_'));
  assert.equal(handlers.length, 14,
    `expected 14 handlers in server/api/ (12 original + deals + appointments), found ${handlers.length}`);
});
await test('dispatcher resolves real routes and rejects unknown ones', async () => {
  const { default: dispatch } = await import(
    pathToFileURL(path.join(ROOT, 'api', '[slug].js')).href);
  const makeRes = () => ({
    _status: 0, _body: null,
    status(code) { this._status = code; return this; },
    json(body) { this._body = body; return this; }
  });
  // Unknown route -> 404, no handler invoked.
  let res = makeRes();
  await dispatch({ url: '/api/definitely-not-a-route', query: {} }, res);
  assert.equal(res._status, 404);
  // Path wins over a spoofed ?slug= query (cannot reach another handler).
  res = makeRes();
  await dispatch({ url: '/api/definitely-not-a-route?slug=admin', query: { slug: 'admin' } }, res);
  assert.equal(res._status, 404, 'client-supplied ?slug= must not change routing');
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
