import { test, expect } from '@playwright/test';

test.describe('Flow 4: Workflow Automation, Tasks & Calendar Appointments', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/nextbright-crm/index.html');
    await page.waitForLoadState('domcontentloaded');
  });

  test('4.1 Tasks Management & Interactive Toggle', async ({ page }) => {
    await page.evaluate(() => window.navigateTo('tasks'));

    const initialTasksCount = await page.evaluate(() => window.NB.tasks.length);
    expect(initialTasksCount).toBeGreaterThan(0);

    // Toggle task status
    await page.evaluate(() => {
      if (typeof window.toggleTask === 'function') {
        window.toggleTask(0, true);
      }
    });

    const isDone = await page.evaluate(() => window.NB.tasks[0].done);
    expect(isDone).toBe(true);
  });

  test('4.2 Calendar Grid Rendering & Appointment Modal', async ({ page }) => {
    await page.evaluate(() => window.navigateTo('appointments'));

    const isApptsActive = await page.evaluate(() => {
      const el = document.getElementById('view-appointments');
      return el && el.classList.contains('active');
    });
    expect(isApptsActive).toBe(true);

    // Open schedule modal for day 25
    await page.evaluate(() => {
      if (typeof window.openScheduleModalForDay === 'function') {
        window.openScheduleModalForDay(25);
      }
    });

    const modalOpen = await page.evaluate(() => {
      const modal = document.getElementById('modal-add-appointment');
      return modal && modal.classList.contains('open');
    });
    expect(modalOpen).toBe(true);
  });

  test('4.3 Reports & Sales Conversion Funnel', async ({ page }) => {
    await page.evaluate(() => window.navigateTo('reports'));

    const isReportsActive = await page.evaluate(() => {
      const el = document.getElementById('view-reports');
      return el && el.classList.contains('active');
    });
    expect(isReportsActive).toBe(true);
  });
});
