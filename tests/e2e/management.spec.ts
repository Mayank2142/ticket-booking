import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, email: string) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.locator('input[name="password"]').fill("password123");
  await page.getByRole("button", { name: "Log in securely" }).click();
  await expect(page.getByRole("button", { name: "Log out" })).toBeVisible();
}

test("organiser manages owned shows and opens filtered reporting", async ({ page }) => {
  await login(page, "organiser@demo.com");
  await expect(page.getByRole("heading", { name: "Performance at a glance." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Your listings" })).toBeVisible();
  await expect(page.getByLabel(/Change status for/).first()).toBeVisible();
  await page.getByRole("link", { name: "All reports" }).click();
  await expect(page.getByRole("heading", { name: "Every confirmed attendee." })).toBeVisible();
  await expect(page.getByRole("button", { name: "Export CSV" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Apply filters" })).toBeVisible();
});

test("administrator can operate the platform without database access", async ({ page }) => {
  await login(page, "admin@demo.com");
  await expect(page.getByRole("heading", { name: "Operations command centre." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Managed cities" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Auditoriums" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Users and roles" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Maintenance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Administrator audit log" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Run now" })).toBeVisible();
});

test("customer light mode keeps ticket controls, saved events, and alert feedback visible", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("cinebook:theme", "light"));
  await login(page, "customer@demo.com");
  await page.goto("/bookings");
  for (const name of ["Upcoming", "Previous", "Cancelled"]) await expect(page.getByRole("tab", { name: new RegExp(name) })).toBeVisible();
  const activeColor = await page.getByRole("tab", { name: /Upcoming/ }).evaluate((element) => getComputedStyle(element).color);
  expect(activeColor).not.toBe("rgba(0, 0, 0, 0)");
  const cancel = page.getByRole("button", { name: "Cancel booking" }).first();
  if (await cancel.isVisible().catch(() => false)) {
    expect(await cancel.evaluate((element) => getComputedStyle(element).color)).not.toBe("rgba(0, 0, 0, 0)");
  }
  await page.goto("/saved");
  await expect(page.getByRole("heading", { name: "Saved events" })).toBeVisible();
  await page.goto("/");
  await page.getByPlaceholder("you@example.com").fill("browser-alert@example.com");
  await page.getByRole("button", { name: "Activate alerts" }).click();
  await expect(page.getByRole("status")).toContainText(/Email alert/i);
  await expect(page.getByText("Atomic seat lock engine")).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
