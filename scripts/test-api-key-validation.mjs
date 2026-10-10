// scripts/test-api-key-validation.mjs
// Regression Test Suite for Real Credential Verification & API Key Validation

import assert from 'node:assert/strict';

const SERVER_URL = process.env.TEST_SERVER_URL || 'http://localhost:3001';

async function runTests() {
  console.log('🧪 Starting API Key & Credential Verification Tests...\n');

  // Test 1: Fake Twilio SID/Token rejection
  console.log('Test 1: Reject fake Twilio Account SID/Token...');
  const twRes = await fetch(`${SERVER_URL}/api/integration-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      integration: 'twilio',
      accountSid: 'AC00000000000000000000000000000000',
      authToken: 'fake_auth_token_12345'
    })
  });
  const twData = await twRes.json();
  assert.equal(twRes.status, 401, 'Fake Twilio SID/Token should return HTTP 401 or 403');
  assert.equal(twData.success || false, false, 'Fake credentials must NOT return success: true');
  console.log('✓ Passed: Fake Twilio credentials correctly rejected (HTTP 401)');

  // Test 2: Invalid WhatsApp Phone Number ID rejection
  console.log('\nTest 2: Reject invalid WhatsApp Phone Number ID...');
  const waRes = await fetch(`${SERVER_URL}/api/integration-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      integration: 'whatsapp',
      accessToken: 'EAABfake_token_12345',
      phoneNumberId: 'invalid_phone_id_999'
    })
  });
  const waData = await waRes.json();
  assert.equal(waRes.status, 401, 'Fake WhatsApp token/phone ID should return HTTP 401 or 403');
  assert.equal(waData.success || false, false, 'Fake WhatsApp credentials must NOT return success: true');
  console.log('✓ Passed: Fake WhatsApp credentials correctly rejected');

  // Test 3: Invalid Instagram Business Account ID rejection
  console.log('\nTest 3: Reject invalid Instagram Account ID...');
  const igRes = await fetch(`${SERVER_URL}/api/integration-status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      integration: 'instagram',
      accessToken: 'EAAIfake_token_12345',
      instagramBusinessId: 'invalid_ig_id_888'
    })
  });
  const igData = await igRes.json();
  assert.equal(igRes.status, 401, 'Fake Instagram credentials should return HTTP 401 or 403');
  assert.equal(igData.success || false, false, 'Fake Instagram credentials must NOT return success: true');
  console.log('✓ Passed: Fake Instagram credentials correctly rejected');

  // Test 4: Live Integration Status Endpoint
  console.log('\nTest 4: Verify GET /api/integration-status response structure...');
  const statusRes = await fetch(`${SERVER_URL}/api/integration-status`);
  const statusData = await statusRes.json();
  assert.equal(statusRes.status, 200, 'GET /api/integration-status should return 200 OK');
  assert.ok(statusData.integrations, 'Response should contain integrations object');
  assert.ok(statusData.integrations.whatsapp, 'Integrations should include whatsapp key');
  assert.ok(statusData.integrations.instagram, 'Integrations should include instagram key');
  assert.ok(statusData.integrations.twilio, 'Integrations should include twilio key');
  assert.ok(statusData.integrations.ai, 'Integrations should include ai key');
  console.log('✓ Passed: GET /api/integration-status returns all provider checkers');

  console.log('\n🎉 All API Key Verification Tests Passed Successfully!');
}

runTests().catch(err => {
  console.error('\n❌ Test Suite Failed:', err.message);
  process.exit(1);
});
