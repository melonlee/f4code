import { resolveProviderProbeTimeoutMs } from "@f4code/provider-core/server/snapshotProbe";
import {
  ProviderDriverKind,
  type CustomModelSetting,
  type ServerProvider,
  type ServerProviderModel,
} from "@f4code/contracts";
import type { PiSettings } from "../settings.ts";
import { causeErrorTag } from "@f4code/shared/errorTag";
import { resolveSpawnCommand } from "@f4code/shared/shell";
import {
  brokenVersionDetail,
  noCompatibilityPolicy,
  type ProviderCompatibilityLookup,
} from "@f4code/provider-core/server/compatibility";
import * as Cause from "effect/Cause";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as ChildProcess from "effect/process/ChildProcess";
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner";

import { buildPiRpcLaunch, resolvePiLaunchArgs } from "./mcpInjection.ts";
import {
  type PiBackgroundGateway,
  type PiGatewaySource,
  unmanagedPiGatewaySource,
} from "./gateway.ts";
import {
  makePiRpcConnection,
  PiRpcError,
  PiRpcTimeoutError,
  piRecordField as recordField,
  piRecordString as recordString,
} from "./rpc.ts";
import * as ProviderLatestVersions from "@f4code/provider-core/server/ProviderLatestVersions";
import {
  buildServerProvider,
  DEFAULT_TIMEOUT_MS,
  isCommandMissingCause,
  parseCliVersionResult,
  providerModelsFromSettings,
  providerProbeEnvironment,
  spawnAndCollect,
  type ServerProviderDraft,
} from "@f4code/provider-core/server/snapshotProbe";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "@f4code/provider-core/server/maintenanceResolver";
import { EMPTY_PI_MODEL_CAPABILITIES, piModelCapabilities } from "./modelCapabilities.ts";
import {
  parsePiDiscoveredCommands,
  withPiBuiltinSlashCommands,
  type PiDiscoveredCommands,
} from "./commands.ts";
import { PI_FLAVOR, type PiFlavor } from "./flavor.ts";

const piPresentation = (flavor: PiFlavor) =>
  ({
    displayName: flavor.displayName,
    showInteractionModeToggle: false,
    supportedRuntimeModes: ["approval-required", "auto-accept-edits", "full-access"],
    reportsContextWindow: true,
  }) as const;

const VERSION_PROBE_TIMEOUT_MS = 10_000;
const PI_RPC_DISCOVERY_TIMEOUT_MS = 30_000;
const PI_TEXT_GENERATION_DISCOVERY_TIMEOUT_MS = 5_000;

const decodePiAuthCheck = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Struct({ reason: Schema.optional(Schema.String) })),
);

const piDefaultModel = (flavor: PiFlavor): ServerProviderModel => ({
  slug: "default",
  name: `${flavor.displayName} default`,
  isCustom: false,
  capabilities: EMPTY_PI_MODEL_CAPABILITIES,
});

interface PiDiscovery extends PiDiscoveredCommands {
  readonly models: ReadonlyArray<ServerProviderModel>;
  readonly authenticated: boolean;
  /** Pi's active model when Pi lists no model of its provider, so it cannot start a turn. */
  readonly unavailableActiveModel: { readonly provider: string; readonly id: string } | undefined;
  /** Pi without extensions can load no model, so text generation fails for every entry. */
  readonly textGenerationUnavailable: boolean;
}

function piModelsFromSettings(
  customModels: ReadonlyArray<CustomModelSetting> | undefined,
  discovered: ReadonlyArray<ServerProviderModel> = [],
  flavor: PiFlavor = PI_FLAVOR,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(
    [piDefaultModel(flavor), ...discovered],
    customModels ?? [],
    EMPTY_PI_MODEL_CAPABILITIES,
  );
}

