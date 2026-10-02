import { expect, test } from "@playwright/test";

test("customer can discover a show and open the live seat map", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Discover what’s on" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Summer Concert" }).first()).toBeVisible();
  await expect(page.getByLabel("City")).toContainText("Delhi NCR");
  await expect(page.getByLabel("Language")).toContainText("English");

  await page.getByRole("link", { name: "View Summer Concert" }).first().click();
  await expect(page.getByRole("heading", { name: "Summer Concert", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /select seats/i }).click();
  await expect(page.getByRole("heading", { name: "Choose your seats" })).toBeVisible();
  await expect(page.getByRole("button", { name: /A1, Premium, available/i })).toBeVisible();
});

test("login updates the navigation immediately and favourites remain interactive", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@demo.com");
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: "Log in securely" }).click();

  await expect(page.getByRole("link", { name: "Hi, Customer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  const add = page.getByRole("button", { name: /Add Summer Concert to favourites/i }).first();
  const remove = page.getByRole("button", { name: /Remove Summer Concert from favourites/i }).first();
  if (await add.isVisible().catch(() => false)) {
    await add.click();
    await expect(remove).toBeVisible();
  } else {
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(add).toBeVisible();
  }
});

test("keyboard users can skip directly to the main content", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  const skipLink = page.getByRole("link", { name: "Skip to main content" });
  await expect(skipLink).toBeFocused();
  await skipLink.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});
