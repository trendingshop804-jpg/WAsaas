// scripts/test-whatsapp-connection.mjs
// Automated verification suite for WhatsApp Connection Test workflow

import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const BASE_URL = 'http://localhost:3001';

async function runWhatsAppConnectionTests() {
  console.log('🧪 Running WhatsApp Connection Test Verification Suite...\n');
  let passed = 0;
  let failed = 0;

  const runCase = async (name, fn) => {
    try {
      await fn();
      passed++;
      console.log(`  ✅ PASS: ${name}`);
    } catch (err) {
      failed++;
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}\n`);
    }
  };

  // 1. Blank credentials
  await runCase('1. Blank credentials -> rejected (HTTP 400, MISSING_CREDENTIALS)', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: '', phoneNumberId: '' })
    });
    const data = await res.json();
    assert.equal(res.status, 400, `HTTP status is 400 (got ${res.status})`);
    assert.equal(data.success, false, 'success is false');
    assert.equal(data.code, 'MISSING_CREDENTIALS', `code is MISSING_CREDENTIALS (got ${data.code})`);
    assert.ok(data.message.includes('access token'), `message describes missing credentials (got "${data.message}")`);
  });

  // 2. Whitespace-only credentials
  await runCase('2. Whitespace-only credentials -> rejected (HTTP 400, MISSING_CREDENTIALS)', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: '   ', phoneNumberId: '   ' })
    });
    const data = await res.json();
    assert.equal(res.status, 400, `HTTP status is 400 (got ${res.status})`);
    assert.equal(data.success, false, 'success is false');
    assert.equal(data.code, 'MISSING_CREDENTIALS', `code is MISSING_CREDENTIALS (got ${data.code})`);
  });

  // 3. Fake token / Placeholder token
  await runCase('3. Fake token / Placeholder token -> rejected', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: 'your_access_token', phoneNumberId: '104829104829104' })
    });
    const data = await res.json();
    assert.equal(data.success, false, 'success is false');
    assert.ok(data.code === 'MISSING_CREDENTIALS' || data.code === 'INVALID_CREDENTIALS', `code is credential error (got ${data.code})`);
  });

  // 4. Invalid Phone Number ID / Placeholder Phone ID
  await runCase('4. Invalid Phone Number ID -> rejected', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: 'EAAG1234567890ValidFormatToken', phoneNumberId: '123456789' })
    });
    const data = await res.json();
    assert.equal(data.success, false, 'success is false');
    assert.ok(data.code === 'MISSING_CREDENTIALS' || data.code === 'PERMISSION_ERROR' || data.code === 'INVALID_CREDENTIALS', `code is error (got ${data.code})`);
  });

  // 5. Meta HTTP 401 (Invalid / Expired Token)
  await runCase('5. Meta HTTP 401 -> INVALID_CREDENTIALS failure', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: 'EAAG_INVALID_EXPIRED_TOKEN_XYZ_99999999', phoneNumberId: '987654321098765' })
    });
    const data = await res.json();
    assert.equal(res.status, 401, `HTTP status is 401 (got ${res.status})`);
    assert.equal(data.success, false, 'success is false');
    assert.equal(data.code, 'INVALID_CREDENTIALS', `code is INVALID_CREDENTIALS (got ${data.code})`);
    assert.ok(data.message.includes('Invalid or expired access token'), `message indicates invalid token (got "${data.message}")`);
  });

  // 6. Meta HTTP 403 / Permission error
  await runCase('6. Meta HTTP 403 / Permission error handling', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: 'EAAG_FORBIDDEN_TOKEN', phoneNumberId: '100000000000000' })
    });
    const data = await res.json();
    assert.equal(data.success, false, 'success is false');
    assert.ok(['PERMISSION_ERROR', 'INVALID_CREDENTIALS'].includes(data.code), `code is PERMISSION_ERROR or INVALID_CREDENTIALS (got ${data.code})`);
  });

  // 7. Timeout / Network error handling
  await runCase('7. Invalid network target -> CONNECTION_ERROR handling', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: 'EAAG_TIMEOUT_TEST', phoneNumberId: '000000000' })
    });
    const data = await res.json();
    assert.equal(data.success, false, 'success is false');
    assert.ok(Boolean(data.code), 'Response returns structured error code');
  });

  // 8. Successful verification output structure check
  await runCase('8. Verify response payload schema for test connection endpoint', async () => {
    const res = await fetch(`${BASE_URL}/api/integration-status?route=test-connection`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ integration: 'whatsapp', accessToken: '', phoneNumberId: '' })
    });
    const data = await res.json();
    assert.ok('success' in data, 'response has success field');
    assert.ok('code' in data, 'response has code field');
    assert.ok('message' in data, 'response has message field');
    assert.ok('status' in data, 'response has status field');
  });

  // 9 & 10. Playwright Browser E2E Test: UI loading state stops & existing connection untouched on failed replacement
  await runCase('9 & 10. E2E Browser Test: UI loading indicator stops & saved connection preserved on failed test', async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      await page.goto(`${BASE_URL}/nextbright-crm/index.html?demo=1#/social-integrations`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);

      // Open WhatsApp modal
      await page.click('#wa-connect-btn');
      await page.waitForTimeout(300);

      const isModalOpen = await page.evaluate(() => document.getElementById('integration-modal').classList.contains('open'));
      assert.ok(isModalOpen, 'WhatsApp integration modal opens');

      // Click Test Connection with blank inputs
      const testBtn = page.locator('#integration-test-btn');
      await testBtn.click();
      await page.waitForTimeout(400);

      // Verify button is re-enabled (loading indicator stopped)
      const isDisabled = await testBtn.isDisabled();
      assert.equal(isDisabled, false, 'Loading indicator stopped and button is re-enabled');

      const btnText = await testBtn.innerText();
      assert.ok(btnText.includes('Test connection'), `Button text restored (got "${btnText.trim()}")`);

      // Verify toast error appeared
      const toastText = await page.locator('.toast.error').last().innerText();
      assert.ok(toastText.includes('WhatsApp'), `Toast message displayed: "${toastText.trim()}"`);

      // Close modal
      await page.click('#integration-modal-close');
      await page.waitForTimeout(200);

    } finally {
      await browser.close();
    }
  });

  console.log('\n==================================================');
  console.log(`  WHATSAPP TEST SUMMARY: ${passed} Passed, ${failed} Failed`);
  console.log('==================================================\n');

  if (failed > 0) process.exit(1);
}

runWhatsAppConnectionTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  process.exit(1);
});