function parseDiscoveredModels(
  data: unknown,
  state: unknown,
): Result.Result<ReadonlyArray<ServerProviderModel>, PiRpcError> {
  const models = recordField(data, "models");
  if (!Array.isArray(models)) {
    return Result.fail(
      new PiRpcError({ operation: "get_available_models", detail: "Invalid model inventory" }),
    );
  }
  const activeModel = recordField(state, "model");
  const activeProvider = recordString(activeModel, "provider");
  const activeModelId = recordString(activeModel, "id");
  const seen = new Set<string>();
  const parsed: Array<ServerProviderModel> = [];
  for (const model of models) {
    const provider = recordString(model, "provider");
    const id = recordString(model, "id");
    if (provider === undefined || id === undefined || provider.trim() === "" || id.trim() === "") {
      return Result.fail(
        new PiRpcError({ operation: "get_available_models", detail: "Invalid model identity" }),
      );
    }
    const slug = `${provider}/${id}`;
    if (seen.has(slug)) continue;
    seen.add(slug);
    parsed.push({
      slug,
      name: recordString(model, "name") ?? slug,
      subProvider: provider,
      isCustom: false,
      capabilities: piModelCapabilities(
        model,
        provider === activeProvider && id === activeModelId
          ? recordString(state, "thinkingLevel")
          : undefined,
      ),
    });
  }
  return Result.succeed(parsed);
}

const makePiDiscoveryConnection = Effect.fnUntraced(function* (
  piSettings: PiSettings,
  environment: NodeJS.ProcessEnv,
  launchArgs: ReadonlyArray<string>,
  cwd?: string,
  textGenerationLaunch = false,
  gateway?: PiBackgroundGateway,
  flavor: PiFlavor = PI_FLAVOR,
) {
  const launch = buildPiRpcLaunch({
    launchArgs,
    environment,
    mcpSession: undefined,
    extensionPath: undefined,
    ephemeral: true,
    disableExtensions: textGenerationLaunch,
    disableTools: textGenerationLaunch,
    shortLived: true,
    gateway,
    gatewayExtensionPath: gateway?.extensionPath,
  });
  const connection = yield* makePiRpcConnection({
    command: piSettings.binaryPath || flavor.binaryName,
    args: launch.args,
    cwd,
    env: launch.env,
  });
  yield* Stream.fromQueue(connection.events).pipe(
    Stream.runDrain,
    Effect.ignore,
    Effect.forkScoped,
  );
  return connection;
});

// A failed response echoes Pi's own `command` field as the operation, so log only names we sent.
const PI_LOGGED_RPC_OPERATIONS = new Set([
  "spawn",
  "read",
  "write",
  "exit",
  "terminate",
  "get_state",
  "get_available_models",
  "get_commands",
]);

const PI_PROJECT_TRUST_ARGUMENTS = new Set(["--approve", "-a", "--no-approve", "-na"]);

const readPiInventory = Effect.fn("PiProviderStatus.readPiInventory")(function* (
  piSettings: PiSettings,
  environment: NodeJS.ProcessEnv,
  launchArgs: ReadonlyArray<string>,
  timeoutMs: number,
  cwd?: string,
  gateway?: PiBackgroundGateway,
  flavor: PiFlavor = PI_FLAVOR,
) {
  const connection = yield* makePiDiscoveryConnection(
    piSettings,
    environment,
    launchArgs,
    cwd,
    false,
    gateway,
    flavor,
  );
  const stateData = yield* connection.request({ type: "get_state" }, timeoutMs);
  const modelsData = yield* connection.request({ type: "get_available_models" }, timeoutMs);
  const commandsData = yield* connection
    .request({ type: "get_commands" }, timeoutMs)
    .pipe(Effect.orElseSucceed(() => undefined));
  return { stateData, modelsData, commandsData };
}, Effect.scoped);

