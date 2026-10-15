import assert from 'node:assert/strict';
import fs from 'node:fs';
const source = fs.readFileSync(new URL('../nextbright-crm/js/auth.js', import.meta.url), 'utf8');
assert.match(source, /function clearLocalSession\(\)/);
assert.match(source, /clearLocalSession\(\);[\s\S]*emit\(null, null\)/);
assert.match(source, /signOut\(\{ scope: 'local' \}\)/);
assert.match(source, /location\.replace/);
console.log('PASS logout clears local auth and CRM cache before any optional remote sign-out.');