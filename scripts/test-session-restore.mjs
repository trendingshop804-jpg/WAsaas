import vm from 'node:vm';
import fs from 'node:fs';
import assert from 'node:assert/strict';

const session = { access_token: 'saved-token', user: { id: 'customer-1' } };
let clients = 0;
let callback;
let queries = 0;
const scopes = [];
const context = vm.createContext({
  console, setTimeout, localStorage: { removeItem() {} },
  CustomEvent: class { constructor(type, options) { Object.assign(this, { type, ...options }); } },
  window: {
    supabaseConfig: { ready: Promise.resolve(), isSupabaseConfigured: () => true },
    supabase: { createClient() {
      clients++;
      return {
        auth: {
          getSession: async () => ({ data: { session }, error: null }),
          onAuthStateChange(fn) { callback = fn; }
        },
        from(table) {
          queries++;
          return { select() { return this; }, eq() { return this; },
            maybeSingle: async () => ({ data: { name: 'Customer' }, error: null }),
            limit: async () => ({ data: [{ organizations: { id: 'org-1' }, role: 'Owner' }], error: null }) };
        }
      };
    } },
    appState: { configureScope(scope) { scopes.push(scope); }, clear() {} },
    dispatchEvent() {}
  }
});
vm.runInContext(fs.readFileSync('js/services/auth-service.js', 'utf8'), context);
const service = context.window.authService;
await Promise.all([service.init(), service.init()]);
assert.equal(clients, 1, 'startup creates one client');
assert.equal(service.isAuthenticated(), true, 'saved session restores authentication');
assert.equal(scopes[0].userId, 'customer-1');
const before = queries;
assert.equal(callback('TOKEN_REFRESHED', session), undefined, 'auth callback stays synchronous');
assert.equal(queries, before, 'no database query inside the auth callback');
callback('SIGNED_OUT', null);
await new Promise(resolve => setTimeout(resolve, 10));
assert.equal(service.isAuthenticated(), false);
assert.equal(queries, before, 'deferred profile work skips a signed-out account');
console.log('PASS: saved session, singleton startup, synchronous refresh, sign-out isolation');