// Text generation disables user extensions, so it cannot load models those extensions register.
// F4 still injects its gateway extension; listing models with that launch tells them apart.
const discoverPiTextGenerationModelSlugs = Effect.fn(
  "PiProviderStatus.discoverPiTextGenerationModelSlugs",
)(function* (
  piSettings: PiSettings,
  environment: NodeJS.ProcessEnv,
  launchArgs: ReadonlyArray<string>,
  cwd?: string,
  gateway?: PiBackgroundGateway,
  flavor: PiFlavor = PI_FLAVOR,
) {
  const connection = yield* makePiDiscoveryConnection(
    piSettings,
    environment,
    launchArgs,
    cwd,
    true,
    gateway,
    flavor,
  );
  const modelsData = yield* connection.request({ type: "get_available_models" });
  const models = yield* Effect.fromResult(parseDiscoveredModels(modelsData, undefined));
  return new Set(models.map((model) => model.slug));
}, Effect.scoped);

const discoverPiViaRpc = Effect.fn("PiProviderStatus.discoverPiViaRpc")(function* (
  piSettings: PiSettings,
  environment: NodeJS.ProcessEnv,
  launchArgs: ReadonlyArray<string>,
  cwd: string | undefined,
  gatewaySource: PiGatewaySource,
  flavor: PiFlavor = PI_FLAVOR,
) {
  const timeoutMs = resolveProviderProbeTimeoutMs(
    flavor.driverKind,
    PI_RPC_DISCOVERY_TIMEOUT_MS,
    environment,
  );
  // Models of a managed server are listed only while Pi holds a credential for its provider.
  const gateway = yield* gatewaySource.forBackground;
  // This optional probe must finish before the normal discovery deadline so
  // it cannot discard an otherwise usable catalog and authentication state.
  const textGenerationModelSlugsFiber = yield* discoverPiTextGenerationModelSlugs(
    piSettings,
    environment,
    launchArgs,
    cwd,
    gateway,
    flavor,
  ).pipe(
    // Pi exits before answering when launch args name a provider only an extension registers.
    Effect.catchIf(
      (error) =>
        error._tag === "PiRpcError" && (error.operation === "read" || error.operation === "exit"),
      () => Effect.succeed(new Set<string>()),
    ),
    Effect.orElseSucceed(() => undefined),
    Effect.timeoutOrElse({
      duration: PI_TEXT_GENERATION_DISCOVERY_TIMEOUT_MS,
      orElse: () => Effect.void,
    }),
    Effect.forkScoped,
  );
  const { stateData, modelsData, commandsData } = yield* readPiInventory(
    piSettings,
    environment,
    launchArgs,
    timeoutMs,
    cwd,
    gateway,
    flavor,
  ).pipe(
    // Pi's RPC mode reads stdin only after session_start, so a startup dialog (an MCP adapter asking
    // to approve a project server) can never be answered and Pi exits. Retry declining project trust
    // unless the user chose a trust mode, so trusted projects keep their project-local models.
    Effect.catchIf(
      (error) =>
        error._tag === "PiRpcError" &&
        (error.operation === "read" || error.operation === "exit") &&
        !launchArgs.some((arg) => PI_PROJECT_TRUST_ARGUMENTS.has(arg)),
      () =>
        readPiInventory(
          piSettings,
          environment,
          [...launchArgs, "--no-approve"],
          timeoutMs,
          cwd,
          gateway,
          flavor,
        ),
    ),
  );
  const discoveredModels = yield* Effect.fromResult(parseDiscoveredModels(modelsData, stateData));
  const { slashCommands, skills } = parsePiDiscoveredCommands(commandsData);
  const textGenerationModelSlugs = yield* Fiber.join(textGenerationModelSlugsFiber);
  // Pi lists only models of providers it holds credentials for, including extension, virtual and
  // --api-key ones. Turns need only the provider's credentials, so uncatalogued model ids still run.
  const activeModel = recordField(stateData, "model");
  const activeProvider = recordString(activeModel, "provider");
  const activeModelId = recordString(activeModel, "id");
  return {
    models:
      textGenerationModelSlugs === undefined
        ? discoveredModels
        : discoveredModels.map((model) =>
            textGenerationModelSlugs.has(model.slug)
              ? model
              : { ...model, supportsTextGeneration: false },
          ),
    slashCommands: withPiBuiltinSlashCommands(slashCommands),
    skills,
    authenticated: discoveredModels.length > 0,
    unavailableActiveModel:
      activeProvider !== undefined &&
      activeModelId !== undefined &&
      !discoveredModels.some((model) => model.subProvider === activeProvider)
        ? { provider: activeProvider, id: activeModelId }
        : undefined,
    textGenerationUnavailable: textGenerationModelSlugs?.size === 0,
  } satisfies PiDiscovery;
}, Effect.scoped);

