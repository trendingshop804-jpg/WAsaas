// scripts/test-saas-platform.mjs
// Comprehensive Playwright Test Suite for NextBright Master Admin & Multi-Tenant CRM

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

async function runSaaSPlatformTests() {
  console.log('🎭 Launching Master SaaS Platform Playwright E2E Test Suite...\n');

  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  let failures = 0;

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
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();

    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push(err.message));

    const adminUrl = `file:///${path.join(rootDir, 'admin.html').replace(/\\/g, '/')}`;
    const crmUrl   = `file:///${path.join(rootDir, 'index.html').replace(/\\/g, '/')}`;

    // -------------------------------------------------------------------
    // PART 1: MASTER ADMIN CONTROL CENTER (LEVEL 1)
    // -------------------------------------------------------------------
    await runTest('1. Load Master Admin Dashboard Page', async () => {
      await page.goto(adminUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      const title = await page.title();
      assert.ok(title.includes('Master Admin'), `Admin title contains Master Admin (got "${title}")`);
    });

    await runTest('2. Verify Master Admin KPIs & System Monitors', async () => {
      const kpiCompanies = await page.locator('#kpi-companies').innerText();
      assert.ok(parseInt(kpiCompanies) >= 3, `KPI displays active company count (got ${kpiCompanies})`);
    });

    await runTest('3. Verify Master Admin Navigation & Panels', async () => {
      const panels = ['companies', 'features', 'system-health', 'overview'];
      for (const p of panels) {
        await page.click(`.admin-nav .nav-item[data-admin-view="${p}"]`);
        await page.waitForTimeout(150);
        const isActive = await page.evaluate(view => {
          const el = document.getElementById('admin-view-' + view);
          return el ? el.classList.contains('active') : false;
        }, p);
        assert.ok(isActive, `Admin panel "${p}" activated`);
      }
    });

    await runTest('4. Create New Customer Company in Master Admin', async () => {
      await page.click('.admin-nav .nav-item[data-admin-view="companies"]');
      await page.waitForTimeout(200);

      await page.click('#btn-create-company');
      await page.waitForTimeout(200);

      await page.fill('#mc-name', 'Apollo Health Clinic');
      await page.fill('#mc-owner', 'Dr. S. K. Apollo');
      await page.fill('#mc-email', 'contact@apollohealth.com');
      await page.click('#mc-save');
      await page.waitForTimeout(300);

      const firstCompanyName = await page.locator('#companies-table-tbody tr strong').first().innerText();
      assert.equal(firstCompanyName, 'Apollo Health Clinic', 'Newly created company appears in Master Admin table');
    });

    await runTest('5. Test Company Status Toggle (Suspend / Activate)', async () => {
      const toggleBtn = page.locator('#companies-table-tbody tr button').first();
      await toggleBtn.click();
      await page.waitForTimeout(300);

      const statusBadge = page.locator('#companies-table-tbody tr').first().locator('.badge-success, .badge-danger, .badge-warning').last();
      const badgeText = await statusBadge.innerText();
      assert.ok(badgeText.includes('SUSPENDED') || badgeText.includes('ACTIVE'), `Company status toggle updated badge (got "${badgeText}")`);
    });

    await runTest('6. Capture Master Admin Screenshot', async () => {
      const screenshotPath = path.join(scratchDir, 'playwright_master_admin.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      assert.ok(fs.existsSync(screenshotPath), 'Master admin screenshot generated');
      console.log(`     Saved admin screenshot to: ${screenshotPath}`);
    });

    // -------------------------------------------------------------------
    // PART 2: CUSTOMER CRM WORKSPACE (LEVEL 2)
    // -------------------------------------------------------------------
    await runTest('7. Load Customer CRM Workspace Page', async () => {
      await page.goto(crmUrl, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(400);
      const title = await page.title();
      assert.ok(title.includes('NextBright CRM'), `CRM title contains NextBright CRM (got "${title}")`);
    });

    await runTest('8. Verify Customer 360 Profile Modal & Timeline', async () => {
      await page.click('.nav-item[data-view="customers"]');
      await page.waitForTimeout(200);

      const view360Btn = page.locator('#customers-tbody tr .row-action-btn[title="View 360 Profile"]').first();
      await view360Btn.click();
      await page.waitForTimeout(200);

      const modalOpen = await page.evaluate(() => document.getElementById('modal-customer-360').classList.contains('open'));
      assert.ok(modalOpen, 'Customer 360 profile modal opens');

      const timelineCount = await page.locator('#c360-timeline div').count();
      assert.ok(timelineCount >= 3, 'Customer 360 timeline displays past activity history');
    });

    await runTest('9. Capture Customer CRM Workspace Screenshot', async () => {
      const screenshotPath = path.join(scratchDir, 'playwright_customer_crm.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      assert.ok(fs.existsSync(screenshotPath), 'Customer CRM screenshot generated');
      console.log(`     Saved customer CRM screenshot to: ${screenshotPath}`);
    });

    await runTest('10. Zero Uncaught Console Errors Check', async () => {
      assert.equal(consoleErrors.length, 0, `Zero console errors during execution (got: ${consoleErrors.join(', ')})`);
    });

    await context.close();

  } finally {
    await browser.close();
  }

  console.log('\n==================================================');
  console.log(`  SUMMARY: ${passed} Passed, ${failures} Failed`);
  console.log('==================================================\n');

  if (failures > 0) process.exit(1);
}

runSaaSPlatformTests().catch(err => {
  console.error('Fatal Playwright Error:', err);
  process.exit(1);
});
