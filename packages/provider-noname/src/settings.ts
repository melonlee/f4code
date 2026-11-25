// Shared with the client settings form; keep schema code browser-safe.
import { CustomModelSetting, makeProviderSettingsSchema, TrimmedString } from "@f4code/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

export const NONAME_DEFAULT_SERVER_URL = "http://127.0.0.1:8890";

export const NoNameSettings = makeProviderSettingsSchema(
  {
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    serverUrl: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Server URL",
        description: "Where NoName runs, as seen from this machine. Blank uses port 8890 here.",
        providerSettingsForm: {
          placeholder: NONAME_DEFAULT_SERVER_URL,
          clearWhenEmpty: "omit",
        },
      }),
    ),
    customModels: Schema.Array(CustomModelSetting).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["serverUrl"],
  },
);
export type NoNameSettings = typeof NoNameSettings.Type;

export function noNameServerUrl(settings: Pick<NoNameSettings, "serverUrl">): string {
  return (settings.serverUrl || NONAME_DEFAULT_SERVER_URL).replace(/\/+$/, "");
}
