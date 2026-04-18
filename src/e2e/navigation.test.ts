import { test, expect } from "@playwright/test";

test.describe("Navigation", () => {
  test("nav header is present on every page", async ({ page }) => {
    for (const path of ["/", "/jobs", "/metrics"]) {
      await page.goto(path);
      await expect(page.getByRole("link", { name: /Dispatch \/ ops/i })).toBeVisible();
      await expect(page.getByRole("link", { name: "New thread" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Thread history" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Metrics" })).toBeVisible();
    }
  });

  test("active nav link is highlighted on home page", async ({ page }) => {
    await page.goto("/");
    const newJobLink = page.getByRole("link", { name: "New job" });
    // Active link has non-transparent background (elevated style)
    const bg = await newJobLink.evaluate((el) => getComputedStyle(el).background);
    expect(bg).not.toBe("rgba(0, 0, 0, 0)");
  });

  test("clicking Job history navigates to /jobs", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Job history" }).click();
    await expect(page).toHaveURL(/\/jobs/);
    await expect(page.getByRole("heading", { name: "Job history" })).toBeVisible();
  });

  test("clicking Metrics navigates to /metrics", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Metrics" }).click();
    await expect(page).toHaveURL(/\/metrics/);
    await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  });

  test("clicking Dispatch logo returns to home", async ({ page }) => {
    await page.goto("/jobs");
    await page.getByRole("link", { name: /Dispatch \/ ops/i }).click();
    await expect(page).toHaveURL("/");
  });

  test("theme toggle button is present on every page", async ({ page }) => {
    for (const path of ["/", "/jobs", "/metrics"]) {
      await page.goto(path);
      const themeToggle = page.getByRole("button", { name: /switch to (light|dark) mode/i });
      await expect(themeToggle).toBeVisible();
    }
  });

  test("theme toggle switches between light and dark mode", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /switch to light mode/i });
    await toggle.click();
    await expect(page.getByRole("button", { name: /switch to dark mode/i })).toBeVisible();
    // Toggle back
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await expect(page.getByRole("button", { name: /switch to light mode/i })).toBeVisible();
  });

  test("page title is Dispatch Ops on all routes", async ({ page }) => {
    for (const path of ["/", "/jobs", "/metrics"]) {
      await page.goto(path);
      await expect(page).toHaveTitle("Dispatch Ops");
    }
  });

  test("no critical console errors on any page", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !msg.text().includes("favicon.ico")) {
        errors.push(msg.text());
      }
    });

    for (const path of ["/", "/jobs", "/metrics"]) {
      await page.goto(path);
      await page.waitForTimeout(500);
    }

    expect(errors).toHaveLength(0);
  });
});
