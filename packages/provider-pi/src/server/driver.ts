// User-wide ~/.pi/agent (or ~/.omp/agent) state makes continuation identity use default instance grouping.
import { type ProviderDriverKind, type ServerProvider } from "@f4code/contracts";
import { PiSettings } from "../settings.ts";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import * as ProviderLatestVersions from "@f4code/provider-core/server/ProviderLatestVersions";
import * as ProviderHost from "@f4code/provider-core/server/ProviderHost";
import { makePiUsageReader, piUsageReader } from "./usage.ts";
import { makePiTextGeneration } from "./textGeneration.ts";
import { makePiGatewaySource } from "./gateway.ts";
import { createPiAdapterV2Driver, type PiAdapterV2DriverEnv } from "./adapter.ts";
import { PI_FLAVOR, type PiFlavor } from "./flavor.ts";
import { ProviderDriverError } from "@f4code/provider-core/server/errors";
import {
  buildInitialPiProviderSnapshot,
  checkPiProviderStatus,
  discoverPiCommandsForCwd,
  enrichPiSnapshot,
} from "./status.ts";
import { makeManagedServerProvider } from "@f4code/provider-core/server/managedProvider";
import {
  defaultProviderContinuationIdentity,
  type ProviderDriver,
  type ProviderInstance,
} from "@f4code/provider-core/server/driver";
import type { ServerProviderDraft } from "@f4code/provider-core/server/snapshotProbe";
import { mergeProviderInstanceEnvironment } from "@f4code/provider-core/server/instanceEnvironment";
import {
  makeCachedProviderMaintenanceResolution,
  makePackageManagedProviderMaintenanceResolver,
  resolveProviderMaintenanceCapabilitiesEffect,
} from "@f4code/provider-core/server/maintenanceResolver";
import {
  haveProviderSnapshotSettingsChanged,
  makeProviderSnapshotSettingsSource,
  type ProviderSnapshotSettings,
} from "@f4code/provider-core/server/snapshotSettings";

const decodePiSettings = Schema.decodeSync(PiSettings);

export type PiDriverEnv =
  | PiAdapterV2DriverEnv
  | ProviderHost.ProviderHost
  | ChildProcessSpawner.ChildProcessSpawner
  | FileSystem.FileSystem
  | HttpClient.HttpClient
  | ProviderLatestVersions.ProviderLatestVersions
  | Path.Path;

const withInstanceIdentity =
  (input: {
    readonly driverKind: ProviderDriverKind;
    readonly instanceId: ProviderInstance["instanceId"];
    readonly displayName: string | undefined;
    readonly accentColor: string | undefined;
    readonly continuationGroupKey: string;
  }) =>
  (snapshot: ServerProviderDraft): ServerProvider => ({
    ...snapshot,
    instanceId: input.instanceId,
    driver: input.driverKind,
    ...(input.displayName ? { displayName: input.displayName } : {}),
    ...(input.accentColor ? { accentColor: input.accentColor } : {}),
    continuation: { groupKey: input.continuationGroupKey },
  });

