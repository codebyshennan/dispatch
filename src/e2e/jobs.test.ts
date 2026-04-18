import { test, expect, type Page } from "@playwright/test";

// Wait for Convex data to load past the skeleton state
async function waitForLoaded(page: Page) {
  await page.waitForFunction(
    () => !document.querySelector("main div[style*='pulse']"),
    { timeout: 10000 }
  );
}

test.describe("Job history page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/jobs");
    await waitForLoaded(page);
  });

  test("renders the page heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Thread history" })).toBeVisible();
  });

  test("shows job count or empty state after loading", async ({ page }) => {
    const hasJobs = await page.getByText(/\d+ recent thread/).isVisible().catch(() => false);
    const isEmpty = await page.getByText(/no threads yet|no jobs yet/i).isVisible().catch(() => false);
    expect(hasJobs || isEmpty).toBe(true);
  });

  test("job cards link to individual job pages", async ({ page }) => {
    const firstJobLink = page.locator("a[href^='/jobs/']").first();
    const hasJobs = await firstJobLink.isVisible().catch(() => false);

    if (!hasJobs) {
      // No jobs — verify the empty state "Create one" link exists
      await expect(page.getByRole("link", { name: /create one/i })).toBeVisible();
      return;
    }

    await firstJobLink.click();
    await expect(page).toHaveURL(/\/jobs\/.+/);
  });

  test("job cards show status badges", async ({ page }) => {
    const firstJob = page.locator("a[href^='/jobs/']").first();
    const hasJobs = await firstJob.isVisible().catch(() => false);
    if (!hasJobs) return;

    const statusTexts = ["Draft", "Confirmed", "Running", "Completed", "Cancelled", "Failed"];
    let foundStatus = false;
    for (const status of statusTexts) {
      const badge = page.locator("a[href^='/jobs/']").first().getByText(status);
      if (await badge.isVisible().catch(() => false)) {
        foundStatus = true;
        break;
      }
    }
    expect(foundStatus).toBe(true);
  });

  test("running jobs show a progress bar", async ({ page }) => {
    const hasRunning = await page.getByText("Running").first().isVisible().catch(() => false);
    if (!hasRunning) return;

    const jobCard = page.locator("a[href^='/jobs/']").filter({ has: page.getByText("Running") }).first();
    await expect(jobCard.getByText(/%$/)).toBeVisible();
  });

  test("New job link at bottom navigates to home", async ({ page }) => {
    await page.getByRole("link", { name: /\+ New thread/i }).click();
    await expect(page).toHaveURL("/");
  });
});

test.describe("Job detail page", () => {
  test("navigates to job detail and shows job status", async ({ page }) => {
    await page.goto("/jobs");
    await waitForLoaded(page);

    const firstJobLink = page.locator("a[href^='/jobs/']").first();
    const hasJobs = await firstJobLink.isVisible().catch(() => false);
    if (!hasJobs) {
      test.skip();
      return;
    }

    await firstJobLink.click();
    await expect(page).toHaveURL(/\/jobs\/.+/);

    const statusTexts = ["Draft", "Confirmed", "Running", "Completed", "Cancelled", "Failed", "Completed with failures"];
    let foundStatus = false;
    for (const status of statusTexts) {
      if (await page.getByText(status).isVisible().catch(() => false)) {
        foundStatus = true;
        break;
      }
    }
    expect(foundStatus).toBe(true);
  });

  test("job detail page has a back link to job history", async ({ page }) => {
    await page.goto("/jobs");
    await waitForLoaded(page);

    const firstJobLink = page.locator("a[href^='/jobs/']").first();
    const hasJobs = await firstJobLink.isVisible().catch(() => false);
    if (!hasJobs) {
      test.skip();
      return;
    }

    await firstJobLink.click();
    await expect(page.getByRole("link", { name: /job history|back/i })).toBeVisible();
  });
});
