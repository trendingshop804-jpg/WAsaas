// scripts/test-whatsapp-token-normalization.mjs
// Unit checks for the access-token hardening:
//   1. Pasted junk (quotes, whitespace, a literal "Bearer " prefix) is stripped
//      at the crypto boundary, so Meta never receives "Bearer Bearer <token>".
//   2. An undecryptable stored value is REPORTED (decryptFailed) instead of
//      being silently forwarded to Meta, where it would surface as a misleading
//      "Invalid or expired access token".
//   3. Source contracts: both server paths surface decryption failures.
//
//   node scripts/test-whatsapp-token-normalization.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');

process.env.INTEGRATION_ENCRYPT_SECRET = 'unit-test-secret-0123456789abcdef0123';
const { normalizeAccessToken, encryptToken, decryptToken, decryptTokenInfo } =
  await import('../server/api/_crypto.js');

let passed = 0;
let failed = 0;
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

console.log('=== normalizeAccessToken ===');

await test('strips a pasted "Bearer " prefix', () => {
  assert.equal(normalizeAccessToken('Bearer EAAabc123'), 'EAAabc123');
  assert.equal(normalizeAccessToken('bearer  EAAabc123'), 'EAAabc123');
});

await test('strips quotes and surrounding whitespace', () => {
  assert.equal(normalizeAccessToken('  "EAAabc123"\n'), 'EAAabc123');
  assert.equal(normalizeAccessToken("'EAAabc123'"), 'EAAabc123');
});

await test('leaves a clean token untouched', () => {
  assert.equal(normalizeAccessToken('EAAabc123'), 'EAAabc123');
  assert.equal(normalizeAccessToken(''), '');
  assert.equal(normalizeAccessToken(undefined), '');
});

console.log('\n=== encrypt / decrypt roundtrip ===');

await test('encrypt stores ciphertext of the cleaned token, decrypt returns it', async () => {
  const stored = await encryptToken('  "Bearer EAAroundtrip1"\t');
  assert.ok(stored && !stored.startsWith('EAA'), 'the stored value must be ciphertext');
  assert.equal(await decryptToken(stored), 'EAAroundtrip1');
});

await test('plaintext Meta tokens pass through with no failure', async () => {
  const info = await decryptTokenInfo('EAAplaintextToken');
  assert.equal(info.token, 'EAAplaintextToken');
  assert.equal(info.decryptFailed, false);
});

await test('decryptTokenInfo flags an undecryptable blob instead of hiding it', async () => {
  const blob = Buffer.from('this-is-not-valid-ciphertext-xxxxxx').toString('base64');
  const info = await decryptTokenInfo(blob);
  assert.equal(info.decryptFailed, true, 'a wrong-key/corrupt value must be reported');
  assert.equal(info.token, blob, 'the raw value is preserved for legacy callers');
});

await test('decryptToken keeps its old contract (returns only the token)', async () => {
  const blob = Buffer.from('this-is-not-valid-ciphertext-xxxxxx').toString('base64');
  assert.equal(typeof (await decryptToken(blob)), 'string');
  assert.equal(await decryptToken(''), '');
});

await test('a value too short to be ciphertext is raw, not a failure', async () => {
  const info = await decryptTokenInfo('abc123');
  assert.equal(info.decryptFailed, false);
  assert.equal(info.token, 'abc123');
});

console.log('\n=== server source contracts ===');

await test('checkWhatsApp reports TOKEN_DECRYPT_FAILED before calling Meta', () => {
  const src = readFileSync(path.join(rootDir, 'server/api/_integration-status.js'), 'utf8');
  assert.ok(src.includes('TOKEN_DECRYPT_FAILED'), 'decrypt failure must have its own code');
  const branchAt = src.indexOf('tenantConfig?.decryptFailed');
  const metaCallAt = src.indexOf('graph.facebook.com');
  assert.ok(branchAt > -1 && metaCallAt > -1 && branchAt < metaCallAt,
    'the decrypt-failure branch must precede the Meta call');
  assert.ok(src.includes('normalizeAccessToken(customConfig.accessToken)'),
    'candidate tokens must be normalised before validation');
});

await test('save paths normalise pasted tokens and refuse undecryptable stored ones', () => {
  const src = readFileSync(path.join(rootDir, 'server/api/integration-status.js'), 'utf8');
  const normaliseCalls = (src.match(/normalizeAccessToken\(/g) || []).length;
  assert.ok(normaliseCalls >= 2, `whatsapp + instagram saves must normalise (got ${normaliseCalls})`);
  const decryptMsgs = (src.match(/could not be decrypted/g) || []).length;
  assert.equal(decryptMsgs, 2, `both save paths must report decrypt failures (got ${decryptMsgs})`);
});

console.log(`\n${failed ? failed + ' test(s) failed.' : passed + ' passed, 0 failed.'}`);
process.exit(failed ? 1 : 0);
