import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars — set them in your local .env (gitignored); see docs/database.md.');
  process.exit(1);
}
const OUT = [];

function log(...args) {
  const line = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
  OUT.push(line);
  console.log(line);
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
});
page.on('pageerror', (err) => consoleErrors.push(`pageerror: ${String(err).slice(0, 300)}`));

// 1. Login through the real UI flow (wait for hydration before clicking).
await page.goto(`${BASE}/en/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(3000); // let Next hydrate before clicking submit
await page.fill('input[type="email"]', ADMIN_EMAIL);
await page.fill('input[type="password"]', ADMIN_PASSWORD);
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 30000 }).catch(() => {});
log('LOGIN_URL:', page.url());

// 2. Raw API envelope check for a paginated admin endpoint.
const envelope = await page.evaluate(async () => {
  const res = await fetch('/api/v1/admin/media?perPage=3', { credentials: 'same-origin' });
  const body = await res.json();
  return {
    status: res.status,
    topKeys: Object.keys(body ?? {}),
    dataType: Array.isArray(body?.data) ? 'array' : typeof body?.data,
    dataKeys: body?.data && !Array.isArray(body.data) ? Object.keys(body.data) : null,
    hasTopPagination: !!body?.pagination,
    sample: Array.isArray(body?.data) ? body.data.slice(0, 1) : body?.data?.items?.slice?.(0, 1) ?? null,
  };
});
log('ENVELOPE:', JSON.stringify(envelope));

// 3. Admin overview page — poll until metrics render or an error appears.
await page.goto(`${BASE}/en/admin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page
  .waitForFunction(
    () => {
      const txt = document.body.innerText;
      return !txt.includes('Loading…');
    },
    { timeout: 40000 },
  )
  .catch(() => {});
const overviewText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
log('ADMIN_URL:', page.url());
log('ADMIN_HAS_ERROR_ALERT:', /Something went wrong|serverError/i.test(overviewText));
log('ADMIN_TEXT:', JSON.stringify(overviewText.slice(0, 600)));
await page.screenshot({ path: 'test-results/verify-admin-overview.png' });

// 3b. Overview API timing while authenticated.
const overviewApi = await page.evaluate(async () => {
  const t0 = performance.now();
  const res = await fetch('/api/v1/admin/overview', { credentials: 'same-origin' });
  const ms = Math.round(performance.now() - t0);
  const body = await res.json().catch(() => null);
  return { status: res.status, ms, keys: body?.data ? Object.keys(body.data) : null };
});
log('OVERVIEW_API:', JSON.stringify(overviewApi));

// 4. Admin media list — rows or error?
await page.goto(`${BASE}/en/admin/media`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(8000);
const mediaText = await page.evaluate(() => document.body.innerText.slice(0, 1200));
log('MEDIA_URL:', page.url());
log('MEDIA_HAS_ERROR_ALERT:', /Something went wrong|serverError/i.test(mediaText));
log('MEDIA_TEXT:', JSON.stringify(mediaText.slice(0, 600)));
await page.screenshot({ path: 'test-results/verify-admin-media.png' });

// 5. Admin bookings list.
await page.goto(`${BASE}/en/admin/bookings`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(6000);
const bookingsText = await page.evaluate(() => document.body.innerText.slice(0, 900));
log('BOOKINGS_HAS_ERROR_ALERT:', /Something went wrong|serverError/i.test(bookingsText));
log('BOOKINGS_TEXT:', JSON.stringify(bookingsText.slice(0, 400)));
await page.screenshot({ path: 'test-results/verify-admin-bookings.png' });

log('CONSOLE_ERRORS:', JSON.stringify(consoleErrors.slice(0, 10)));

await browser.close();