export const discoverPiCommandsForCwd = Effect.fn("discoverPiCommandsForCwd")(
  function* (
    piSettings: PiSettings,
    environment: NodeJS.ProcessEnv,
    cwd: string,
    flavor: PiFlavor = PI_FLAVOR,
  ) {
    const launchArgs = resolvePiLaunchArgs(piSettings.launchArgs);
    if (!launchArgs.ok) {
      return yield* new PiRpcError({ operation: "launch", detail: launchArgs.message });
    }
    const connection = yield* makePiDiscoveryConnection(
      piSettings,
      providerProbeEnvironment(environment),
      launchArgs.args,
      cwd,
      false,
      undefined,
      flavor,
    );
    // A failed read must not replace a previously usable workspace catalog with an empty one;
    // OMP pushes available_commands_update instead of supporting get_commands.
    const requestCommands = connection.request(
      { type: "get_commands" },
      resolveProviderProbeTimeoutMs(flavor.driverKind, PI_RPC_DISCOVERY_TIMEOUT_MS, environment),
    );
    const commandsData =
      flavor.driverKind === PI_FLAVOR.driverKind
        ? yield* requestCommands
        : yield* requestCommands.pipe(Effect.orElseSucceed(() => undefined));
    const { slashCommands, skills } = parsePiDiscoveredCommands(commandsData);
    return { slashCommands: withPiBuiltinSlashCommands(slashCommands), skills };
  },
  Effect.scoped,
  (effect, _settings, environment, _cwd, flavor = PI_FLAVOR) => {
    const timeoutMs = resolveProviderProbeTimeoutMs(
      flavor.driverKind,
      PI_RPC_DISCOVERY_TIMEOUT_MS,
      environment,
    );
    return effect.pipe(
      Effect.timeoutOrElse({
        duration: timeoutMs,
        orElse: () => Effect.fail(new PiRpcTimeoutError({ operation: "discovery", timeoutMs })),
      }),
    );
  },
);

export const runPiVersionCommand = Effect.fn("PiProviderStatus.runPiVersionCommand")(function* (
  piSettings: PiSettings,
  environment: NodeJS.ProcessEnv,
  cwd?: string,
  flavor: PiFlavor = PI_FLAVOR,
) {
  const command = piSettings.binaryPath || flavor.binaryName;
  const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], {
    env: environment,
  });
  return yield* spawnAndCollect(
    command,
    ChildProcess.make(spawnCommand.command, spawnCommand.args, {
      env: environment,
      shell: spawnCommand.shell,
      ...(cwd === undefined ? {} : { cwd }),
    }),
  );
});

/**
 * Explains why Pi's active model cannot start a turn. Asks `pi auth check` whether credentials
 * are missing, without refreshing or printing them. That command cannot see
 * extension providers or a runtime --api-key, so it only refines Pi's own unavailable verdict,
 * and is skipped when launch args supply the key.
 */
