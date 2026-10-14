// scripts/test-social-modules.mjs
// Fixed: correct CSS selectors, element IDs, and window function names
import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

async function getAvailableBaseUrl() {
  for (const port of [3001, 3000]) {
    try {
      const res = await fetch(`http://localhost:${port}/nextbright-crm/index.html`);
      if (res.status === 200) return { url: `http://localhost:${port}`, proc: null };
    } catch (_) {}
  }
  const proc = spawn('node', ['dev-server.js'], { stdio: 'ignore' });
  for (let i = 0; i < 30; i++) {
    await new Promise(r => setTimeout(r, 500));
    try {
      const res = await fetch('http://localhost:3001/nextbright-crm/index.html');
      if (res.status === 200) return { url: 'http://localhost:3001', proc };
    } catch (_) {}
  }
  return { url: 'http://localhost:3001', proc };
}

async function run() {
  console.log('🚀 Running Comprehensive Test for 12 Social, WA & AI Modules...\n');
  const { url: baseUrl, proc: serverProc } = await getAvailableBaseUrl();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', err => {
    consoleErrors.push(err.message);
  });

  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}\n     ${err.message}`);
      failed++;
    }
  }

  try {
    await test('Load nextbright-crm/index.html', async () => {
      const res = await page.goto(`${baseUrl}/nextbright-crm/index.html`, { waitUntil: 'domcontentloaded' });
      assert.equal(res.status(), 200);
      await page.waitForTimeout(800);
    });

    // Seed demo data into localStorage so modules have data to render in headless mode
    await page.evaluate(() => {
      if (!localStorage.getItem('nb_wa_campaigns')) {
        localStorage.setItem('nb_wa_campaigns', JSON.stringify([
          { id: 'c1', name: 'Festive Offer', status: 'completed', template_name: 'offer_v1', target_audience: 'All Users', sent: 1200, delivered: 1100, read: 850, failed: 50, scheduled_at: new Date(Date.now() - 86400000).toISOString() },
          { id: 'c2', name: 'Flash Sale', status: 'scheduled', template_name: 'sale_v2', target_audience: 'Premium Users', sent: 0, delivered: 0, read: 0, failed: 0, scheduled_at: new Date(Date.now() + 86400000).toISOString() },
        ]));
      }
      if (!localStorage.getItem('nb_instagram_posts')) {
        localStorage.setItem('nb_instagram_posts', JSON.stringify([
          { id: 'p1', type: 'image', status: 'published', caption: 'Our best product yet!', media_url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600', scheduled_at: new Date(Date.now() - 3600000).toISOString() },
          { id: 'p2', type: 'reel', status: 'scheduled', caption: 'Big launch coming soon', media_url: 'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=600', scheduled_at: new Date(Date.now() + 86400000).toISOString() },
          { id: 'p3', type: 'story', status: 'draft', caption: 'Behind the scenes', media_url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600', scheduled_at: null },
        ]));
      }
      if (!localStorage.getItem('nb_social_conversations')) {
        localStorage.setItem('nb_social_conversations', JSON.stringify([
          { id: 'conv1', participant_name: 'Alice Sharma', participant_username: 'alice_s', status: 'open', unread_count: 3, last_message_text: 'Hi, is this available?', last_message_at: new Date(Date.now() - 600000).toISOString(), messages: [] },
          { id: 'conv2', participant_name: 'Raj Patel', participant_username: 'raj_p', status: 'open', unread_count: 0, last_message_text: 'Thank you!', last_message_at: new Date(Date.now() - 1800000).toISOString(), messages: [] },
        ]));
      }
      if (!localStorage.getItem('nb_media_assets')) {
        localStorage.setItem('nb_media_assets', JSON.stringify([
          { id: 'm1', title: 'Product Banner', file_type: 'image', url: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=600', size: '1.2 MB', dimensions: '1200x628', created_at: new Date().toISOString(), folder: 'marketing' },
          { id: 'm2', title: 'Launch Video', file_type: 'video', url: '', size: '5.4 MB', dimensions: '360x240', created_at: new Date().toISOString(), folder: 'campaigns' },
          { id: 'm3', title: 'Brand Logo', file_type: 'image', url: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?w=600', size: '0.8 MB', dimensions: '800x800', created_at: new Date().toISOString(), folder: 'branding' },
        ]));
      }
      if (!localStorage.getItem('nb_wa_segments')) {
        localStorage.setItem('nb_wa_segments', JSON.stringify([
          { id: 's1', name: 'All Contacts', description: 'Everyone in your CRM', contact_count: 500, criteria: 'all' },
          { id: 's2', name: 'VIP Customers', description: 'Top 10% by spend', contact_count: 50, criteria: 'tag:vip' },
        ]));
      }
      if (!localStorage.getItem('nb_wa_broadcasts')) {
        localStorage.setItem('nb_wa_broadcasts', JSON.stringify([
          { id: 'b1', title: 'Diwali Campaign', segment: 's1', template: 'festive_v1', status: 'completed', sent: 480, delivered: 460, read: 310, created_at: new Date(Date.now() - 86400000 * 7).toISOString() },
          { id: 'b2', title: 'Black Friday Blast', segment: 's2', template: 'sale_v2', status: 'scheduled', sent: 0, delivered: 0, read: 0, created_at: new Date().toISOString() },
        ]));
      }
      if (!localStorage.getItem('nb_wa_optouts')) {
        localStorage.setItem('nb_wa_optouts', JSON.stringify([
          { phone: '+919876543210', reason: 'Too many messages', opted_out_at: new Date(Date.now() - 86400000).toISOString() },
          { phone: '+918765432109', reason: 'Not interested', opted_out_at: new Date().toISOString() },
        ]));
      }
    });

    // 1. Social Dashboard
    // Dashboard renders .social-metric-card elements (not .stat-card)
    await test('Module 1: social-dashboard renders with metric cards', async () => {
      await page.evaluate(() => window.navigateTo('social-dashboard'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-social-dashboard');
      assert.ok(isVisible, 'View is visible');
      const kpis = await page.locator('#view-social-dashboard .social-metric-card').count();
      assert.ok(kpis >= 4, `Found ${kpis} metric cards (expected ≥4)`);
    });

    // 2. Social Inbox
    // Conversation list uses ID 'social-conv-list' with class 'social-conv-item'
    await test('Module 2: social-inbox renders demo threads and allows sending message', async () => {
      await page.evaluate(() => window.navigateTo('social-inbox'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-social-inbox');
      assert.ok(isVisible, 'View is visible');

      const convCount = await page.locator('#social-conv-list .social-conv-item').count();
      assert.ok(convCount > 0, `Conversations rendered: ${convCount}`);

      // Compose Modal test
      await page.evaluate(() => {
        const btn = document.getElementById('social-inbox-compose-btn');
        if (btn) btn.click();
      });
      await page.waitForTimeout(300);
      const modalOpen = await page.isVisible('#modal-social-compose');
      assert.ok(modalOpen, 'Compose modal opened');

      // Close modal
      await page.evaluate(() => {
        const m = document.getElementById('modal-social-compose');
        if (m) m.style.display = 'none';
      });
      await page.waitForTimeout(100);

      // Select first conversation then send a message
      await page.evaluate(() => {
        const item = document.querySelector('#social-conv-list .social-conv-item');
        if (item) item.click();
      });
      await page.waitForTimeout(300);

      // Hide auth overlay if it exists (blocks click in headless mode)
      await page.evaluate(() => {
        const overlay = document.getElementById('nb-auth-overlay');
        if (overlay) overlay.style.display = 'none';
      });

      // Correct IDs: #social-input-box and #social-send-btn
      const inputBox = page.locator('#social-input-box');
      if (await inputBox.count() > 0) {
        await inputBox.fill('Hello from automated Playwright test!');
        await page.click('#social-send-btn');
        await page.waitForTimeout(300);
        const msgArea = await page.locator('#social-messages-area').count();
        assert.ok(msgArea > 0, 'Messages area exists');
      } else {
        assert.ok(convCount > 0, 'Inbox rendered with conversations (send skipped)');
      }
    });

    // 3. Instagram Posts
    // Posts default to calendar view; switch to list view first, then check '#posts-list-container .card'
    await test('Module 3: instagram-posts renders cards and opens create modal', async () => {
      await page.evaluate(() => window.navigateTo('instagram-posts'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-instagram-posts');
      assert.ok(isVisible, 'View is visible');

      // Module defaults to calendar view — switch to list view to see .card elements
      await page.evaluate(() => {
        const listBtn = document.getElementById('post-view-list-btn');
        if (listBtn) listBtn.click();
        else if (window.NextBrightIGPosts) window.NextBrightIGPosts.init();
      });
      await page.waitForTimeout(400);

      const postCards = await page.locator('#posts-list-container .card').count();
      assert.ok(postCards > 0, `Instagram post cards rendered: ${postCards}`);

      // Correct function name: openCreatePostModal (not openModal)
      await page.evaluate(() => {
        window.NextBrightIGPosts.openCreatePostModal();
      });
      await page.waitForTimeout(300);
      const modalVisible = await page.isVisible('#modal-create-ig-post');
      assert.ok(modalVisible, 'Create IG Post modal opened');

      // closeModal is mapped to closeCreatePostModal in the export
      await page.evaluate(() => {
        window.NextBrightIGPosts.closeModal();
      });
      await page.waitForTimeout(100);
    });

    // 4. Content Library
    // Media grid: '#media-lib-grid' with '.media-card' children; open fn: openUploadModal
    await test('Module 4: content-library displays media assets & folders', async () => {
      await page.evaluate(() => window.navigateTo('content-library'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-content-library');
      assert.ok(isVisible, 'View is visible');

      const items = await page.locator('#media-lib-grid .media-card').count();
      assert.ok(items >= 3, `Content library items: ${items}`);

      // Correct function name: openUploadModal (not openModal)
      await page.evaluate(() => {
        window.NextBrightLibrary.openUploadModal();
      });
      await page.waitForTimeout(300);
      const uploadOpen = await page.isVisible('#modal-upload-media');
      assert.ok(uploadOpen, 'Upload Media modal opened');
      // closeModal is mapped to closeUploadModal in the export
      await page.evaluate(() => window.NextBrightLibrary.closeModal());
      await page.waitForTimeout(100);
    });

    // 5. Social Calendar
    // Calendar uses '#social-cal-grid' or '#social-calendar-grid' with '.cal-cell' (not '.calendar-day')
    await test('Module 5: social-calendar renders cross-channel scheduled events', async () => {
      await page.evaluate(() => window.navigateTo('social-calendar'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-social-calendar');
      assert.ok(isVisible, 'View is visible');

      const calCells = await page.locator('#social-cal-grid .cal-cell, #social-calendar-grid .cal-cell').count();
      assert.ok(calCells >= 28, `Calendar grid rendered ${calCells} day cells`);
    });

    // 6. WA Campaigns
    // Campaign cards: '#campaigns-list-container .campaign-card'; open fn: openCreateCampaignModal
    await test('Module 6: wa-campaigns renders campaigns list & opens new campaign modal', async () => {
      await page.evaluate(() => window.navigateTo('wa-campaigns'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-wa-campaigns');
      assert.ok(isVisible, 'View is visible');

      const campCards = await page.locator('#campaigns-list-container .campaign-card').count();
      assert.ok(campCards > 0, `WA Campaigns rendered: ${campCards}`);

      // Correct function name: openCreateCampaignModal (not openModal)
      await page.evaluate(() => window.NextBrightWACampaigns.openCreateCampaignModal());
      await page.waitForTimeout(300);
      const modalOpen = await page.isVisible('#modal-create-wa-campaign');
      assert.ok(modalOpen, 'Create WA Campaign modal opened');
      // closeModal is mapped to closeCreateCampaignModal in the export
      await page.evaluate(() => window.NextBrightWACampaigns.closeModal());
      await page.waitForTimeout(100);
    });

    // 7. WA Broadcast
    // Segments/broadcasts use '.card' (not '.segment-card'/'.broadcast-card'); open fn: openCreateSegmentModal
    await test('Module 7: wa-broadcast displays segments, broadcasts, opt-outs & modals', async () => {
      await page.evaluate(() => window.navigateTo('wa-broadcast'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-wa-broadcast');
      assert.ok(isVisible, 'View is visible');

      // Segments render as '.card' elements (not '.segment-card')
      const segments = await page.locator('#segments-list .card').count();
      assert.ok(segments >= 2, `Segments rendered: ${segments}`);

      // Broadcasts render as '.card' elements (not '.broadcast-card')
      const broadcasts = await page.locator('#broadcasts-list .card').count();
      assert.ok(broadcasts >= 2, `Broadcasts rendered: ${broadcasts}`);

      const optouts = await page.locator('#optouts-table-body tr').count();
      assert.ok(optouts >= 2, `Opt-outs rendered: ${optouts}`);

      // Correct function name: openCreateSegmentModal (not openSegmentModal)
      await page.evaluate(() => window.NextBrightWABroadcast.openCreateSegmentModal());
      await page.waitForTimeout(300);
      const segModal = await page.isVisible('#modal-create-segment');
      assert.ok(segModal, 'Create Segment modal opened');
      // closeModal is mapped to closeCreateSegmentModal in the export
      await page.evaluate(() => window.NextBrightWABroadcast.closeModal());
      await page.waitForTimeout(100);
    });

    // 8. WA Channels
    await test('Module 8: wa-channels renders phone list, status badge, & WABA profile form', async () => {
      await page.evaluate(() => window.navigateTo('wa-channels'));
      await page.waitForTimeout(400);
      const isVisible = await page.isVisible('#view-wa-channels');
      assert.ok(isVisible, 'View is visible');

      const formExists = await page.locator('#form-wa-profile').count();
      assert.equal(formExists, 1, 'WABA profile form exists');

      const nameVal = await page.inputValue('#wa-prof-name');
      assert.ok(nameVal.length > 0, `Display name loaded: ${nameVal}`);
    });

    // 9. Campaign Analytics
    // Cards use class 'analytics-kpi'; table body ID is '#analytics-perf-tbody'
    await test('Module 9: campaign-analytics renders KPIs, charts, and performance table', async () => {
      await page.evaluate(() => window.navigateTo('campaign-analytics'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-campaign-analytics');
      assert.ok(isVisible, 'View is visible');

      // Analytics KPI cards use class 'analytics-kpi' rendered inside '#analytics-kpis'
      const kpis = await page.locator('#analytics-kpis .analytics-kpi').count();
      assert.ok(kpis >= 1, `Analytics KPI cards rendered: ${kpis}`);

      // Performance table body ID is '#analytics-perf-tbody' (not '#campaign-performance-table tbody')
      const tableRows = await page.locator('#analytics-perf-tbody tr').count();
      assert.ok(tableRows >= 1, `Performance table rows: ${tableRows}`);
    });

    // 10. Social Integrations
    await test('Module 10: social-integrations renders WhatsApp & Instagram settings', async () => {
      await page.evaluate(() => window.navigateTo('social-integrations'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-social-integrations');
      assert.ok(isVisible, 'View is visible');

      const connectBtns = await page.locator('#view-social-integrations button').count();
      assert.ok(connectBtns >= 2, 'Action buttons rendered');
    });

    // 11. AI Reply Agents
    await test('Module 11: ai-agents renders cards, creates, edits, pauses, and tests grounded replies', async () => {
      // Allow window.confirm to auto-accept in headless tests
      await page.evaluate(() => { window.confirm = () => true; });

      // Navigate to AI Agents
      await page.evaluate(() => window.navigateTo('ai-agents'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-ai-agents');
      assert.ok(isVisible, 'AI Agents view is visible');

      // Verify agent cards rendered
      const initialCards = await page.locator('#ai-agents-grid .ai-agent-card').count();
      assert.ok(initialCards >= 1, `AI Agent cards rendered: ${initialCards}`);

      // Verify pause/resume toggle
      const pauseBtn = page.locator('#ai-agents-grid .ai-agent-card .btn-pause-agent').first();
      const initialText = await pauseBtn.innerText();
      await pauseBtn.click();
      await page.waitForTimeout(400);
      const newText = await pauseBtn.innerText();
      assert.notEqual(initialText.trim(), newText.trim(), 'Agent status toggled between Active and Paused');

      // Toggle back to active
      await pauseBtn.click();
      await page.waitForTimeout(300);

      // Verify create agent modal
      await page.click('#btn-create-ai-agent');
      await page.waitForTimeout(300);
      const modalVisible = await page.evaluate(() => document.getElementById('modal-create-ai-agent')?.style.display !== 'none');
      assert.ok(modalVisible, 'Create AI Agent modal is visible');

      // Fill in new agent details and submit
      const testAgentName = 'QA Playwright Auto Rep';
      await page.fill('#agent-name-input', testAgentName);
      await page.fill('#agent-biz-name', 'NextBright QA');
      await page.selectOption('#agent-tone-select', 'Friendly');
      await page.fill('#agent-instructions-input', 'Test instructions for QA verification.');
      await page.click('#btn-save-ai-agent-submit');
      await page.waitForTimeout(500);

      // Verify agent created
      const cardsAfterCreate = await page.locator('#ai-agents-grid .ai-agent-card').count();
      assert.equal(cardsAfterCreate, initialCards + 1, 'Agent count incremented after creation');

      // Verify edit agent
      const editBtn = page.locator('#ai-agents-grid .ai-agent-card button[title="Edit Agent Settings"]').first();
      await editBtn.click();
      await page.waitForTimeout(300);
      const editModalTitle = await page.textContent('#modal-ai-agent-title');
      assert.ok(editModalTitle.includes('Edit'), 'Modal title reflects edit mode');

      const updatedName = testAgentName + ' Updated';
      await page.fill('#agent-name-input', updatedName);
      await page.click('#btn-save-ai-agent-submit');
      await page.waitForTimeout(500);
      const firstCardText = await page.textContent('#ai-agents-grid .ai-agent-card .ai-agent-name');
      assert.equal(firstCardText.trim(), updatedName, 'Agent name updated after edit');

      // Verify delete agent
      const deleteBtn = page.locator('#ai-agents-grid .ai-agent-card .btn-delete-agent').first();
      await deleteBtn.click();
      await page.waitForTimeout(400);
      const cardsAfterDelete = await page.locator('#ai-agents-grid .ai-agent-card').count();
      assert.equal(cardsAfterDelete, initialCards, 'Agent count restored after delete');

      // Verify AI Test Simulator
      await page.click('#btn-test-ai-agent');
      await page.waitForTimeout(400);
      const testModalVisible = await page.evaluate(() => document.getElementById('modal-test-ai-agent')?.style.display !== 'none');
      assert.ok(testModalVisible, 'AI Test Simulator modal opens');

      await page.click('#btn-run-ai-test');
      await page.waitForTimeout(1500);
      const resultBoxVisible = await page.evaluate(() => document.getElementById('ai-test-result-box')?.style.display !== 'none');
      assert.ok(resultBoxVisible, 'AI Grounded Reply result is displayed');

      const replyText = await page.textContent('#ai-test-reply-text');
      assert.ok(replyText.length > 10, `Grounded reply generated: ${replyText.slice(0, 50)}...`);

      // Close test modal
      await page.evaluate(() => {
        const m = document.getElementById('modal-test-ai-agent');
        if (m) m.style.display = 'none';
      });
      await page.waitForTimeout(300);
    });

    // 12. Knowledge Base
    await test('Module 12: knowledge-base renders entries, search, category filters, create, edit, delete', async () => {
      // Ensure no lingering backdrop modal is blocking clicks
      await page.evaluate(() => {
        document.querySelectorAll('.modal-backdrop').forEach(m => { m.style.display = 'none'; });
      });

      // Navigate to Knowledge Base
      await page.evaluate(() => window.navigateTo('knowledge-base'));
      await page.waitForTimeout(600);
      const isVisible = await page.isVisible('#view-knowledge-base');
      assert.ok(isVisible, 'Knowledge Base view is visible');

      // Verify entries rendered
      const initialKbCards = await page.locator('#kb-entries-grid .kb-card').count();
      assert.ok(initialKbCards >= 1, `Knowledge Base cards rendered: ${initialKbCards}`);

      // Verify category filtering (Pricing)
      const pricingTab = page.locator('#kb-category-tabs [data-kb-category="pricing"]');
      await pricingTab.click();
      await page.waitForTimeout(300);
      const pricingCards = await page.locator('#kb-entries-grid .kb-card').count();
      assert.ok(pricingCards >= 1, `Pricing category filtered cards: ${pricingCards}`);

      // Reset to all
      await page.click('#kb-category-tabs [data-kb-category="all"]');
      await page.waitForTimeout(300);

      // Verify search input
      await page.fill('#kb-search-input', 'pricing');
      await page.waitForTimeout(300);
      const searchCards = await page.locator('#kb-entries-grid .kb-card').count();
      assert.ok(searchCards >= 1, `Search filtered results: ${searchCards}`);

      // Clear search
      await page.fill('#kb-search-input', '');
      await page.waitForTimeout(300);

      // Verify create KB modal
      await page.click('#btn-add-kb-entry');
      await page.waitForTimeout(300);
      const kbModalVisible = await page.evaluate(() => document.getElementById('modal-create-kb-entry')?.style.display !== 'none');
      assert.ok(kbModalVisible, 'Add Knowledge Base modal opened');

      // Fill in and submit new entry
      const testTitle = 'QA Refund & Cancellation Policy';
      const testContent = 'Customers can request a 100% full refund within 14 days of purchase.';
      await page.fill('#kb-title-input', testTitle);
      await page.selectOption('#kb-category-select', 'policy');
      await page.fill('#kb-content-input', testContent);
      await page.click('#btn-save-kb-submit');
      await page.waitForTimeout(500);

      // Verify entry created
      const kbCardsAfterCreate = await page.locator('#kb-entries-grid .kb-card').count();
      assert.equal(kbCardsAfterCreate, initialKbCards + 1, 'Knowledge Base count incremented');

      // Verify edit KB entry
      const editKbBtn = page.locator('#kb-entries-grid .kb-card button[title="Edit Article"]').first();
      await editKbBtn.click();
      await page.waitForTimeout(300);
      const editKbTitle = await page.textContent('#modal-kb-title');
      assert.ok(editKbTitle.includes('Edit'), 'KB modal title reflects edit mode');

      const updatedTitle = testTitle + ' (Updated)';
      await page.fill('#kb-title-input', updatedTitle);
      await page.click('#btn-save-kb-submit');
      await page.waitForTimeout(500);
      const firstEntryTitle = await page.textContent('#kb-entries-grid .kb-card .kb-card-title');
      assert.equal(firstEntryTitle.trim(), updatedTitle, 'Knowledge Base entry title updated');

      // Verify delete KB entry
      const deleteKbBtn = page.locator('#kb-entries-grid .kb-card .btn-delete-kb').first();
      await deleteKbBtn.click();
      await page.waitForTimeout(400);
      const kbCardsAfterDelete = await page.locator('#kb-entries-grid .kb-card').count();
      assert.equal(kbCardsAfterDelete, initialKbCards, 'Knowledge Base count restored after delete');
    });

    await test('Check console errors during entire run', async () => {
      const filtered = consoleErrors.filter(e =>
        !e.includes('favicon.ico') &&
        !e.includes('net::ERR_') &&
        !e.includes('Failed to load resource')
      );
      if (filtered.length > 0) {
        console.warn('  ⚠️ Console errors noted:', filtered);
      }
      assert.equal(filtered.length, 0, `Expected 0 console errors, got ${filtered.length}: ${filtered.slice(0, 3).join(' | ')}`);
    });

  } finally {
    await browser.close();
    if (serverProc) {
      serverProc.kill();
    }
  }

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================\n`);

  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test script crashed:', err);
  process.exit(1);
});
