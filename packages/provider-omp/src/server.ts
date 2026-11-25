import { ProviderDriverKind } from "@f4code/contracts";
import {
  createPiAdapterV2Driver,
  createPiDriver,
  type PiAdapterV2DriverEnv,
  type PiDriverEnv,
  type PiFlavor,
} from "@f4code/provider-pi/server";
import * as Schema from "effect/Schema";

import { OmpSettings } from "./settings.ts";

export const OMP_PROVIDER = ProviderDriverKind.make("omp");

export const OMP_FLAVOR: PiFlavor = {
  driverKind: OMP_PROVIDER,
  displayName: "OMP",
  binaryName: "omp",
  npmPackageName: "@oh-my-pi/pi-coding-agent",
  probeDirName: "omp-status-probe",
  defaultAgentDirSegments: [".omp", "agent"],
  usageProvider: "omp",
};

const DEFAULT_OMP_SETTINGS = Schema.decodeSync(OmpSettings)({});

export type OmpDriverEnv = PiDriverEnv;
export type OmpAdapterV2DriverEnv = PiAdapterV2DriverEnv;

export const OmpAdapterV2Driver = createPiAdapterV2Driver({
  flavor: OMP_FLAVOR,
  configSchema: OmpSettings,
  defaultConfig: () => DEFAULT_OMP_SETTINGS,
});

export const OmpDriver = createPiDriver({
  flavor: OMP_FLAVOR,
  configSchema: OmpSettings,
  defaultConfig: () => DEFAULT_OMP_SETTINGS,
});
