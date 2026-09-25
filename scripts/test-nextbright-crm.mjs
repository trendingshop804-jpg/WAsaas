// scripts/test-nextbright-crm.mjs
// Comprehensive Playwright E2E Test Suite for NextBright CRM

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const scratchDir = path.join(rootDir, 'scratch');

if (!fs.existsSync(scratchDir)) {
  fs.mkdirSync(scratchDir, { recursive: true });
}

async function runTests() {
  console.log('🎭 Launching Playwright E2E Test Suite for NextBright CRM...\n');

  const browser = await chromium.launch({ headless: true });
  let failures = 0;
  let passed = 0;

  const runTest = async (name, fn) => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
      failures++;
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}\n`);
    }
  };

  try {
    // ----------------------------------------------------
    // Desktop Viewport Tests (1280x800)
    // ----------------------------------------------------
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await desktopContext.newPage();

    // Catch page JS console errors
    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err.message));

    const fileUrl = `file:///${path.join(rootDir, 'nextbright-crm', 'index.html').replace(/\\/g, '/')}`;

    await runTest('1. Load NextBright CRM Application Page', async () => {
      await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const title = await page.title();
      assert.ok(title.includes('NextBright CRM'), `Page title contains NextBright CRM (got: "${title}")`);
    });

    await runTest('2. Verify Dashboard Hero & Executive KPI Cards', async () => {
      const heroText = await page.locator('.page-title').first().innerText();
      assert.ok(heroText.includes('Praveenkumar'), `Hero title displays user name (got: "${heroText}")`);

      const kpiCount = await page.locator('.kpi-card').count();
      assert.ok(kpiCount >= 5, `Displays at least 5 KPI cards (found ${kpiCount})`);
    });

    await runTest('3. Verify Sidebar Navigation & View Switching', async () => {
      const navViews = ['leads', 'customers', 'deals', 'calls', 'messages', 'appointments', 'tasks', 'reports', 'settings', 'dashboard'];
      for (const view of navViews) {
        await page.click(`.nav-item[data-view="${view}"]`);
        await page.waitForTimeout(100);
        const activeState = await page.evaluate(v => {
          const panel = document.getElementById('view-' + v);
          const isPanelActive = panel ? panel.classList.contains('active') : false;
          const activePanels = Array.from(document.querySelectorAll('.view-panel.active')).map(p => p.id);
          const visiblePanels = Array.from(document.querySelectorAll('.view-panel')).filter(p => getComputedStyle(p).display !== 'none').map(p => p.id);
          const hashClean = (window.location.hash || '').replace('#', '').replace(/^\//, '').trim();
          return { isPanelActive, activePanels, visiblePanels, hashClean };
        }, view);

        assert.ok(activeState.isPanelActive, `View "${view}" panel is active`);
        assert.deepEqual(activeState.activePanels, [`view-${view}`], `ONLY view-${view} is active (got active panels: ${activeState.activePanels.join(', ')})`);
        assert.deepEqual(activeState.visiblePanels, [`view-${view}`], `ONLY view-${view} is visible (got visible panels: ${activeState.visiblePanels.join(', ')})`);
        assert.equal(activeState.hashClean, view, `Hash matches current view "${view}"`);
      }
    });

    await runTest('3b. Test Direct Hash URL Navigation (#/settings, #/calls, #/messages)', async () => {
      const testHashes = ['settings', 'calls', 'messages', 'leads', 'dashboard'];
      for (const h of testHashes) {
        await page.goto(fileUrl + '#/' + h, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(150);
        const activeState = await page.evaluate(hVal => {
          const panel = document.getElementById('view-' + hVal);
          const isPanelActive = panel ? panel.classList.contains('active') : false;
          const activePanels = Array.from(document.querySelectorAll('.view-panel.active')).map(p => p.id);
          const visiblePanels = Array.from(document.querySelectorAll('.view-panel')).filter(p => getComputedStyle(p).display !== 'none').map(p => p.id);
          const activeNav = document.querySelector('.nav-item.active');
          const navView = activeNav ? activeNav.dataset.view : null;
          return { isPanelActive, activePanels, visiblePanels, navView };
        }, h);

        assert.ok(activeState.isPanelActive, `Direct URL #${h} activates #view-${h}`);
        assert.deepEqual(activeState.activePanels, [`view-${h}`], `ONLY view-${h} is active for #${h}`);
        assert.deepEqual(activeState.visiblePanels, [`view-${h}`], `ONLY view-${h} is visible for #${h}`);
        assert.equal(activeState.navView, h, `Active nav item matches #${h}`);
      }
    });

    await runTest('4. Test Desktop Sidebar Collapse & Expand', async () => {
      const collapseBtn = page.locator('#sidebar-collapse-btn');
      await collapseBtn.click();
      await page.waitForTimeout(200);
      let isCollapsed = await page.evaluate(() => document.getElementById('sidebar').classList.contains('collapsed'));
      assert.ok(isCollapsed, 'Sidebar collapsed on button click');

      await collapseBtn.click();
      await page.waitForTimeout(200);
      isCollapsed = await page.evaluate(() => document.getElementById('sidebar').classList.contains('collapsed'));
      assert.ok(!isCollapsed, 'Sidebar expanded on second button click');
    });

    await runTest('5. Test Quick Add Lead Modal & Data Table Render', async () => {
      await page.click('#quick-add-btn');
      await page.waitForTimeout(200);

      const modalOpen = await page.evaluate(() => document.getElementById('quick-add-modal').classList.contains('open'));
      assert.ok(modalOpen, 'Quick Add Modal opens');

      await page.fill('#qa-name', 'Playwright Test Lead');
      await page.fill('#qa-phone', '+91 99999 00000');
      await page.click('#qa-save');
      await page.waitForTimeout(300);

      // Verify lead appears in table
      await page.click('.nav-item[data-view="leads"]');
      await page.waitForTimeout(200);

      const firstRowName = await page.locator('#leads-table-tbody tr .lead-name-text').first().innerText();
      assert.equal(firstRowName, 'Playwright Test Lead', 'Newly created lead is rendered at top of table');
    });

    await runTest('6. Test Lead Search Filtering', async () => {
      await page.fill('#leads-search', 'Playwright');
      await page.waitForTimeout(200);

      const rowCount = await page.locator('#leads-table-tbody tr').count();
      assert.equal(rowCount, 1, 'Search filters table to matching lead only');

      await page.fill('#leads-search', '');
      await page.waitForTimeout(200);
    });

    await runTest('7. Test Lead Table Actions (Call Simulation & Toast)', async () => {
      await page.waitForTimeout(3500);
      const callBtn = page.locator('#leads-table-tbody tr .row-action-btn[title="Call"]').first();
      await callBtn.click();
      await page.waitForTimeout(200);

      const toastText = await page.locator('.toast').last().innerText();
      assert.ok(toastText.includes('Calling Playwright Test Lead'), `Call toast triggered: "${toastText.trim()}"`);
    });

    await runTest('8. Test Lead Deletion Action', async () => {
      const deleteBtn = page.locator('#leads-table-tbody tr .row-action-btn[title="Delete"]').first();
      await deleteBtn.click();
      await page.waitForTimeout(300);

      const firstRowName = await page.locator('#leads-table-tbody tr .lead-name-text').first().innerText();
      assert.notEqual(firstRowName, 'Playwright Test Lead', 'Deleted lead removed from table');
    });

    await runTest('9. Capture Desktop View Screenshot', async () => {
      await page.click('.nav-item[data-view="dashboard"]');
      await page.waitForTimeout(300);
      const screenshotPath = path.join(scratchDir, 'playwright_crm_desktop.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      assert.ok(fs.existsSync(screenshotPath), 'Desktop screenshot created');
      console.log(`     Saved desktop screenshot to: ${screenshotPath}`);
    });

    await desktopContext.close();

    // ----------------------------------------------------
    // Mobile Viewport Tests (375x812 - iPhone 13)
    // ----------------------------------------------------
    const mobileContext = await browser.newContext({ viewport: { width: 375, height: 812 } });
    const mobilePage = await mobileContext.newPage();

    await runTest('10. Mobile Responsiveness & Sidebar Drawer Toggle', async () => {
      await mobilePage.goto(fileUrl, { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForTimeout(300);

      // Click mobile hamburger menu
      await mobilePage.click('#sidebar-mobile-toggle');
      await mobilePage.waitForTimeout(300);

      const isMobileOpen = await mobilePage.evaluate(() => document.getElementById('sidebar').classList.contains('mobile-open'));
      assert.ok(isMobileOpen, 'Mobile sidebar drawer opens on hamburger button click');

      // Click nav item to switch view & close drawer
      await mobilePage.click('.nav-item[data-view="messages"]');
      await mobilePage.waitForTimeout(300);

      const isClosed = await mobilePage.evaluate(() => !document.getElementById('sidebar').classList.contains('mobile-open'));
      assert.ok(isClosed, 'Mobile sidebar drawer automatically closes after selecting a menu item');
    });

    await runTest('11. Mobile Messages Back Button Navigation', async () => {
      // Select first conversation
      await mobilePage.click('#conv-list .conv-item');
      await mobilePage.waitForTimeout(200);

      const isChatActive = await mobilePage.evaluate(() => document.querySelector('.messages-layout').classList.contains('mobile-chat-active'));
      assert.ok(isChatActive, 'Selecting conversation displays chat panel on mobile');

      // Click Back button
      await mobilePage.click('#btn-back-conv');
      await mobilePage.waitForTimeout(200);

      const isListActive = await mobilePage.evaluate(() => !document.querySelector('.messages-layout').classList.contains('mobile-chat-active'));
      assert.ok(isListActive, 'Clicking back button returns to conversation list on mobile');
    });

    await runTest('12. Capture Mobile View Screenshot', async () => {
      await mobilePage.click('#sidebar-mobile-toggle');
      await mobilePage.waitForTimeout(200);
      const screenshotPath = path.join(scratchDir, 'playwright_crm_mobile.png');
      await mobilePage.screenshot({ path: screenshotPath, fullPage: false });
      assert.ok(fs.existsSync(screenshotPath), 'Mobile screenshot created');
      console.log(`     Saved mobile screenshot to: ${screenshotPath}`);
    });

    await runTest('13. Zero Uncaught Console Errors Check', async () => {
      assert.equal(consoleErrors.length, 0, `No console error exceptions occurred during run (errors: ${consoleErrors.join(', ')})`);
    });

    await mobileContext.close();

  } finally {
    await browser.close();
  }

  console.log('\n==================================================');
  console.log(`  SUMMARY: ${passed} Passed, ${failures} Failed`);
  console.log('==================================================\n');

  if (failures > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal Playwright Error:', err);
  process.exit(1);
});
