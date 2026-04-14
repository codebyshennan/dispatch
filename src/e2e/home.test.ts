import { test, expect } from "@playwright/test";

test.describe("Home page — chat interface", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("renders the example prompt section", async ({ page }) => {
    await expect(page.getByText(/try asking/i)).toBeVisible();
  });

  test("shows all 5 example prompt buttons", async ({ page }) => {
    const examples = [
      /Update the spending limits for all Marketing team cards/,
      /Set new card limits for the Engineering team/,
      /maximum card limit/i,
      /bulk operation require approval/i,
      /update limits for frozen cards/i,
    ];
    for (const text of examples) {
      await expect(page.getByRole("button", { name: text })).toBeVisible();
    }
  });

  test("textarea is present and accepts input", async ({ page }) => {
    const textarea = page.getByRole("textbox");
    await expect(textarea).toBeVisible();
    await textarea.fill("What is the maximum card limit?");
    await expect(textarea).toHaveValue("What is the maximum card limit?");
  });

  test("Send button is disabled when input is empty", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("Send button becomes enabled when text is typed", async ({ page }) => {
    const textarea = page.getByRole("textbox");
    await textarea.fill("What is the maximum card limit?");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
  });

  test("Send button reverts to disabled when input is cleared", async ({ page }) => {
    const textarea = page.getByRole("textbox");
    await textarea.fill("something");
    await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
    await textarea.clear();
    await expect(page.getByRole("button", { name: "Send" })).toBeDisabled();
  });

  test("clicking an example prompt fills the textarea", async ({ page }) => {
    const exampleBtn = page.getByRole("button", {
      name: /maximum card limit/i,
    });
    await exampleBtn.click();
    const textarea = page.getByRole("textbox");
    await expect(textarea).toHaveValue(/maximum card limit/i);
  });

  test("example prompts remain visible after clicking one (they hide only after sending)", async ({ page }) => {
    await page.getByRole("button", { name: /maximum card limit/i }).click();
    // Clicking an example fills the textarea but the examples stay visible
    // until a message is actually sent (thread becomes non-empty)
    await expect(page.getByText(/try asking/i)).toBeVisible();
    await expect(page.getByRole("textbox")).toHaveValue(/maximum card limit/i);
  });

  test("placeholder text is shown in empty textarea", async ({ page }) => {
    const textarea = page.getByRole("textbox");
    await expect(textarea).toHaveAttribute(
      "placeholder",
      /ask a policy question or describe a bulk operation/i
    );
  });
});
