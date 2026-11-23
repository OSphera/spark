import { expect, test } from "../../fixtures";
import { signInAsAdministrator, useOwnAddress } from "../../fixtures";

// Spark (OSphera/spark#2): Message grouping, a row of General's preferences, saved by Save changes.

test.describe("Message grouping", () => {
  test("the administrator chooses how far apart messages group, which Save changes keeps, and goes back to two minutes", async ({ page }) => {
    await useOwnAddress(page);
    await page.goto("/account/edit");
    await signInAsAdministrator(page);
    const grouping = page.getByRole("combobox", { name: "Message grouping" });
    await expect(grouping).toBeVisible();
    const save = page.getByRole("button", { name: "Save changes" });

    await grouping.selectOption({ label: "5 minutes" });
    await save.click();
    await expect(page.getByText("Changes saved")).toBeVisible();
    await page.reload();
    await expect(grouping).toHaveValue("5");

    await grouping.selectOption({ label: "2 minutes" });
    await save.click();
    await page.reload();
    await expect(grouping).toHaveValue("2");
  });
});