const describeUnavailablePiModel = Effect.fn("PiProviderStatus.describeUnavailablePiModel")(
  function* (
    piSettings: PiSettings,
    environment: NodeJS.ProcessEnv,
    launchArgs: ReadonlyArray<string>,
    model: { readonly provider: string; readonly id: string },
  ) {
    const label = `Pi default (${model.provider}/${model.id})`;
    const unavailable = `${label} uses ${model.provider}, which has no available models in Pi. Choose another model, or check that provider's setup and the Pi launch arguments.`;
    if (launchArgs.includes("--api-key")) {
      return unavailable;
    }
    const command = piSettings.binaryPath || "pi";
    const output = yield* resolveSpawnCommand(
      command,
      ["auth", "check", "--provider", model.provider, "--json", "--no-refresh"],
      { env: environment },
    ).pipe(
      Effect.flatMap((spawnCommand) =>
        spawnAndCollect(
          command,
          ChildProcess.make(spawnCommand.command, spawnCommand.args, {
            env: environment,
            shell: spawnCommand.shell,
          }),
        ),
      ),
      Effect.timeout(resolveProviderProbeTimeoutMs("pi", DEFAULT_TIMEOUT_MS, environment)),
      Effect.option,
    );
    const missingCredentials = Option.exists(
      Option.flatMap(output, (result) => decodePiAuthCheck(result.stdout)),
      (check) => check.reason === "credentials_not_configured",
    );
    return missingCredentials
      ? `${label} has no credentials configured for ${model.provider}. Choose another model, or run \`pi\` in a terminal and use /login or configure its API key.`
      : unavailable;
  },
);

export const buildInitialPiProviderSnapshot = Effect.fn(
  "PiProviderStatus.buildInitialPiProviderSnapshot",
)(function* (
  piSettings: PiSettings,
  flavor: PiFlavor = PI_FLAVOR,
): Effect.fn.Return<ServerProviderDraft> {
  const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
  const models = piModelsFromSettings(piSettings.customModels, [], flavor);
  const presentation = piPresentation(flavor);
  if (!piSettings.enabled) {
    return buildServerProvider({
      presentation,
      enabled: false,
      checkedAt,
      models,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: `${flavor.displayName} is disabled in F4code settings.`,
      },
    });
  }
  return buildServerProvider({
    presentation,
    enabled: true,
    checkedAt,
    models,
    probe: {
      installed: true,
      version: null,
      status: "warning",
      auth: { status: "unknown" },
      message: `Checking ${flavor.displayName} CLI availability...`,
    },
  });
});

