import { expect } from "e2e";

import { test, WEB } from "./f4.ts";

test(
  "A seeded thread opens by its link and shows its history",
  WEB,
  async ({ f4, app, screen }) => {
    const project = await f4.project("demo");
    const thread = await f4.thread({
      project,
      title: "Earlier work",
      messages: ["first", "second"],
    });
    await f4.open(thread);

    await expect(screen.getByText("second fixture turn complete", { exact: false })).toBeVisible();
    await app.screenshot("thread");
  },
);
