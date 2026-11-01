import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const source = fs.readFileSync('nextbright-crm/js/auth.js', 'utf8');
const storage = new Map();
const localStorage = {
  getItem: key => storage.get(key) || null,
  setItem: (key, value) => storage.set(key, value)
};
async function openTab(userId) {
  let callback, reads = 0, options;
  const window = { localStorage, supabase: { createClient(url, key, config) {
    options = config;
    return { auth: {
      onAuthStateChange(fn) { callback = fn; },
      async getSession() {
        reads++;
        return { data: { session: JSON.parse(localStorage.getItem('saved-session')) } };
      }
    } };
  } } };
  vm.runInNewContext(source, {
    window, console, setTimeout,
    document: { addEventListener() {}, body: null },
    fetch: async () => ({ ok: true, json: async () => ({ projectUrl: 'https://example.supabase.co', anonKey: 'public' }) })
  });
  const auth = window.NB_AUTH;
  const [first, second] = await Promise.all([auth.requireSession(), auth.requireSession()]);
  assert.equal(first.user.id, userId);
  assert.equal(second.user.id, userId);
  assert.equal(reads, 1, 'concurrent startup gates share a single session read');
  assert.equal(options.auth.storage, localStorage);
  const seen = [];
  auth.onAuthChange((session, user) => { seen.push(user?.id); });
  callback('SIGNED_OUT', null);
  callback('SIGNED_IN', { access_token: 'new-token', user: { id: 'account-b' } });
  assert.deepEqual(seen, [], 'subscribers run outside the SDK auth callback');
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.deepEqual(seen, ['account-b'], 'superseded account events cannot reset the new workspace');
}
for (const id of ['account-a', 'account-b']) {
  localStorage.setItem('saved-session', JSON.stringify({ access_token: 'saved-token', user: { id } }));
  await openTab(id);
  await openTab(id); // A fresh JS context represents reopening the tab.
}
console.log('PASS: both accounts restore after reopening, shared startup, stale auth events discarded');
