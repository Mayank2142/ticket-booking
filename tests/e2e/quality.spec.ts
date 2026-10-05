import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: "Log in securely" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

async function expectPageQuality(page: Page) {
  const audit = await page.evaluate(() => {
    const visible = (element: Element) => {
      const node = element as HTMLElement;
      const rect = node.getBoundingClientRect();
      return Boolean(node.offsetParent && rect.width && rect.height);
    };
    const ids = [...document.querySelectorAll<HTMLElement>("[id]")].map((element) => element.id);
    return {
      overflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth,
      duplicateIds: ids.filter((id, index) => ids.indexOf(id) !== index),
      unnamedButtons: [...document.querySelectorAll("button")].filter((element) => visible(element) && !element.textContent?.trim() && !element.getAttribute("aria-label")).length,
      unnamedLinks: [...document.querySelectorAll("a")].filter((element) => visible(element) && !element.textContent?.trim() && !element.getAttribute("aria-label")).length,
    };
  });
  expect(audit.overflow).toBeLessThanOrEqual(1);
  expect(audit.duplicateIds).toEqual([]);
  expect(audit.unnamedButtons).toBe(0);
  expect(audit.unnamedLinks).toBe(0);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cinebook:theme", "light"));
});

test("customer mobile journey keeps discovery, city, tickets, saved items, and dialog focus accessible", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, "customer@demo.com");
  await expect(page.getByRole("navigation", { name: "Mobile discovery navigation" })).toBeVisible();
  await expect(page.getByLabel("Select city on mobile")).toBeVisible();

  await page.goto("/bookings");
  for (const name of ["Upcoming", "Previous", "Cancelled"]) await expect(page.getByRole("tab", { name: new RegExp(name) })).toBeVisible();
  const cancel = page.getByRole("button", { name: "Cancel booking" }).first();
  if (await cancel.isVisible().catch(() => false)) {
    await cancel.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Keep booking" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cancel).toBeFocused();
  }
  await expectPageQuality(page);

  await page.goto("/saved");
  await expect(page.getByRole("heading", { name: "Saved events" })).toBeVisible();
  await expectPageQuality(page);
});

test("organiser light-mode journey has responsive lifecycle and reporting controls", async ({ page }) => {
  await login(page, "organiser@demo.com");
  await expect(page.getByRole("heading", { name: "Performance at a glance." })).toBeVisible();
  await expect(page.getByLabel(/Change status for/).first()).toBeVisible();
  await expectPageQuality(page);

  await page.getByRole("link", { name: "All reports" }).click();
  await expect(page.getByRole("heading", { name: "Every confirmed attendee." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await expectPageQuality(page);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByLabel("Select city on mobile")).toBeVisible();
  await expectPageQuality(page);
});

test("administrator light-mode journey exposes operations without accessibility or layout defects", async ({ page }) => {
  await login(page, "admin@demo.com");
  await expect(page.getByRole("heading", { name: "Operations command centre." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maintenance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Email previews" })).toBeVisible();
  await expectPageQuality(page);

  const metricCaption = page.locator(".metric-card span").first();
  await expect(metricCaption).toBeVisible();
  expect(await metricCaption.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(89, 101, 121)");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("navigation", { name: "Mobile discovery navigation" })).toBeVisible();
  await expectPageQuality(page);
});

test("poster failures expose a reusable fallback state without breaking the catalogue", async ({ page }) => {
  await page.route(/\.(?:png|jpe?g|webp)(?:\?.*)?$/i, (route) => route.abort());
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Now Showing in Theatres" })).toBeVisible();
  await expect(page.locator(".poster-image.image-fallback").first()).toBeVisible();
  await expectPageQuality(page);
});