export const checkPiProviderStatus = Effect.fn("checkPiProviderStatus")(function* (
  piSettings: PiSettings,
  environment: NodeJS.ProcessEnv = process.env,
  cwd?: string,
  gatewaySource: PiGatewaySource = unmanagedPiGatewaySource,
  compatibility: ProviderCompatibilityLookup = noCompatibilityPolicy,
  flavor: PiFlavor = PI_FLAVOR,
): Effect.fn.Return<ServerProviderDraft, never, ChildProcessSpawner.ChildProcessSpawner> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = piModelsFromSettings(piSettings.customModels, [], flavor);
  const presentation = piPresentation(flavor);

  if (!piSettings.enabled) {
    return buildServerProvider({
      presentation,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: `${flavor.displayName} is disabled in F4code settings.`,
      },
    });
  }

  const probeEnvironment = providerProbeEnvironment(environment);
  const versionResult = yield* runPiVersionCommand(
    piSettings,
    probeEnvironment,
    undefined,
    flavor,
  ).pipe(
    Effect.timeoutOption(
      resolveProviderProbeTimeoutMs(flavor.driverKind, VERSION_PROBE_TIMEOUT_MS, environment),
    ),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning(`${flavor.displayName} CLI health check failed.`, {
      errorTag: error._tag,
    });
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? `${flavor.displayName} CLI (\`${flavor.binaryName}\`) is not installed or not on PATH. Install with \`npm install -g --ignore-scripts ${flavor.npmPackageName}\`.`
          : `Failed to execute ${flavor.displayName} CLI health check.`,
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: `${flavor.displayName} CLI is installed but timed out while running \`${flavor.binaryName} --version\`.`,
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseCliVersionResult(versionOutput);
  if (versionOutput.code !== 0) {
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: `${flavor.displayName} CLI is installed but failed to run.`,
      },
    });
  }

  if (version === null) {
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: `F4code could not determine the ${flavor.displayName} version. Update ${flavor.displayName}, then refresh its status.`,
      },
    });
  }

  // Stop before discovery: releases the policy rates broken persist background
  // set_thinking_level requests as the user's global default.
  const broken = brokenVersionDetail({
    name: flavor.displayName,
    version,
    advisory: yield* compatibility(flavor.driverKind, version),
  });
  if (broken !== undefined) {
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: broken,
      },
    });
  }

  const resolvedLaunchArgs = resolvePiLaunchArgs(piSettings.launchArgs);
  if (!resolvedLaunchArgs.ok) {
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: resolvedLaunchArgs.message,
      },
    });
  }

  const discoveryExit = yield* discoverPiViaRpc(
    piSettings,
    probeEnvironment,
    resolvedLaunchArgs.args,
    cwd,
    gatewaySource,
    flavor,
  ).pipe(
    Effect.timeoutOption(
      resolveProviderProbeTimeoutMs(flavor.driverKind, PI_RPC_DISCOVERY_TIMEOUT_MS, environment),
    ),
    Effect.exit,
  );
  if (Exit.isFailure(discoveryExit)) {
    const failure = Cause.findErrorOption(discoveryExit.cause);
    yield* Effect.logWarning(`${flavor.displayName} RPC discovery failed.`, {
      errorTag: causeErrorTag(discoveryExit.cause),
      ...(Option.isSome(failure) && PI_LOGGED_RPC_OPERATIONS.has(failure.value.operation)
        ? { operation: failure.value.operation }
        : {}),
    });
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "ready",
        auth: { status: "unknown" },
        message: `${flavor.displayName} is available, but F4code could not refresh its models and commands. The live session will retry startup.`,
      },
    });
  }
  if (Option.isNone(discoveryExit.value)) {
    return buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "ready",
        auth: { status: "unknown" },
        message: `${flavor.displayName} is available, but model and command discovery needs interactive input. The live session will handle it.`,
      },
    });
  }

  const discovery = discoveryExit.value.value;
  const models = piModelsFromSettings(piSettings.customModels, discovery.models, flavor);
  const agentDirDisplay = `~/${flavor.defaultAgentDirSegments.join("/")}`;
  const message = !discovery.authenticated
    ? `${flavor.displayName} has no usable models. Run \`${flavor.binaryName}\` in a terminal and use /login, or configure an API key in ${agentDirDisplay}.`
    : discovery.unavailableActiveModel === undefined
      ? undefined
      : yield* describeUnavailablePiModel(
          piSettings,
          probeEnvironment,
          resolvedLaunchArgs.args,
          discovery.unavailableActiveModel,
        );
  return {
    ...buildServerProvider({
      presentation,
      enabled: piSettings.enabled,
      checkedAt,
      models,
      slashCommands: discovery.slashCommands,
      skills: discovery.skills,
      probe: {
        installed: true,
        version,
        // Other Pi/OMP models still work when only the default is unavailable, so keep the picker usable.
        status: discovery.authenticated ? "ready" : "warning",
        auth: {
          status: discovery.authenticated ? "authenticated" : "unauthenticated",
          type: flavor.driverKind,
        },
        ...(message === undefined ? {} : { message }),
      },
    }),
    ...(discovery.textGenerationUnavailable ? { supportsTextGeneration: false } : {}),
  };
});

export const enrichPiSnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
}): Effect.Effect<
  void,
  never,
  HttpClient.HttpClient | ProviderLatestVersions.ProviderLatestVersions
> => {
  const { snapshot, publishSnapshot } = input;
  return enrichProviderSnapshotWithVersionAdvisory(snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
    Effect.catchCause((cause) =>
      Effect.logWarning("Pi version advisory enrichment failed", {
        errorTag: causeErrorTag(cause),
      }),
    ),
    Effect.asVoid,
  );
};
