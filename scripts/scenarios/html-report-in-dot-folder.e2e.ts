import { expect } from "e2e";

import { test, WEB } from "./f4.ts";

test(
  "An explicitly opened HTML report in a dot-prefixed folder renders its contents",
  WEB,
  async ({ f4, app, screen, browser }) => {
    const project = await f4.project("demo", {
      ".reports/report.html": "<!doctype html><html><body><h1>Quarterly report</h1></body></html>",
    });
    const thread = await f4.thread({ project, title: "Review report", messages: ["Start"] });
    await f4.open(thread);
    await expect(screen.getByText("fixture turn complete", { exact: false })).toBeVisible();

    await browser.keyboard.press("Control+p");
    await screen.getByPlaceholder("Search files…").fill("report.html");
    await screen.getByRole("option", "report.html", { exact: false }).tap();

    const document = browser.frameLocator('iframe[title=".reports/report.html"]');
    try {
      await expect(document.locator("body")).toContainText("Quarterly report");
    } finally {
      await app.screenshot("report-preview");
    }
  },
);
