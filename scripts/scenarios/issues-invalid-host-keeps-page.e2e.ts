import { expect } from "e2e";

import { test, WEB } from "./f4.ts";

test("An invalid host filter keeps the Issues page open", WEB, async ({ f4, app, browser }) => {
  await f4.project("demo");
  await f4.open("/issues?host=true");

  await app.screenshot("issues-invalid-host");
  await expect(browser.locator("h1")).toHaveText("Issues");
});