export function createPiDriver(options: {
  readonly flavor: PiFlavor;
  readonly configSchema: typeof PiSettings;
  readonly defaultConfig: () => PiSettings;
}): ProviderDriver<PiSettings, PiDriverEnv, Path.Path> {
  const { flavor, configSchema, defaultConfig } = options;
  const updateResolver = makePackageManagedProviderMaintenanceResolver({
    provider: flavor.driverKind,
    npmPackageName: flavor.npmPackageName,
    ...(flavor.miseTool ? { mise: { tool: flavor.miseTool } } : {}),
    nativeUpdate: { args: ["update", "--self"] },
  });
  const adapterDriver = createPiAdapterV2Driver({
    flavor,
    configSchema,
    defaultConfig,
  });
  const usage =
    flavor.usageProvider === "pi"
      ? piUsageReader
      : makePiUsageReader({
          provider: flavor.usageProvider,
          defaultAgentDirSegments: flavor.defaultAgentDirSegments,
        });

  return {
    driverKind: flavor.driverKind,
    metadata: {
      displayName: flavor.displayName,
      supportsMultipleInstances: true,
    },
    usage,
    configSchema,
    defaultConfig,
    create: Effect.fn(`${flavor.displayName}Driver.create`)(function* ({
      instanceId,
      displayName,
      accentColor,
      environment,
      enabled,
      config,
      inferenceServerId,
    }) {
      const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
      const fileSystem = yield* FileSystem.FileSystem;
      const pathService = yield* Path.Path;
      const httpClient = yield* HttpClient.HttpClient;
      const latestVersions = yield* ProviderLatestVersions.ProviderLatestVersions;
      const host = yield* ProviderHost.ProviderHost;
      // Pi/OMP runs extensions' session_start in its cwd; the server's cwd is $HOME on packaged desktop.
      const probeCwd = pathService.join(host.paths.providerStatusCacheDir, flavor.probeDirName);
      const processEnv = {
        DO_NOT_TRACK: "1",
        ...(yield* mergeProviderInstanceEnvironment(environment)),
      };
      const continuationIdentity = defaultProviderContinuationIdentity({
        driverKind: flavor.driverKind,
        instanceId,
      });
      const stampIdentity = withInstanceIdentity({
        driverKind: flavor.driverKind,
        instanceId,
        displayName,
        accentColor,
        continuationGroupKey: continuationIdentity.continuationKey,
      });
      const effectiveConfig = { ...config, enabled } satisfies PiSettings;
      const resolveMaintenance = yield* makeCachedProviderMaintenanceResolution(
        resolveProviderMaintenanceCapabilitiesEffect(updateResolver, {
          binaryPath: effectiveConfig.binaryPath,
          env: processEnv,
        }).pipe(
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
          Effect.provideService(FileSystem.FileSystem, fileSystem),
          Effect.provideService(Path.Path, pathService),
        ),
      );

      const orchestrationAdapter = yield* adapterDriver
        .create({
          instanceId,
          displayName,
          accentColor,
          environment,
          enabled,
          config,
          inferenceServerId,
        })
        .pipe(
          Effect.mapError(
            (cause) =>
              new ProviderDriverError({
                driver: flavor.driverKind,
                instanceId,
                detail: `Failed to build ${flavor.displayName} orchestration adapter.`,
                cause,
              }),
          ),
        );
      const gatewaySource = yield* makePiGatewaySource(
        instanceId,
        host.paths.providerStatusCacheDir,
      );
      const textGeneration = yield* makePiTextGeneration(
        effectiveConfig,
        processEnv,
        gatewaySource,
        host.compatibility,
        flavor,
      );

      const checkProvider = fileSystem
        .makeDirectory(probeCwd, { recursive: true })
        .pipe(
          Effect.ignore,
          Effect.andThen(
            checkPiProviderStatus(
              effectiveConfig,
              processEnv,
              probeCwd,
              gatewaySource,
              host.compatibility,
              flavor,
            ),
          ),
          Effect.map(stampIdentity),
          Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
        );

      const snapshotSettings = yield* makeProviderSnapshotSettingsSource(effectiveConfig);
      const snapshot = yield* makeManagedServerProvider<ProviderSnapshotSettings<PiSettings>>({
        resolveMaintenance,
        getSettings: snapshotSettings.getSettings,
        streamSettings: snapshotSettings.streamSettings,
        haveSettingsChanged: haveProviderSnapshotSettingsChanged,
        initialSnapshot: (settings) =>
          buildInitialPiProviderSnapshot(settings.provider, flavor).pipe(Effect.map(stampIdentity)),
        checkProvider,
        enrichSnapshot: ({ settings, snapshot: currentSnapshot, publishSnapshot }) =>
          resolveMaintenance().pipe(
            Effect.flatMap((maintenanceCapabilities) =>
              enrichPiSnapshot({
                snapshot: currentSnapshot,
                maintenanceCapabilities,
                enableProviderUpdateChecks: settings.enableProviderUpdateChecks,
                publishSnapshot,
              }),
            ),
            Effect.provideService(HttpClient.HttpClient, httpClient),
            Effect.provideService(ProviderLatestVersions.ProviderLatestVersions, latestVersions),
          ),
      }).pipe(
        Effect.mapError(
          (cause) =>
            new ProviderDriverError({
              driver: flavor.driverKind,
              instanceId,
              detail: `Failed to build ${flavor.displayName} snapshot.`,
              cause,
            }),
        ),
      );

      return {
        instanceId,
        driverKind: flavor.driverKind,
        continuationIdentity,
        displayName,
        accentColor,
        enabled,
        snapshot,
        snapshotForCwd: (workspaceCwd) =>
          !effectiveConfig.enabled
            ? snapshot.getSnapshot
            : Effect.all([
                snapshot.getSnapshot,
                discoverPiCommandsForCwd(effectiveConfig, processEnv, workspaceCwd, flavor).pipe(
                  Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
                  Effect.mapError(
                    (cause) =>
                      new ProviderDriverError({
                        driver: flavor.driverKind,
                        instanceId,
                        detail: `Failed to discover ${flavor.displayName} workspace commands.`,
                        cause,
                      }),
                  ),
                ),
              ]).pipe(
                Effect.map(([machineSnapshot, commands]) => ({
                  ...machineSnapshot,
                  ...commands,
                  slashCommandsPending: false,
                })),
              ),
        orchestrationAdapter,
        textGeneration,
      } satisfies ProviderInstance;
    }),
  };
}

export const PiDriver: ProviderDriver<PiSettings, PiDriverEnv, Path.Path> = createPiDriver({
  flavor: PI_FLAVOR,
  configSchema: PiSettings,
  defaultConfig: () => decodePiSettings({}),
});
