import { expect } from "e2e";

import { test, WEB } from "./f4.ts";

test(
  "An expanded command shows the JSON line it printed, keys and all",
  WEB,
  async ({ f4, app, screen }) => {
    const project = await f4.project("demo");
    const thread = await f4.thread({
      project,
      title: "JSON output",
      messages: ["Print the JSON"],
      model: "command-output",
    });
    await f4.open(thread);

    await expect(screen.getByText("The command printed one JSON line.")).toBeVisible();
    await screen.getByRole("button", "Worked for", { exact: false }).tap();
    await screen.getByRole("button", "node -e", { exact: false }).first().tap();
    await app.screenshot("expanded");
    await expect(screen.getByText('"requestId":"keep-me"', { exact: false })).toBeVisible();
  },
);
