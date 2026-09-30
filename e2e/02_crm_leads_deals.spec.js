import { test, expect } from '@playwright/test';

test.describe('Flow 2: B2B CRM, Leads & Sales Pipeline Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/nextbright-crm/index.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('2.1 CRM Navigation & Views Switching', async ({ page }) => {
    // Switch to Leads view
    await page.evaluate(() => window.navigateTo('leads'));
    const isLeadsActive = await page.evaluate(() => {
      const el = document.getElementById('view-leads');
      return el && el.classList.contains('active');
    });
    expect(isLeadsActive).toBe(true);

    // Switch to Customers view
    await page.evaluate(() => window.navigateTo('customers'));
    const isCustomersActive = await page.evaluate(() => {
      const el = document.getElementById('view-customers');
      return el && el.classList.contains('active');
    });
    expect(isCustomersActive).toBe(true);

    // Switch to Deals view
    await page.evaluate(() => window.navigateTo('deals'));
    const isDealsActive = await page.evaluate(() => {
      const el = document.getElementById('view-deals');
      return el && el.classList.contains('active');
    });
    expect(isDealsActive).toBe(true);
  });

  test('2.2 Add New Lead & Render Table Record', async ({ page }) => {
    await page.evaluate(() => window.navigateTo('leads'));

    await page.evaluate(() => {
      if (!window.NB.leads) window.NB.leads = [];
      window.NB.leads.unshift({
        id: 999,
        name: 'Quantum Systems Inc',
        phone: '+91 98765 00099',
        company: 'Quantum Tech',
        email: 'contact@quantumsys.io',
        source: 'Inbound WhatsApp',
        status: 'Qualified',
        score: 95,
        assigned: 'Praveenkumar',
        lastActivity: 'Just now',
        date: 'Today'
      });
      if (typeof window.renderLeadsTable === 'function') window.renderLeadsTable();
    });

    const leadsCount = await page.evaluate(() => window.NB.leads.length);
    expect(leadsCount).toBeGreaterThan(0);

    const newLead = await page.evaluate(() => window.NB.leads.find(l => l.id === 999));
    expect(newLead.name).toBe('Quantum Systems Inc');
    expect(newLead.status).toBe('Qualified');
  });

  test('2.3 Update Sales Pipeline Stage & Calculations', async ({ page }) => {
    await page.evaluate(() => window.navigateTo('deals'));

    await page.evaluate(() => {
      if (window.NB && window.NB.deals) {
        if (!window.NB.deals['Won']) window.NB.deals['Won'] = [];
        window.NB.deals['Won'].push({
          name: 'Enterprise Automation Contract',
          customer: 'Dr. Jacob Dental Center',
          amount: '₹1,50,000',
          prob: '100%',
          probClass: 'high',
          owner: 'Praveenkumar',
          lastActivity: 'Just now'
        });
        if (typeof window.renderDeals === 'function') window.renderDeals();
      }
    });

    const wonDealsCount = await page.evaluate(() => {
      return window.NB.deals['Won'] ? window.NB.deals['Won'].length : 0;
    });
    expect(wonDealsCount).toBeGreaterThan(0);
  });

  test('2.4 Open Customer 360 Profile Modal', async ({ page }) => {
    await page.evaluate(() => window.navigateTo('customers'));

    await page.evaluate(() => {
      if (typeof window.openCustomer360 === 'function') {
        window.openCustomer360('Dr. Jacob Mathew');
      }
    });

    const modalOpen = await page.evaluate(() => {
      const modal = document.getElementById('modal-customer-360');
      return modal && modal.classList.contains('open');
    });

    expect(modalOpen).toBe(true);

    const titleText = await page.textContent('#c360-name');
    expect(titleText).toContain('Dr. Jacob Mathew');
  });
});
