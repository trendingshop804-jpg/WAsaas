import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

async function scenario({ existing = false, forbidden = false } = {}) {
  let listener, created = 0, reloads = 0;
  let provisioned = existing;
  const errors = [];
  const storage = new Map();
  const localStorage = {
    getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value),
    removeItem: key => storage.delete(key)
  };
  const user = { id: 'customer-1', email: 'customer@example.com' };
  const window = {
    NB: {}, location: { reload() { reloads++; } },
    showToast: message => errors.push(message),
    NB_AUTH: {
      onAuthChange(fn) { listener = fn; },
      async apiFetch(path) {
        if (forbidden) return { ok: false, status: 403, json: async () => ({ error: 'Access denied' }) };
        if (path === '/api/onboarding') {
          created++; provisioned = true;
          return { ok: true, status: 201, json: async () => ({ success: true }) };
        }
        return { ok: true, status: 200, json: async () => path.includes('route=workspace')
          ? { setupRequired: !provisioned, organization: provisioned ? { id: 'org-1' } : null }
          : {} };
      }
    }
  };
  const document = { addEventListener() {}, querySelectorAll: () => [], querySelector: () => null, getElementById: () => null };
  vm.runInNewContext(fs.readFileSync('nextbright-crm/js/secure-workspace.js', 'utf8'),
    { window, document, localStorage, sessionStorage: localStorage, AbortController, DOMException, setTimeout, console });
  const session = { access_token: 'saved-token' };
  listener(session, user);
  await new Promise(resolve => setTimeout(resolve, 20));
  listener(session, user); // reopening/another auth event must reuse membership
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(created, existing || forbidden ? 0 : 1);
  assert.equal(reloads, forbidden ? 0 : 1);
  if (forbidden) assert.ok(errors.includes('Access denied'));
}
await scenario();
await scenario({ existing: true });
await scenario({ forbidden: true });
console.log('PASS: one-time setup, existing workspace restore, access errors do not create workspaces');
