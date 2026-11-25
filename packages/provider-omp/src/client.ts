import { ProviderDriverKind } from "@f4code/contracts";
import { defineProviderClient } from "@f4code/provider-core/client";

import { OmpSettings } from "./settings.ts";

export const ompClient = defineProviderClient({
  driverKind: ProviderDriverKind.make("omp"),
  label: "OMP",
  settingsSchema: OmpSettings,
  icon: {
    viewBox: "0 0 24 24",
    fill: { light: "#0F0F0F", dark: "#F5F5F5" },
    paths: [
      {
        d: "M12 2.5C6.753 2.5 2.5 6.753 2.5 12S6.753 21.5 12 21.5 21.5 17.247 21.5 12 17.247 2.5 12 2.5ZM12 6.25A5.75 5.75 0 1 1 6.25 12 5.756 5.756 0 0 1 12 6.25Z",
        fillRule: "evenodd",
      },
      {
        d: "M12 9.25A2.75 2.75 0 1 0 14.75 12 2.75 2.75 0 0 0 12 9.25Z",
      },
    ],
  },
});
