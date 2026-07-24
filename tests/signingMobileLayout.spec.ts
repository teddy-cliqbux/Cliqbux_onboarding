import { test, expect } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { assertSigningMobileShellContract } from '../src/lib/signingFrameLayout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shellPath = path.join(__dirname, 'fixtures', 'signing-mobile-shell.html');
const shellUrl = pathToFileURL(shellPath).href;

test.describe('Mobile signing shell (Trisha repro)', () => {
  test.use({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });

  test('broken layout fails mobile signing contract', async ({ page }) => {
    await page.goto(`${shellUrl}?mode=broken`);
    await page.waitForFunction(() => typeof window.__getShellMetrics === 'function');
    const metrics = await page.evaluate(() => window.__getShellMetrics());
    const errors = assertSigningMobileShellContract({
      ...metrics,
      viewportWidth: 390,
    });
    expect(errors.length, `expected broken fixture to fail: ${errors.join('; ')}`).toBeGreaterThan(0);
  });

  test('fixed layout passes mobile signing contract + Sign here is reachable', async ({ page }) => {
    await page.goto(`${shellUrl}?mode=fixed`);
    await page.waitForFunction(() => typeof window.__getShellMetrics === 'function');
    const metrics = await page.evaluate(() => window.__getShellMetrics());
    const errors = assertSigningMobileShellContract({
      ...metrics,
      viewportWidth: 390,
    });
    expect(errors, errors.join('; ')).toEqual([]);

    await expect(page.locator('#open-signing')).toBeVisible();

    const frame = page.frameLocator('#sign-frame');
    await frame.locator('#sign-here').scrollIntoViewIfNeeded();
    await frame.locator('#sign-here').click();
    await expect(frame.locator('body')).toHaveAttribute('data-signed', '1');
  });
});
