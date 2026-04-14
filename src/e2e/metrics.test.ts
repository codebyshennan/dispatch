import { test, expect } from "@playwright/test";

test.describe("Metrics page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/metrics");
  });

  test("renders the page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Metrics" })).toBeVisible();
  });

  test("shows the subtitle", async ({ page }) => {
    await expect(page.getByText("Aggregate usage across all sessions")).toBeVisible();
  });

  test("renders 4 stat cards", async ({ page }) => {
    // Wait for Convex data to load (cards appear after loading state)
    await page.waitForFunction(() => {
      const cards = document.querySelectorAll("main > div > div > div");
      return cards.length >= 4;
    }, { timeout: 10000 });

    await expect(page.getByText(/jobs created/i)).toBeVisible();
    await expect(page.getByText(/ai acceptance rate/i)).toBeVisible();
    await expect(page.getByText(/thumbs up/i)).toBeVisible();
    await expect(page.getByText(/thumbs down/i)).toBeVisible();
  });

  test("Jobs Created stat shows a numeric value", async ({ page }) => {
    await page.waitForFunction(() =>
      !document.querySelector("main div[style*='animation']"),
      { timeout: 10000 }
    );

    // The stat value is a sibling element to the "Jobs created" label
    const jobsSection = page.getByText(/jobs created/i).locator("..");
    const valueText = await jobsSection.getByText(/^\d+$/).first().textContent();
    expect(Number(valueText)).toBeGreaterThanOrEqual(0);
  });

  test("AI acceptance rate shows — or percentage", async ({ page }) => {
    await page.waitForFunction(() =>
      !document.querySelector("main div[style*='animation']"),
      { timeout: 10000 }
    );

    // Value is either "—" (no data) or a percentage like "67%"
    const rateSection = page.getByText(/ai acceptance rate/i).locator("..");
    const value = await rateSection.getByText(/^(—|\d+%)$/).first().textContent();
    expect(value).toMatch(/^(—|\d+%)$/);
  });

  test("feedback sub-label shows up · down format", async ({ page }) => {
    await page.waitForFunction(() =>
      !document.querySelector("main div[style*='animation']"),
      { timeout: 10000 }
    );

    await expect(page.getByText(/\d+ up · \d+ down/)).toBeVisible();
  });
});
