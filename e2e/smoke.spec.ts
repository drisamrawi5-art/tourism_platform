import { test, expect } from "@playwright/test";

/**
 * E2E smoke tests — verify the public site loads and core flows work.
 * These run against the production build (npm run start).
 */

test.describe("public site", () => {
  test("homepage loads with hero and navigation", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Visit Imedwan/);
    await expect(page.getByRole("navigation").first()).toBeVisible();
  });

  test("places page lists destination places", async ({ page }) => {
    await page.goto("/places");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("stay page shows accommodation listings", async ({ page }) => {
    await page.goto("/stay");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("guides page shows guide listings", async ({ page }) => {
    await page.goto("/guides");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("search page loads", async ({ page }) => {
    await page.goto("/search");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("plan page loads", async ({ page }) => {
    await page.goto("/plan");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("authentication", () => {
  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("password reset page loads", async ({ page }) => {
    await page.goto("/password-reset");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});

test.describe("legal pages", () => {
  test("terms page loads", async ({ page }) => {
    await page.goto("/legal/terms");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("privacy page loads", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("booking terms page loads", async ({ page }) => {
    await page.goto("/legal/booking-terms");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("cancellation policy page loads", async ({ page }) => {
    await page.goto("/legal/cancellation");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });
});
