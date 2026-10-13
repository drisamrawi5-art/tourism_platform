import { expect, test } from '@playwright/test';

/**
 * Smoke suite: locale routing, brand rules, discovery data, auth gating.
 * Read-only against the seeded dev database — no fixtures required.
 */

test.describe('locale routing', () => {
  test('root redirects to the default locale', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/en$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
  });

  test('unprefixed deep links redirect to the visitor locale', async ({ page }) => {
    await page.goto('/places');
    await expect(page).toHaveURL(/\/en\/places$/);
  });

  test('unknown locale-prefixed paths render the localised 404', async ({ page }) => {
    const response = await page.goto('/en/definitely-not-a-page-xyz');
    expect(response?.status()).toBe(404);
    await expect(page.getByText('404', { exact: true })).toBeVisible();
  });
});

test.describe('brand rules (spec section 9)', () => {
  test('EN home: official slogan + untranslated brand name', async ({ page }) => {
    await page.goto('/en');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Where Water Meets the Mountain',
    );
    // The header brand link's accessible name is dict.brand.name in every locale.
    await expect(page.locator('a[aria-label="Visit Imedwan"]').first()).toBeVisible();
  });

  test('FR home: slogan falls back to English, brand untouched', async ({ page }) => {
    await page.goto('/fr');
    await expect(page.locator('html')).toHaveAttribute('lang', 'fr');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(page.getByRole('heading', { level: 1 })).toContainText(
      'Where Water Meets the Mountain',
    );
    await expect(page.locator('a[aria-label="Visit Imedwan"]').first()).toBeVisible();
  });

  test('AR home: RTL direction, Arabic slogan, brand untranslated', async ({ page }) => {
    await page.goto('/ar');
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('إمدوان');
    await expect(page.locator('a[aria-label="Visit Imedwan"]').first()).toBeVisible();
  });
});

test.describe('discovery pages', () => {
  test('places list renders the seeded destination places', async ({ page }) => {
    await page.goto('/en/places');
    await expect(page.getByText('Amda').first()).toBeVisible();
    await expect(page.getByText('Taghia').first()).toBeVisible();
  });

  test('stay page renders', async ({ page }) => {
    await page.goto('/en/stay');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('search finds a seeded place through the public API', async ({ page }) => {
    await page.goto('/en/search?q=Amda');
    await expect(page.getByText('Amda').first()).toBeVisible({ timeout: 20_000 });
  });
});

test.describe('auth gating', () => {
  test('login page renders its form', async ({ page }) => {
    await page.goto('/en/login');
    await expect(page).toHaveURL(/\/en\/login/);
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]').first()).toBeVisible();
  });

  test('account pages redirect logged-out visitors to login', async ({ page }) => {
    await page.goto('/en/account');
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('provider portal redirects logged-out visitors to login', async ({ page }) => {
    await page.goto('/en/provider');
    await expect(page).toHaveURL(/\/en\/login/);
  });

  test('admin portal redirects logged-out visitors to login', async ({ page }) => {
    await page.goto('/en/admin');
    await expect(page).toHaveURL(/\/en\/login/);
  });
});
