import { chromium } from '@playwright/test';

const BASE = 'http://localhost:3000';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD;
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Missing E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD env vars — set them in your local .env (gitignored); see docs/database.md.');
  process.exit(1);
}
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 200)));

const log = (...a) => console.log(...a.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))));

const getSettings = () =>
  page.evaluate(async () => {
    const res = await fetch('/api/v1/admin/settings', { credentials: 'same-origin' });
    const body = await res.json();
    return body?.data?.settings ?? null;
  });

const putSetting = (key, value) =>
  page.evaluate(
    async ([k, v]) => {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PUT',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: k, value: v }),
      });
      return res.status;
    },
    [key, value],
  );

const getPublicHome = () =>
  page.evaluate(async () => (await fetch('/en', { credentials: 'same-origin' })).text());

// Full navigation + rendered text (scripts stripped) — needed when the
// string also exists inside the RSC flight payload (the whole dictionary is
// serialized as a prop to cards, so raw-HTML `includes` gives false
// positives for gated sections).
const getPublicHomeDom = async () => {
  await page.goto(`${BASE}/en`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(2500);
  return page.evaluate(() => document.body.innerText);
};

// --- login -----------------------------------------------------------------
await page.goto(`${BASE}/en/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(3000);
await page.fill('input[type="email"]', ADMIN_EMAIL);
await page.fill('input[type="password"]', ADMIN_PASSWORD);
await Promise.all([
  page.waitForURL((u) => !u.pathname.includes('/login'), { timeout: 60000 }).catch(() => {}),
  page.click('button[type="submit"]'),
]);
log('LOGIN_URL:', page.url());

// --- capture originals -------------------------------------------------------
const original = await getSettings();
const orig = {
  contentEn: original?.['homepage.content.en'] ?? {},
  hidden: original?.['homepage.hiddenSections'] ?? [],
  imageId: original?.['homepage.heroImageId'] ?? '',
};
log('ORIGINAL:', JSON.stringify(orig));

try {
  // --- open editor ------------------------------------------------------------
  await page.goto(`${BASE}/en/admin/homepage`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(6000);
  const editorText = await page.evaluate(() => document.body.innerText);
  log('EDITOR_RENDERED:', editorText.includes('Hero') && editorText.includes('Introduction'));
  log('EDITOR_DENIED:', editorText.includes('do not have access'));

  // --- 1. edit EN subtitle -> save -> public reflects -------------------------
  await page.fill('#hp-en-heroSubtitle', 'E2E test subtitle 123');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Settings saved'), { timeout: 20000 }).catch(() => log('SAVE_ALERT_MISSING'));
  const afterSave = await getSettings();
  log('PERSISTED_SUBTITLE:', afterSave?.['homepage.content.en']?.heroSubtitle);
  const html1 = await getPublicHome();
  log('PUBLIC_SHOWS_SUBTITLE:', html1.includes('E2E test subtitle 123'));

  // --- 2. language switcher --------------------------------------------------
  await page.getByRole('button', { name: 'Français' }).click();
  await page.waitForTimeout(500);
  log('FR_FIELDS_PRESENT:', (await page.locator('#hp-fr-heroEyebrow').count()) === 1);
  await page.getByRole('button', { name: 'العربية' }).click();
  await page.waitForTimeout(500);
  log('AR_FIELDS_PRESENT:', (await page.locator('#hp-ar-heroEyebrow').count()) === 1);
  await page.getByRole('button', { name: 'English' }).click();
  await page.waitForTimeout(500);

  // --- 3. hide intro section -> public drops it ------------------------------
  await page.getByRole('switch', { name: /Introduction/ }).click();
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Settings saved'), { timeout: 20000 }).catch(() => {});
  const introDom = await getPublicHomeDom();
  log('PUBLIC_HIDES_INTRO:', !introDom.includes('Water, rock and quiet valleys'));

  // back to the editor (getPublicHomeDom navigated away)
  await page.goto(`${BASE}/en/admin/homepage`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForTimeout(4000);

  // --- 4. upload image, approve, save -> public hero image -------------------
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  );
  await page.setInputFiles('input[aria-label="Hero image"]', {
    name: 'e2e-hero.png',
    mimeType: 'image/png',
    buffer: png,
  });
  await page.fill('#hp-upload-alt', 'E2E hero image');
  await page.getByRole('button', { name: 'Upload image', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Pending review'), { timeout: 20000 }).catch(() => log('UPLOAD_STATE_MISSING'));
  await page.getByRole('button', { name: 'Approve', exact: true }).first().click();
  // wait until the approve PATCH resolves (button flips to "Current hero
  // image" for the auto-selected item) — first-hit route compile can take
  // several seconds on the dev server.
  await page
    .waitForFunction(() => document.body.innerText.includes('Current hero image'), { timeout: 40000 })
    .catch(() => log('APPROVE_STATE_MISSING'));
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForFunction(() => document.body.innerText.includes('Settings saved'), { timeout: 20000 }).catch(() => {});
  const afterImage = await getSettings();
  log('PERSISTED_IMAGE_ID:', afterImage?.['homepage.heroImageId']);
  const html3 = await getPublicHome();
  log('PUBLIC_HAS_HERO_IMG:', html3.includes('/api/v1/media/file/'));
  await page.screenshot({ path: 'test-results/verify-homepage-editor.png', fullPage: true });
} catch (err) {
  log('SCRIPT_ERROR:', String(err).slice(0, 300));
} finally {
  // --- restore original data -------------------------------------------------
  const status1 = await putSetting('homepage.content.en', orig.contentEn);
  const status2 = await putSetting('homepage.hiddenSections', orig.hidden);
  const status3 = await putSetting('homepage.heroImageId', orig.imageId);
  log('RESTORE_STATUSES:', status1, status2, status3);
  // archive the e2e media so the library stays clean
  const archived = await page.evaluate(async () => {
    const list = await (await fetch('/api/v1/admin/media?kind=IMAGE&perPage=5', { credentials: 'same-origin' })).json();
    const e2e = (list?.data ?? []).find((m) => m.alt === 'E2E hero image');
    if (!e2e) return 'not-found';
    const res = await fetch(`/api/v1/admin/media/${e2e.id}`, {
      method: 'PATCH',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'ARCHIVED' }),
    });
    return res.status;
  });
  log('ARCHIVE_E2E_MEDIA:', archived);
  const finalCheck = await getPublicHome().catch(() => '');
  log('PUBLIC_RESTORED_NO_TEST_SUBTITLE:', !finalCheck.includes('E2E test subtitle 123'));
  log('PAGE_ERRORS:', JSON.stringify(consoleErrors.slice(0, 5)));
  await browser.close();
}
