import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const storage = new Map();
globalThis.sessionStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) };
globalThis.window = globalThis;
vm.runInThisContext(fs.readFileSync(new URL('../js/state.js', import.meta.url), 'utf8'), { filename: 'state.js' });

const orgA = { id: 'org-a', name: 'Organization A' };
const orgB = { id: 'org-b', name: 'Organization B' };
window.appState.configureScope({ userId: 'user-a', organization: orgA });
window.appState.set('leads', [{ id: 'lead-a', name: 'A only' }]);
window.appState.set('conversations', [{ id: 'conv-a' }]);
window.appState.configureScope({ userId: 'user-b', organization: orgB });
assert.deepEqual(window.appState.get('leads'), [], 'B must not receive A leads');
assert.deepEqual(window.appState.get('conversations'), [], 'B must not receive A conversations');
assert.equal(window.appState.getCurrentOrg().id, 'org-b');
window.appState.clear();
assert.equal(window.appState.getCurrentOrg(), null, 'logout must clear organization');
assert.deepEqual(window.appState.get('leads'), [], 'logout must clear tenant records');
console.log('PASS client state is scoped by user and organization; A-to-B and logout clear protected records.');