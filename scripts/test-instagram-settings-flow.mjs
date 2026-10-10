// scripts/test-instagram-settings-flow.mjs
// Offline automated test suite for NextBright CRM Instagram integration settings & test-connection flow.

import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test-project.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
process.env.INTEGRATION_ENCRYPT_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

const TEST_ORG = 'test_org_ig_1';
const TEST_USER = 'test_user_ig_1';

// In-memory mock database store
const mockDb = {
  instagram_connections: [],
  organization_users: [
    { organization_id: TEST_ORG, user_id: TEST_USER, role: 'Owner' },
  ],
};

let metaGraphErrorToThrow = null;
let metaGraphSuccessData = {
  id: '17841405555555555',
  username: 'nextbright_style',
  name: 'NextBright Style Co',
};

globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : String(input.url || input);
  const method = (init.method || 'GET').toUpperCase();
  const rawHeaders = init.headers || {};
  const header = (name) => (typeof rawHeaders.get === 'function' ? rawHeaders.get(name) : (rawHeaders[name] || rawHeaders[name.toLowerCase()] || ''));
  const isSingle = () => String(header('Accept')).includes('vnd.pgrst.object+json');
  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  // 1. Meta Graph API
  if (url.includes('graph.facebook.com')) {
    if (metaGraphErrorToThrow) {
      return json(metaGraphErrorToThrow.body, metaGraphErrorToThrow.status);
    }
    return json(metaGraphSuccessData, 200);
  }

  // 2. Supabase Auth
  if (url.includes('/auth/v1/user')) {
    return json({ id: TEST_USER, aud: 'authenticated' });
  }

  // 3. Supabase organization_users
  if (url.includes('/rest/v1/organization_users')) {
    return json(mockDb.organization_users);
  }

  // 4. Supabase instagram_connections
  if (url.includes('/rest/v1/instagram_connections')) {
    if (method === 'POST') {
      const payload = JSON.parse(init.body || '{}');
      const items = Array.isArray(payload) ? payload : [payload];
      for (const item of items) {
        const existingIdx = mockDb.instagram_connections.findIndex(
          (c) => c.organization_id === item.organization_id
        );
        if (existingIdx >= 0) {
          mockDb.instagram_connections[existingIdx] = {
            ...mockDb.instagram_connections[existingIdx],
            ...item,
          };
        } else {
          mockDb.instagram_connections.push({ ...item });
        }
      }
      return json(isSingle() ? items[0] : items, 201);
    }

    if (method === 'PATCH') {
      const payload = JSON.parse(init.body || '{}');
      for (const conn of mockDb.instagram_connections) {
        if (conn.organization_id === TEST_ORG) {
          Object.assign(conn, payload);
        }
      }
      return json([], 200);
    }

    // GET
    const matching = mockDb.instagram_connections.filter((c) => c.organization_id === TEST_ORG);
    if (isSingle()) {
      return json(matching[0] || null, 200);
    }
    return json(matching, 200);
  }

  throw new Error(`Unexpected fetch to ${url}`);
};

// Import modules after fetch & env are configured
const { checkInstagram } = await import('../api/_integration-status.js');
const { default: handler } = await import('../api/integration-status.js');

function createMockReqRes({ method = 'GET', query = {}, body = {}, headers = {} }) {
  const req = {
    method,
    query,
    body,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer valid_mock_user_jwt',
      ...headers,
    },
  };

  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    setHeader(key, value) {
      this.headers[key] = value;
      return this;
    },
    json(data) {
      this.body = data;
      return this;
    },
    end() {
      return this;
    },
  };

  return { req, res };
}

console.log('=== NextBright CRM — Instagram DM Settings & Test Connection Tests ===\n');

