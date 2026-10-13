import { test, expect, type Page } from '@playwright/test';

/**
 * Navbar regression spec (mobile menu + desktop overlap issues).
 *
 * Guards the two fixed bugs:
 * 1. Mobile: menu opens as a clean vertical panel below the bar, closes on
 *    Escape / link click / resize-to-desktop, and never breaks the header.
 * 2. Desktop: the search control never overlaps a nav link (worst case is
 *    the French locale on /search, where the header row is widest).
 */

const WIDTHS = [320, 375, 430, 768, 1024, 1280, 1440];

type Rect = { x: number; y: number; w: number; h: number; right: number; bottom: number };

function overlaps(a: Rect, b: Rect): boolean {
  const ix = Math.min(a.right, b.right) - Math.max(a.x, b.x);
  const iy = Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y);
  return ix > 1 && iy > 1;
}

/** Collects visible header-bar control rects + scroll metrics. */
async function headerGeometry(page: Page, locale: string) {
  return page.evaluate((loc) => {
    const header = document.querySelector('header');
    if (!header) return null;
    const container = header.firstElementChild as HTMLElement;
    const brandGroup = container.children[0] as HTMLElement;
    const actions = container.children[1] as HTMLElement;
    const rect = (el: Element) => {
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height, right: r.right, bottom: r.bottom };
    };
    const visible = (el: Element) => el.getClientRects().length > 0;
    const named: Array<{ name: string; rect: Rect }> = [];
    const brand = brandGroup.querySelector('a');
    if (brand) named.push({ name: 'logo', rect: rect(brand) });
    brandGroup.querySelectorAll('nav a').forEach((a) => {
      if (visible(a)) named.push({ name: `nav:${a.textContent?.trim()}`, rect: rect(a) });
    });
    const pick = (name: string, el: Element | null) => {
      if (el && visible(el)) named.push({ name, rect: rect(el) });
    };
    pick('search', actions.querySelector(`a[href="/${loc}/search"]`));
    pick('lang', actions.querySelector('[aria-haspopup="listbox"]'));
    pick('signin', actions.querySelector(`a[href="/${loc}/login"]`));
    pick('register', actions.querySelector(`a[href="/${loc}/register"]`));
    pick('account', actions.querySelector('[aria-haspopup="menu"]'));
    pick('booknow', actions.querySelector(`a[href="/${loc}/stay"]`));
    pick('toggle', actions.querySelector('button[aria-controls]'));
    return {
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      named,
    };
  }, locale);
}

for (const locale of ['en', 'fr'] as const) {
  const widths = locale === 'en' ? WIDTHS : [375, 1280, 1440];
  for (const width of widths) {
    test(`header fits at ${width}px (${locale}, search page)`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${locale}/search`, { waitUntil: 'networkidle' });

      const geo = await headerGeometry(page, locale);
      expect(geo).not.toBeNull();

      // No horizontal scrolling.
      expect(geo!.scrollWidth).toBeLessThanOrEqual(geo!.innerWidth);

      // No two header controls overlap.
      for (let i = 0; i < geo!.named.length; i++) {
        for (let j = i + 1; j < geo!.named.length; j++) {
          expect(
            overlaps(geo!.named[i]!.rect, geo!.named[j]!.rect),
            `"${geo!.named[i]!.name}" overlaps "${geo!.named[j]!.name}" at ${width}px`,
          ).toBe(false);
        }
      }

      // Nav links stay single-line when the desktop nav is visible (xl+).
      for (const item of geo!.named.filter((n) => n.name.startsWith('nav:'))) {
        expect(item.rect.h, `nav link "${item.name}" wraps`).toBeLessThanOrEqual(45);
      }
    });
  }

  test(`mobile menu behaviour (${locale})`, async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/${locale}/`, { waitUntil: 'networkidle' });

    const toggle = page.locator('header button[aria-controls="mobile-menu"]');
    const panel = page.locator('#mobile-menu');

    // Opens, is wired up for a11y, and sits below the bar.
    await toggle.click();
    await panel.waitFor({ state: 'visible' });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await expect(toggle).toHaveAttribute('aria-controls', 'mobile-menu');
    const geo = await headerGeometry(page, locale);
    expect(geo!.scrollWidth).toBeLessThanOrEqual(geo!.innerWidth);

    // Escape closes it.
    await page.keyboard.press('Escape');
    await panel.waitFor({ state: 'hidden' });

    // Selecting a link navigates and closes the menu.
    await toggle.click();
    await panel.waitFor({ state: 'visible' });
    const firstLink = panel.locator('nav a').first();
    const href = await firstLink.getAttribute('href');
    await firstLink.click();
    await page.waitForURL((url) => url.pathname === href);
    await expect(panel).toBeHidden();

    // Resizing to the desktop breakpoint closes it and releases scroll lock.
    await toggle.click();
    await panel.waitFor({ state: 'visible' });
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(panel).toBeHidden();
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden');
    await expect(toggle).toBeHidden(); // hamburger hidden at xl+
  });
}
