import { expect, test } from "@playwright/test";

test("customer can discover a show and open the live seat map", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { name: "Now Showing in Theatres" })).toBeVisible();
  await expect(page.getByRole("link", { name: "View Dune: Part Two" }).first()).toBeVisible();
  await expect(page.getByLabel("City", { exact: true })).toContainText("Delhi NCR");
  await expect(page.getByLabel("Language")).toContainText("English");

  await page.getByRole("link", { name: "View Dune: Part Two" }).first().click();
  await expect(page.getByRole("heading", { name: "Dune: Part Two", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: /select seats/i }).click();
  await expect(page.getByRole("heading", { name: "Choose your seats" })).toBeVisible();
  await expect(page.getByRole("button", { name: /A1, Premium, Standard seat,.*available/i })).toBeVisible();
});

test("login updates the navigation immediately and favourites remain interactive", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@demo.com");
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: "Log in securely" }).click();

  await expect(page.getByRole("link", { name: "Hi, Customer" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();

  const add = page.getByRole("button", { name: /Add Dune: Part Two to favourites/i }).first();
  const remove = page.getByRole("button", { name: /Remove Dune: Part Two from favourites/i }).first();
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

test("customer account exposes ticket groups, waitlists, preferences, and security controls", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email address").fill("customer@demo.com");
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: "Log in securely" }).click();
  await expect(page.getByRole("link", { name: "Hi, Customer" })).toBeVisible();

  await page.goto("/bookings");
  await expect(page.getByRole("tab", { name: /Upcoming/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Previous/ })).toBeVisible();
  await expect(page.getByRole("tab", { name: /Cancelled/ })).toBeVisible();

  await page.getByRole("link", { name: "Waitlist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My waitlists" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Active waitlists & offers" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Waitlist history" })).toBeVisible();

  await page.getByRole("link", { name: "Hi, Customer" }).click();
  await expect(page.getByRole("heading", { name: "Profile & preferences" })).toBeVisible();
  await expect(page.getByLabel("Booking and event reminders")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Change password" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Delete account" })).toBeVisible();
});

test("seat map supports arrow keys and a narrow phone viewport", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await expect(page.getByLabel("Select city on mobile")).toBeVisible();
  const href = await page.getByRole("link", { name: /View Dune: Part Two/ }).first().getAttribute("href");
  expect(href).toBeTruthy();
  await page.goto(href!);
  await page.getByRole("button", { name: /select seats/i }).click();
  const first = page.getByRole("button", { name: /A1, Premium/ });
  await first.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("button", { name: /A2, Premium/ })).toBeFocused();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
