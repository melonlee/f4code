// Shared with the client settings form; keep schema code browser-safe.
import {
  CustomModelSetting,
  makeBinaryPathSetting,
  makeProviderSettingsSchema,
  TrimmedString,
} from "@f4code/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const OmpSettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("omp").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the Oh My Pi (omp) coding agent binary.",
        providerSettingsForm: { placeholder: "omp", clearWhenEmpty: "omit" },
      }),
    ),
    launchArgs: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Launch arguments",
        description: "Additional CLI arguments passed to omp --mode rpc on session start.",
        providerSettingsForm: { clearWhenEmpty: "omit" },
      }),
    ),
    toolProfile: Schema.Literals(["auto", "full", "lean"]).pipe(
      Schema.withDecodingDefault(Effect.succeed("auto")),
      Schema.annotateKey({
        title: "F4 tools",
        description:
          "Lean offers only orchestration, thread, project and worktree tools, which leaves more context for local models.",
        providerSettingsForm: {
          control: "select",
          options: [
            { value: "auto", label: "Automatic" },
            { value: "full", label: "Full" },
            { value: "lean", label: "Lean" },
          ],
        },
      }),
    ),
    customModels: Schema.Array(CustomModelSetting).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "launchArgs", "toolProfile"],
  },
);
export type OmpSettings = typeof OmpSettings.Type;