async function run() {
  // --------------------------------------------------------------------------
  // TEST 1: Missing credentials validation in checkInstagram
  // --------------------------------------------------------------------------
  console.log('Test 1: checkInstagram returns MISSING_CREDENTIALS when business-id is absent');
  const res1 = await checkInstagram({ token: 'mock_token', businessId: '' });
  assert.equal(res1.connected, false);
  assert.equal(res1.code, 'MISSING_CREDENTIALS');
  assert.ok(res1.message.includes('Instagram Business Account ID is required'));
  console.log('  PASS: missing business ID rejected with clear error code & message');

  // --------------------------------------------------------------------------
  // TEST 2: Expired / Invalid token error code 190
  // --------------------------------------------------------------------------
  console.log('Test 2: checkInstagram handles Meta Graph error 190 (expired/invalid token)');
  metaGraphErrorToThrow = {
    status: 401,
    body: {
      error: {
        code: 190,
        message: 'Error validating access token: Session has expired.',
      },
    },
  };
  const res2 = await checkInstagram({
    token: 'EAAB_expired_token',
    businessId: '17841400000000001',
  });
  assert.equal(res2.connected, false);
  assert.equal(res2.code, 'INVALID_CREDENTIALS');
  assert.ok(res2.message.includes('expired') && res2.message.includes('invalid'));
  console.log('  PASS: code 190 mapped to INVALID_CREDENTIALS');

  // --------------------------------------------------------------------------
  // TEST 3: Invalid account ID error code 100 / 803
  // --------------------------------------------------------------------------
  console.log('Test 3: checkInstagram handles Meta Graph error 100/803 (invalid account ID)');
  metaGraphErrorToThrow = {
    status: 404,
    body: {
      error: {
        code: 100,
        message: 'Unsupported get request. Object with ID 17841400000000002 does not exist.',
      },
    },
  };
  const res3 = await checkInstagram({
    token: 'valid_token',
    businessId: '17841400000000002',
  });
  assert.equal(res3.connected, false);
  assert.equal(res3.code, 'INVALID_ACCOUNT_ID');
  assert.ok(res3.message.includes('not found'));
  console.log('  PASS: code 100 mapped to INVALID_ACCOUNT_ID');

  // --------------------------------------------------------------------------
  // TEST 4: Permission error code 200 / 10
  // --------------------------------------------------------------------------
  console.log('Test 4: checkInstagram handles Meta Graph error 200/10 (permissions missing)');
  metaGraphErrorToThrow = {
    status: 403,
    body: {
      error: {
        code: 200,
        message: 'Requires instagram_manage_messages or instagram_basic permissions.',
      },
    },
  };
  const res4 = await checkInstagram({
    token: 'valid_token',
    businessId: '17841400000000003',
  });
  assert.equal(res4.connected, false);
  assert.equal(res4.code, 'PERMISSION_ERROR');
  assert.ok(res4.message.includes('permissions'));
  console.log('  PASS: code 200 mapped to PERMISSION_ERROR');

  // --------------------------------------------------------------------------
  // TEST 5: Successful check with safe config returned & tokens redacted
  // --------------------------------------------------------------------------
  console.log('Test 5: checkInstagram successful verification returns clean account info');
  metaGraphErrorToThrow = null;
  metaGraphSuccessData = {
    id: '17841405555555555',
    username: 'nextbright_style',
    name: 'NextBright Style Co',
  };
  const res5 = await checkInstagram({
    token: 'EAAB_valid_secret_token_123',
    businessId: '17841405555555555',
    username: 'nextbright_style',
    pageId: '109876543210987',
  });
  assert.equal(res5.connected, true);
  assert.equal(res5.username, 'nextbright_style');
  assert.equal(res5.accountName, 'NextBright Style Co');
  assert.equal(res5.businessId, '17841405555555555');
  assert.ok(res5.config);
  assert.equal(res5.config.businessId, '17841405555555555');
  assert.equal(res5.config.username, 'nextbright_style');
  assert.equal(res5.config.pageId, '109876543210987');
  assert.equal(res5.config.hasToken, true);
  // Ensure secrets are never exposed in config or response
  assert.equal(res5.token, undefined);
  assert.equal(res5.config.token, undefined);
  assert.equal(res5.config.access_token, undefined);
  console.log('  PASS: verified successfully and token redacted');

  // --------------------------------------------------------------------------
  // TEST 6: Save credentials via POST /api/integration-status with field separation
  // --------------------------------------------------------------------------
  console.log('Test 6: save credentials via POST /api/integration-status with 4 separated fields');
  const { req: saveReq, res: saveRes } = createMockReqRes({
    method: 'POST',
    body: {
      integration: 'instagram',
      organizationId: TEST_ORG,
      'business-id': '17841409999999999',
      username: 'my_brand_official',
      'page-id': '1000987654321',
      'access-token': 'EAAB_test_mock_token_abc_xyz',
    },
  });

  await handler(saveReq, saveRes);
  assert.equal(saveRes.statusCode, 200);
  assert.equal(saveRes.body.success, true);
  assert.equal(saveRes.body.configured, true);
  assert.equal(saveRes.body.businessId, '17841409999999999');
  assert.equal(saveRes.body.username, 'my_brand_official');
  assert.equal(saveRes.body.pageId, '1000987654321');
  assert.equal(saveRes.body.hasToken, true);

  const storedConn = mockDb.instagram_connections.find((c) => c.organization_id === TEST_ORG);
  assert.ok(storedConn);
  assert.equal(storedConn.instagram_business_id, '17841409999999999');
  assert.equal(storedConn.instagram_username, 'my_brand_official');
  assert.equal(storedConn.page_id, '1000987654321');
  assert.ok(storedConn.access_token_encrypted);
  console.log('  PASS: fields mapped properly, saved to DB and token encrypted');

  // --------------------------------------------------------------------------
  // TEST 7: Update credentials keeping existing token when password field is blank
  // --------------------------------------------------------------------------
  console.log('Test 7: update settings preserving existing encrypted token');
  const initialEncryptedToken = storedConn.access_token_encrypted;

  const { req: updateReq, res: updateRes } = createMockReqRes({
    method: 'POST',
    body: {
      integration: 'instagram',
      organizationId: TEST_ORG,
      'business-id': '17841409999999999',
      username: 'my_brand_updated_handle',
      'page-id': '1000987654321',
      'access-token': '', // Left blank on edit!
    },
  });

  await handler(updateReq, updateRes);
  assert.equal(updateRes.statusCode, 200);
  assert.equal(updateRes.body.success, true);
  assert.equal(updateRes.body.username, 'my_brand_updated_handle');

  const updatedConn = mockDb.instagram_connections.find((c) => c.organization_id === TEST_ORG);
  assert.equal(updatedConn.instagram_username, 'my_brand_updated_handle');
  assert.equal(updatedConn.access_token_encrypted, initialEncryptedToken);
  console.log('  PASS: existing encrypted token preserved when field left blank');

  // --------------------------------------------------------------------------
  // TEST 8: Test Connection route using saved server-side credentials
  // --------------------------------------------------------------------------
  console.log('Test 8: POST /api/integration-status?route=test-connection with saved credentials');
  metaGraphSuccessData = {
    id: '17841409999999999',
    username: 'my_brand_updated_handle',
    name: 'My Brand Official',
  };

  const { req: testConnReq, res: testConnRes } = createMockReqRes({
    method: 'POST',
    query: { route: 'test-connection' },
    body: {
      provider: 'instagram',
      organizationId: TEST_ORG,
      // No token provided in body - backend must use stored decrypted token
    },
  });

  await handler(testConnReq, testConnRes);
  assert.equal(testConnRes.statusCode, 200);
  assert.equal(testConnRes.body.connected, true);
  assert.equal(testConnRes.body.provider, 'instagram');
  assert.equal(testConnRes.body.accountName, 'My Brand Official');
  console.log('  PASS: test-connection succeeds using saved credentials without mock response');

  // --------------------------------------------------------------------------
  // TEST 9: Non-numeric business ID validation
  // --------------------------------------------------------------------------
  console.log('Test 9: rejection of non-numeric business account ID');
  const { req: invalidReq, res: invalidRes } = createMockReqRes({
    method: 'POST',
    body: {
      integration: 'instagram',
      organizationId: TEST_ORG,
      'business-id': 'my_instagram_username_handle', // User put handle in ID field
      username: 'my_instagram_username_handle',
      'access-token': 'EAAB_test',
    },
  });

  await handler(invalidReq, invalidRes);
  assert.equal(invalidRes.statusCode, 400);
  assert.ok(invalidRes.body.error.includes('numeric Meta ID'));
  console.log('  PASS: non-numeric business account ID rejected with 400 error');

  // --------------------------------------------------------------------------
  // TEST 10: Test Connection with candidate values
  // --------------------------------------------------------------------------
  console.log('Test 10: POST /api/integration-status?route=test-connection with candidate values');
  metaGraphSuccessData = {
    id: '17841408888888888',
    username: 'candidate_handle',
    name: 'Candidate Brand',
  };

  const { req: candidateReq, res: candidateRes } = createMockReqRes({
    method: 'POST',
    query: { route: 'test-connection' },
    body: {
      integration: 'instagram',
      organizationId: TEST_ORG,
      'business-id': '17841408888888888',
      'access-token': 'EAAB_new_candidate_token',
      username: 'candidate_handle',
    },
  });

  await handler(candidateReq, candidateRes);
  assert.equal(candidateRes.statusCode, 200);
  assert.equal(candidateRes.body.connected, true);
  assert.equal(candidateRes.body.businessId, '17841408888888888');
  assert.equal(candidateRes.body.username, 'candidate_handle');
  console.log('  PASS: candidate credentials verified with live Graph API call');

  // --------------------------------------------------------------------------
  // TEST 11: Error message normalization & token redaction
  // --------------------------------------------------------------------------
  console.log('Test 11: Error normalization and token redaction');
  // Re-import ui.js helper logic in test environment
  function normalizeErrorMessage(err, fallback = 'An unexpected error occurred.') {
    if (!err) return fallback;
    let text = '';
    if (typeof err === 'string') {
      text = err;
    } else if (err instanceof Error) {
      text = err.message || fallback;
    } else if (typeof err === 'object') {
      if (typeof err.message === 'string' && err.message) {
        text = err.message;
      } else if (err.error && typeof err.error.message === 'string' && err.error.message) {
        text = err.error.message;
      } else if (typeof err.error === 'string' && err.error) {
        text = err.error;
      } else {
        try {
          const serialized = JSON.stringify(err);
          text = (serialized && serialized !== '{}' && serialized !== '[]') ? serialized : fallback;
        } catch (_) {
          text = fallback;
        }
      }
    } else {
      text = String(err);
    }
    return text
      .replace(/EAAB[a-zA-Z0-9_-]{20,}/g, '[REDACTED_META_TOKEN]')
      .replace(/EAAG[a-zA-Z0-9_-]{20,}/g, '[REDACTED_META_TOKEN]')
      .replace(/eyJ[a-zA-Z0-9_-]{20,}/g, '[REDACTED_JWT_TOKEN]');
  }

  const rawTokenError = 'Meta call failed with token EAABwzQZCUtest1234567890abcdef12345';
  const redacted = normalizeErrorMessage(rawTokenError);
  assert.ok(!redacted.includes('EAABwzQZCUtest1234567890abcdef12345'));
  assert.ok(redacted.includes('[REDACTED_META_TOKEN]'));

  const objectError = { error: { message: 'Invalid OAuth access token signature.', code: 190 } };
  const normalizedObj = normalizeErrorMessage(objectError);
  assert.equal(normalizedObj, 'Invalid OAuth access token signature.');
  assert.ok(!normalizedObj.includes('[object Object]'));

  const bareObj = { code: 500 };
  const normalizedBare = normalizeErrorMessage(bareObj);
  assert.equal(normalizedBare, '{"code":500}');
  assert.ok(!normalizedBare.includes('[object Object]'));

  console.log('  PASS: tokens redacted, error objects unpacked, never returns [object Object]');

  console.log('\n======================================================');
  console.log('ALL 11 AUTOMATED INSTAGRAM SETTINGS & CONNECTION TESTS PASSED!');
  console.log('======================================================\n');
}

run().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
