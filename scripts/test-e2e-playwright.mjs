// scripts/test-e2e-playwright.mjs
// Automated E2E test using Playwright for the NextBright CRM on http://localhost:3000

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { spawn } from 'node:child_process';

async function getAvailableBaseUrl() {
  for (const port of [3001, 3000]) {
    try {
      const res = await fetch(`http://localhost:${port}/nextbright-crm/index.html`);
      if (res.status === 200) return { url: `http://localhost:${port}`, proc: null };
    } catch (_) {}
  }
  // Start dev server on 3001
  const proc = spawn('node', ['dev-server.js'], { stdio: 'ignore' });
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:3001/nextbright-crm/index.html');
      if (res.status === 200) return { url: 'http://localhost:3001', proc };
    } catch (_) {}
  }
  return { url: 'http://localhost:3001', proc };
}

async function runE2ETests() {
  console.log('🎭 Starting Playwright End-to-End UI Test Suite...\n');

  const { url: baseUrl, proc: serverProc } = await getAvailableBaseUrl();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  let failures = 0;
  const test = async (name, fn) => {
    try {
      await fn();
      console.log(`  PASS  ${name}`);
    } catch (err) {
      failures++;
      console.error(`  FAIL  ${name}\n        ${err.message}`);
    }
  };

  try {
    // 1. Load Localhost App
    await test(`Load application home on ${baseUrl}`, async () => {
      const response = await page.goto(`${baseUrl}/nextbright-crm/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, 'Page loads with 200 OK');
      const title = await page.title();
      assert.ok(title.length > 0, 'Page has a title');
    });

    // 2. Check CRM navigation and Leads view
    await test('Navigate to Leads view', async () => {
      await page.evaluate(() => window.navigateTo('leads'));
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.view-panel.active').getAttribute('id'), 'view-leads');
      assert.ok((await page.locator('#leads-full-table').count()) > 0, 'Leads table is present');
    });

    // 3. Check Deals pipeline view
    await test('Navigate to Deals view', async () => {
      await page.evaluate(() => window.navigateTo('deals'));
      await page.waitForTimeout(200);
      assert.equal(await page.locator('.view-panel.active').getAttribute('id'), 'view-deals');
      assert.ok((await page.locator('#deals-pipeline .pipeline-col').count()) > 0, 'Deals pipeline columns are present');
    });

    // 4. Check redesigned dashboard
    await test('Navigate to Dashboard view and check greeting', async () => {
      await page.evaluate(() => window.navigateTo('dashboard'));
      await page.waitForTimeout(200);
      const dashHeader = page.locator('#view-dashboard .page-title');
      const text = await dashHeader.innerText();
      assert.ok(text.includes('Good Morning'), `Dashboard greeting matches: "${text}"`);
      assert.ok((await page.locator('#view-dashboard .kpi-card').count()) >= 5, 'Dashboard KPI cards are present');
    });

    // 5. Capture E2E Screenshot
    await test('Take E2E Playwright Screenshot', async () => {
      const scratchDir = path.join(process.cwd(), 'scratch');
      if (!fs.existsSync(scratchDir)) fs.mkdirSync(scratchDir, { recursive: true });

      const screenshotPath = path.join(scratchDir, 'playwright_e2e_verified.png');
      await page.screenshot({ path: screenshotPath, fullPage: false });
      assert.ok(fs.existsSync(screenshotPath), `Screenshot created at ${screenshotPath}`);
      console.log(`        Screenshot saved to: ${screenshotPath}`);
    });

  } finally {
    await browser.close();
    if (serverProc) {
      try { serverProc.kill(); } catch (_) {}
    }
  }

  console.log(failures === 0 ? '\n✨ All Playwright E2E UI tests passed successfully!' : `\n❌ ${failures} E2E test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

runE2ETests().catch(err => {
  console.error('Fatal Playwright runner error:', err);
  process.exit(1);
});
