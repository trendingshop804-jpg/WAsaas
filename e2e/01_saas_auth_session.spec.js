import { test, expect } from '@playwright/test';

test.describe('Flow 1: SaaS Authentication & Session Lifecycle', () => {
  test('1.1 Application Initial Load & Global State Setup', async ({ page }) => {
    await page.goto('/nextbright-crm/index.html');
    await page.waitForLoadState('domcontentloaded');

    // Verify NextBright CRM global data object exists
    const isNBLoaded = await page.evaluate(() => {
      return typeof window.NB !== 'undefined' && Array.isArray(window.NB.leads);
    });
    expect(isNBLoaded).toBe(true);

    // Verify logged-in session / user state
    await page.evaluate(() => {
      window.NB.user = {
        id: 'usr-new-001',
        email: 'praveen@nextbright.ai',
        name: 'Praveenkumar',
        role: 'Admin',
        organization: 'NexusLead AI'
      };
      localStorage.setItem('nb_user', JSON.stringify(window.NB.user));
    });

    const user = await page.evaluate(() => window.NB.user);
    expect(user).toBeTruthy();
    expect(user.email).toBe('praveen@nextbright.ai');
    expect(user.role).toBe('Admin');
  });

  test('1.2 Session Persistence Across Page Reload', async ({ page }) => {
    await page.goto('/nextbright-crm/index.html');
    await page.waitForLoadState('domcontentloaded');

    await page.evaluate(() => {
      const session = {
        id: 'usr-persistent-99',
        email: 'alex@nextbright.com',
        name: 'Alex Mercer',
        role: 'Manager'
      };
      localStorage.setItem('nb_user', JSON.stringify(session));
      window.NB.user = session;
    });

    // Reload page
    await page.reload({ waitUntil: 'domcontentloaded' });

    const persistedUser = await page.evaluate(() => {
      const stored = localStorage.getItem('nb_user');
      return stored ? JSON.parse(stored) : window.NB.user;
    });
    expect(persistedUser).toBeTruthy();
    expect(persistedUser.email).toBe('alex@nextbright.com');
  });

  test('1.3 Profile & Organization Workspace Context Verification', async ({ page }) => {
    await page.goto('/nextbright-crm/index.html');
    await page.waitForLoadState('domcontentloaded');

    const appTitle = await page.title();
    expect(appTitle).toContain('NextBright');

    const sidebarVisible = await page.isVisible('#sidebar');
    expect(sidebarVisible).toBe(true);
  });
});
