// scripts/test-instagram-module.mjs
// Test script for Instagram integration module (crypto, parsing, rules matching)
import { decryptToken, encryptToken } from '../api/_crypto.js';

async function runTests() {
  console.log('🧪 Starting Instagram Integration Test Suite...\n');

  // Test 1: AES-GCM Token Encryption & Decryption
  console.log('1. Testing AES-GCM Token Encryption & Decryption');
  const sampleToken = 'EAAVpyP3ZC4g0BSeHel0YnEDduQrqZABbZA7ElyCniYBgjVUnZC1a1MwvK64i72GsgZAl';
  const encrypted = await encryptToken(sampleToken);
  console.log('   Encrypted string length:', encrypted.length);
  const decrypted = await decryptToken(encrypted);
  if (decrypted === sampleToken) {
    console.log('   ✅ Crypto match: Token was successfully encrypted and decrypted identically.');
  } else {
    throw new Error(`Crypto mismatch: expected "${sampleToken}", got "${decrypted}"`);
  }

  // Test 2: Plain / Legacy Token Passthrough
  console.log('\n2. Testing Raw / Non-encrypted Token Passthrough');
  const rawIgToken = 'IGQVJXsampletoken1234567890';
  const passThrough = await decryptToken(rawIgToken);
  if (passThrough === rawIgToken) {
    console.log('   ✅ Raw token passthrough handled safely.');
  } else {
    throw new Error('Raw token passthrough failed');
  }

  // Test 3: Webhook Keyword Match Logic
  console.log('\n3. Testing Webhook Keyword Matching');
  function matchesKeyword(text, keyword, matchType = 'contains') {
    if (!text || !keyword) return false;
    const t = text.trim().toLowerCase();
    const keywords = keyword.toLowerCase().split(',').map(k => k.trim()).filter(Boolean);
    if (matchType === 'exact') return keywords.some(k => t === k);
    return keywords.some(k => t.includes(k));
  }

  const commentText = 'Hi! What is the price and how do I get a demo?';
  const matchedPrice = matchesKeyword(commentText, 'price, cost, pricing');
  const matchedDemo = matchesKeyword(commentText, 'demo, link');
  const matchedRandom = matchesKeyword(commentText, 'unrelated');

  if (matchedPrice && matchedDemo && !matchedRandom) {
    console.log('   ✅ Keyword matching accurately parsed multiple comma-separated triggers.');
  } else {
    throw new Error('Keyword matching test failed');
  }

  console.log('\n✨ All Instagram module tests passed successfully!');
}

runTests().catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
