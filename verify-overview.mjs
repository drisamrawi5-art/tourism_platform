import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars — set them in your local .env (gitignored); see docs/database.md.');
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

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
await page.waitForTimeout(15000); // patient settle: /me + overview + analytics
const text = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log('HAS_ERROR:', /Something went wrong/i.test(text));
console.log('HAS_DENIED:', /do not have access/i.test(text));
console.log('HAS_LOADING:', /Loading/i.test(text));
console.log('TEXT:', JSON.stringify(text.slice(0, 1200)));
await page.screenshot({ path: 'test-results/verify-overview3.png', fullPage: true });
await browser.close();
