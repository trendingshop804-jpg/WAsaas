// scripts/test-e2e-playwright.mjs
// Automated E2E test using Playwright for NexusLead AI application on http://localhost:3000

import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

async function runE2ETests() {
  console.log('🎭 Starting Playwright End-to-End UI Test Suite...\n');

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
    await test('Load application home on http://localhost:3000', async () => {
      const response = await page.goto('http://localhost:3000', { waitUntil: 'domcontentloaded' });
      assert.equal(response.status(), 200, 'Page loads with 200 OK');
      const title = await page.title();
      assert.ok(title.length > 0, 'Page has a title');
    });

    // 2. Check Settings View & Delete Fake Data Button DOM Presence
    await test('Verify "Delete Fake Data" button in Settings DOM', async () => {
      await page.evaluate(() => {
        if (window.navigationComponent) window.navigationComponent.switchView('settings');
      });
      await page.waitForTimeout(300);

      const clearFakeBtn = page.locator('#clear-fake-data-btn');
      const count = await clearFakeBtn.count();
      assert.ok(count > 0, '"#clear-fake-data-btn" element exists in DOM');

      const btnText = await clearFakeBtn.innerText();
      assert.ok(btnText.includes('Delete Fake Data'), `Button text matches: "${btnText.trim()}"`);
    });

    // 3. Check Instagram Growth & Automation Hub View
    await test('Navigate to Instagram view & verify Instagram Hub UI', async () => {
      await page.evaluate(() => {
        if (window.navigationComponent) window.navigationComponent.switchView('instagram');
      });
      await page.waitForTimeout(300);

      const igHeader = page.locator('#view-instagram h2');
      const text = await igHeader.innerText();
      assert.ok(text.includes('Instagram Growth & Automation Hub'), `Instagram Hub header matches: "${text}"`);
    });

    // 4. Check Executive Revenue Dashboard
    await test('Navigate to Dashboard view & check executive stats', async () => {
      await page.evaluate(() => {
        if (window.navigationComponent) window.navigationComponent.switchView('dashboard');
      });
      await page.waitForTimeout(300);

      const dashHeader = page.locator('#view-dashboard h2');
      const text = await dashHeader.innerText();
      assert.ok(text.includes('Executive Revenue & Sales Dashboard'), `Dashboard header matches: "${text}"`);
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
  }

  console.log(failures === 0 ? '\n✨ All Playwright E2E UI tests passed successfully!' : `\n❌ ${failures} E2E test(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
}

runE2ETests().catch(err => {
  console.error('Fatal Playwright runner error:', err);
  process.exit(1);
});
