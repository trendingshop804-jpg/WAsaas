import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relativePath => fs.readFileSync(new URL(`../${relativePath}`, import.meta.url), 'utf8');
const html = read('nextbright-crm/index.html');
const data = read('nextbright-crm/js/data.js');
const auth = read('nextbright-crm/js/auth.js');
const workspace = read('nextbright-crm/js/secure-workspace.js');
const inbox = read('nextbright-crm/js/ui.js');
const leadsApi = read('api/leads.js');
const socialInbox = read('nextbright-crm/js/social-inbox.js');
const admin = read('nextbright-crm/js/admin.js');

const fullModules = [
  'dashboard', 'leads', 'customers', 'calls', 'messages', 'appointments', 'tasks', 'deals', 'reports', 'settings',
  'social-dashboard', 'social-inbox', 'instagram-posts', 'content-library', 'social-calendar', 'wa-campaigns',
  'wa-broadcast', 'wa-channels', 'campaign-analytics', 'social-integrations', 'ai-agents', 'knowledge-base'
];
for (const moduleName of fullModules) assert.match(html, new RegExp(`data-view=["']${moduleName}["']`), `missing restored module ${moduleName}`);
assert.doesNotMatch(html, /js\/mvp\.js/);
assert.match(html, /js\/secure-workspace\.js/);
assert.doesNotMatch(`${html}\n${data}`, /Praveenkumar|Diana Lee|Chana Lee|Alice Lee|praveenkumar@nextbright/i);
assert.match(data, /leads: NB\.leads \|\| \[\]/);
assert.doesNotMatch(data, /WhatsApp Contact \(\+\d+/);
assert.match(socialInbox, /DEFAULT_DEMO_CONVERSATIONS = \[\]/);
assert.match(socialInbox, /DEFAULT_DEMO_MESSAGES = \{\}/);
assert.match(admin, /defaultCompanies = \[\]/);

assert.match(auth, /client\.auth\.onAuthStateChange/);
assert.match(auth, /emit\(session \|\| null, session\?\.user \|\| null\)/);
assert.match(auth, /key\.startsWith\('nb_'\)/);
assert.match(auth, /signOut\(\{ scope: 'local' \}\)/);
assert.match(workspace, /activeControllers\.forEach\(controller => controller\.abort\(\)\)/);
assert.match(workspace, /const scope = `\$\{authUser\.id\}:\$\{context\.organization\.id\}`/);
assert.match(workspace, /previousScope !== scope/);
assert.match(workspace, /clearLegacyCaches\(\)/);
assert.match(workspace, /requestJson\('\/api\/leads\?route=workspace'/);
assert.match(workspace, /requestJson\('\/api\/messages\?limit=500'/);
assert.match(workspace, /showSetupCard\(authUser\)/);
assert.match(workspace, /window\.NB\.conversations = \(messagesPayload\.conversations \|\| \[\]\)/);
assert.match(inbox, /window\.NB\.conversations = \[\]/);
assert.doesNotMatch(inbox, /Showing the last known list/);

assert.match(leadsApi, /async function handleWorkspace/);
assert.match(leadsApi, /getAuthenticatedUser\(req\)/);
assert.match(leadsApi, /getUserOrganizationIds\(auth\.user\.id\)/);
assert.match(leadsApi, /setupRequired: true/);
assert.match(leadsApi, /req\.query\?\.route === 'workspace'/);

console.log(`PASS restored ${fullModules.length} pre-MVP modules with tenant-safe empty state and verified identity loading.`);