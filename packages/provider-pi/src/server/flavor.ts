import { ProviderDriverKind, type UsageProviderKind } from "@f4code/contracts";

export interface PiFlavor {
  readonly driverKind: ProviderDriverKind;
  readonly displayName: string;
  readonly binaryName: string;
  readonly npmPackageName: string;
  readonly miseTool?: string;
  readonly probeDirName: string;
  readonly defaultAgentDirSegments: readonly [string, ...string[]];
  readonly usageProvider: UsageProviderKind;
}

export const PI_FLAVOR: PiFlavor = {
  driverKind: ProviderDriverKind.make("pi"),
  displayName: "Pi",
  binaryName: "pi",
  npmPackageName: "@earendil-works/pi-coding-agent",
  miseTool: "pi",
  probeDirName: "pi-status-probe",
  defaultAgentDirSegments: [".pi", "agent"],
  usageProvider: "pi",
};
