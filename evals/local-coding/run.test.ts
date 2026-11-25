import { assert, it } from "@effect/vitest";

import { CASES, gradeDiff, runFixtureChecks } from "./run.ts";

it("has a diverse deterministic set of coding fixtures", () => {
  assert.strictEqual(CASES.length, 12);
  assert.isTrue(new Set(CASES.map((entry) => entry.id)).size === CASES.length);
  assert.isTrue(CASES.some((entry) => entry.kind === "multi-file"));
  assert.isTrue(CASES.some((entry) => entry.kind === "unsupported"));
});

it("rejects an unchanged or unrelated diff for a real edit", () => {
  assert.deepStrictEqual(gradeDiff(CASES[0]!, {}, []), {
    pass: false,
    failures: ["Missing expected file change: src/calculator.py"],
  });
  assert.strictEqual(runFixtureChecks(CASES[0]!, {}).testsPassed, false);
  assert.deepStrictEqual(gradeDiff(CASES[0]!, { "unrelated.txt": "change" }, ["unrelated.txt"]), {
    pass: false,
    failures: [
      "Missing expected file change: src/calculator.py",
      "Unexpected files changed: unrelated.txt",
    ],
  });
});

it("accepts only the allowed supported files, not merely any code change", () => {
  const first = CASES.find((entry) => entry.kind === "multi-file")!;
  assert.strictEqual(
    gradeDiff(
      first,
      Object.fromEntries(first.changedFiles.map((path) => [path, "change"])),
      first.changedFiles,
    ).pass,
    true,
  );
  assert.strictEqual(
    gradeDiff(
      first,
      Object.fromEntries(first.changedFiles.map((path) => [path, ""])),
      first.changedFiles,
    ).pass,
    false,
  );
});

it("grades unsupported capability cases by safe behavior and no edits", () => {
  const entry = CASES.find((candidate) => candidate.kind === "unsupported")!;
  assert.strictEqual(gradeDiff(entry, {}, []).pass, true);
  assert.isTrue(runFixtureChecks(entry, {}).unsupportedHandled);
  assert.strictEqual(runFixtureChecks(entry, { "file.txt": "invented" }).passed, false);
});
