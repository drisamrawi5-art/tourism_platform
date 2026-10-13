import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars — set them in your local .env (gitignored); see docs/database.md.');
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto(`${BASE}/en/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
await page.fill('input[type="email"]', ADMIN_EMAIL);
await page.fill('input[type="password"]', ADMIN_PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
console.log('LOGIN_URL:', page.url());

await page.goto(`${BASE}/en/admin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(5000);
const text = await page.evaluate(() => document.body.innerText);
console.log('READY_TABS:', text.includes('Dashboard') && text.includes('Bookings'));
console.log('NO_ACCESS_DENIED:', !text.includes('do not have access'));
console.log('GROUPS:', ['CONTENT', 'OPERATIONS', 'INSIGHTS'].every((g) => text.toUpperCase().includes(g)));
await page.screenshot({ path: 'test-results/admin-nav.png', fullPage: false });

// booking detail page renders (404 → honest error state, no crash)
await page.goto(`${BASE}/en/admin/bookings/nonexistent-id`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(4000);
const detailText = await page.evaluate(() => document.body.innerText);
console.log('DETAIL_RENDERS:', detailText.includes('Bookings') && (detailText.includes('Something went wrong') || detailText.includes('Booking')));

// RTL check on AR admin
await page.goto(`${BASE}/ar/admin`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForTimeout(5000);
const dir = await page.evaluate(() => document.documentElement.dir);
console.log('AR_DIR:', dir);
const arText = await page.evaluate(() => document.body.innerText);
console.log('AR_NO_KEY_LEAK:', !/\bnavGroup\b|\badmin\./.test(arText));

console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0, 5)));
await browser.close();
