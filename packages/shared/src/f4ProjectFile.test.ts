import * as Schema from "effect/Schema";
import { describe, expect, it } from "vite-plus/test";

import { parseF4ProjectFile, F4ProjectFileFromJson } from "./f4ProjectFile.ts";

const decodeJson = Schema.decodeUnknownSync(F4ProjectFileFromJson);

describe("F4ProjectFileFromJson", () => {
  it("decodes lenient JSONC with comments and trailing commas", () => {
    const decoded = decodeJson(`{
      // team scripts
      "iconPath": "assets/logo.svg",
      "scripts": [
        { "name": "Dev", "command": "pnpm dev", "stopOnSettle": true, },
      ],
    }`);

    expect(decoded.iconPath).toBe("assets/logo.svg");
    expect(decoded.scripts?.[0]).toEqual({ name: "Dev", command: "pnpm dev", stopOnSettle: true });
  });
});

describe("parseF4ProjectFile", () => {
  it("reads project defaults from JSONC with a URL in a block comment", () => {
    expect(
      parseF4ProjectFile(`{
        /* See https://f4code.dev/schema/f4.json */
        "defaultThreadEnvMode": "worktree"
      }`),
    ).toEqual({ defaultThreadEnvMode: "worktree" });
  });
});
