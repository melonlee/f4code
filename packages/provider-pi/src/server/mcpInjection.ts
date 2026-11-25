import { tokenizeCliArgs } from "@f4code/shared/cliArgs";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";

import type { ManagedInferenceServer } from "@f4code/provider-core/server/inferenceGateway";
import type {
  InferenceGatewayCredential,
  McpProviderSessionConfig,
} from "@f4code/provider-core/server/mcpSession";
import {
  PI_F4_GATEWAY_EXTENSION_FILENAME,
  PI_F4_GATEWAY_EXTENSION_SOURCE,
  F4_GATEWAY_MODELS_ENV,
  F4_GATEWAY_PROVIDER_ENV,
  F4_GATEWAY_TOKEN_ENV,
  F4_GATEWAY_URL_ENV,
} from "./gatewayExtensionSource.ts";
import type { McpToolProfile } from "@f4code/provider-core/server/mcpToolProfile";
import {
  PI_F4_MCP_EXTENSION_FILENAME,
  PI_F4_MCP_EXTENSION_SOURCE,
  F4_MCP_BEARER_ENV,
  F4_MCP_URL_ENV,
  F4_PI_RUNTIME_MODE_ENV,
  F4_PI_MCP_EXTENSION_PATH_ENV,
  F4_PI_TOOL_PROFILE_ENV,
} from "./mcpExtensionSource.ts";
import type { PiSettings } from "../settings.ts";

const RESERVED_PI_LAUNCH_ARGUMENTS = new Set([
  "--continue",
  "-c",
  "--export",
  "--fork",
  "--help",
  "-h",
  "--list-models",
  "--mode",
  "--no-session",
  "--print",
  "-p",
  "--resume",
  "-r",
  "--session",
  "--session-id",
  "--version",
  "-v",
]);

export const PI_ARGUMENTS_WITH_VALUES = new Set([
  "--api-key",
  "--append-system-prompt",
  "--exclude-tools",
  "-xt",
  "--extension",
  "-e",
  "--model",
  "--models",
  "--name",
  "-n",
  "--prompt-template",
  "--provider",
  "--session-dir",
  "--skill",
  "--system-prompt",
  "--theme",
  "--thinking",
  "--tools",
  "-t",
  "--tui-mode",
  "--use-theme",
]);

const PI_ARGUMENTS_WITHOUT_VALUES = new Set([
  "--approve",
  "-a",
  "--no-approve",
  "-na",
  "--no-builtin-tools",
  "-nbt",
  "--no-context-files",
  "-nc",
  "--no-extensions",
  "-ne",
  "--no-prompt-templates",
  "-np",
  "--no-skills",
  "-ns",
  "--no-themes",
  "--no-tools",
  "-nt",
  "--offline",
  "--verbose",
]);

export type PiLaunchArgsResolution =
  | { readonly ok: true; readonly args: ReadonlyArray<string> }
  | { readonly ok: false; readonly message: string };

function reservedPiArgument(arg: string): string | undefined {
  for (const reserved of RESERVED_PI_LAUNCH_ARGUMENTS) {
    if (arg === reserved || (reserved.startsWith("--") && arg.startsWith(`${reserved}=`))) {
      return reserved;
    }
  }
  return undefined;
}

function normalizePiBuiltInEqualsArguments(args: ReadonlyArray<string>): ReadonlyArray<string> {
  return args.flatMap((arg) => {
    const equalsIndex = arg.indexOf("=");
    if (equalsIndex <= 0) return [arg];
    const option = arg.slice(0, equalsIndex);
    return PI_ARGUMENTS_WITH_VALUES.has(option) ? [option, arg.slice(equalsIndex + 1)] : [arg];
  });
}

export function resolvePiLaunchArgs(launchArgs: string): PiLaunchArgsResolution {
  // Pi treats equals-form tokens as extension flags; split only known built-ins.
  const args = normalizePiBuiltInEqualsArguments(tokenizeCliArgs(launchArgs));
  let hasProvider = false;
  let hasModel = false;
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    const reserved = reservedPiArgument(arg);
    if (reserved !== undefined) {
      return {
        ok: false,
        message: `Pi launch argument '${reserved}' is controlled by F4code and cannot be overridden.`,
      };
    }
    if (arg === "--") {
      return {
        ok: false,
        message: "Pi launch arguments cannot include positional prompts.",
      };
    }
    if (PI_ARGUMENTS_WITH_VALUES.has(arg)) {
      const value = args[index + 1];
      if (value === undefined) {
        return { ok: false, message: `Pi launch argument '${arg}' requires a value.` };
      }
      if (arg === "--provider") hasProvider = true;
      if (arg === "--model") hasModel = true;
      index += 1;
      continue;
    }
    if (PI_ARGUMENTS_WITHOUT_VALUES.has(arg) || (arg.startsWith("--") && arg.includes("="))) {
      continue;
    }
    if (arg.startsWith("--")) {
      // Arbitrary extension flags may consume one following non-flag token.
      if (
        args[index + 1] !== undefined &&
        !args[index + 1]!.startsWith("-") &&
        !args[index + 1]!.startsWith("@")
      ) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith("-")) {
      return { ok: false, message: `Pi launch argument '${arg}' is not supported by F4code.` };
    }
    return {
      ok: false,
      message: `Pi launch arguments cannot include positional prompt '${arg}'.`,
    };
  }
  if (hasProvider && !hasModel) {
    return { ok: false, message: "Pi launch argument '--provider' requires '--model'." };
  }
  return { ok: true, args };
}

function bearerTokenFromAuthorizationHeader(header: string): string {
  return header.startsWith("Bearer ") ? header.slice("Bearer ".length) : header;
}

function normalizedPiPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function hasExplicitExtension(args: ReadonlyArray<string>, extensionPath: string): boolean {
  const wanted = normalizedPiPath(extensionPath);
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg !== "--extension" && arg !== "-e") continue;
    const configured = args[index + 1];
    if (configured !== undefined && normalizedPiPath(configured) === wanted) return true;
    index += 1;
  }
  return false;
}

function withoutExplicitExtensions(args: ReadonlyArray<string>): ReadonlyArray<string> {
  const filtered: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--extension" || arg === "-e") {
      index += 1;
      continue;
    }
    if (arg.startsWith("--extension=") || arg.startsWith("-e=")) continue;
    filtered.push(arg);
  }
  return filtered;
}

function withoutToolSelectionArgs(args: ReadonlyArray<string>): ReadonlyArray<string> {
  const filtered: string[] = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined) continue;
    if (arg === "--tools" || arg === "-t" || arg === "--exclude-tools" || arg === "-xt") {
      index += 1;
      continue;
    }
    if (
      arg === "--no-tools" ||
      arg === "-nt" ||
      arg === "--no-builtin-tools" ||
      arg === "-nbt" ||
      arg.startsWith("--tools=") ||
      arg.startsWith("-t=") ||
      arg.startsWith("--exclude-tools=") ||
      arg.startsWith("-xt=")
    ) {
      continue;
    }
    filtered.push(arg);
  }
  return filtered;
}

function piF4McpExtensionDestPath(cacheDir: string): string {
  return `${cacheDir.replace(/\\/g, "/")}/${PI_F4_MCP_EXTENSION_FILENAME}`;
}

const materializeSource = Effect.fnUntraced(function* (dest: string, source: string) {
  const fs = yield* FileSystem.FileSystem;
  const existing = yield* fs.readFileString(dest).pipe(Effect.orElseSucceed(() => ""));
  if (existing !== source) {
    yield* fs.writeFileString(dest, source);
  }
  return dest;
});

export const materializePiF4McpExtension = Effect.fn("materializePiF4McpExtension")(function* (
  cacheDir: string,
) {
  const fs = yield* FileSystem.FileSystem;
  yield* fs.makeDirectory(cacheDir, { recursive: true });
  const dest = piF4McpExtensionDestPath(cacheDir);
  const existing = yield* fs.readFileString(dest).pipe(Effect.orElseSucceed(() => ""));
  if (existing !== PI_F4_MCP_EXTENSION_SOURCE) {
    // Concurrent pi launches read this file: stage it in a per-call directory
    // and rename so readers and other writers never see a partial file.
    yield* Effect.scoped(
      Effect.gen(function* () {
        const stagingDir = yield* fs.makeTempDirectoryScoped({ directory: cacheDir });
        const staging = `${stagingDir.replace(/\\/g, "/")}/${PI_F4_MCP_EXTENSION_FILENAME}`;
        yield* fs.writeFileString(staging, PI_F4_MCP_EXTENSION_SOURCE);
        yield* fs.rename(staging, dest).pipe(Effect.retry({ times: 3 }));
      }),
    );
  }
  return dest;
});

/** For discovery and text generation, which run without F4's full extension. */
export const materializePiF4GatewayExtension = Effect.fn("materializePiF4GatewayExtension")(
  function* (cacheDir: string) {
    const fs = yield* FileSystem.FileSystem;
    yield* fs.makeDirectory(cacheDir, { recursive: true });
    return yield* materializeSource(
      `${cacheDir.replace(/\\/g, "/")}/${PI_F4_GATEWAY_EXTENSION_FILENAME}`,
      PI_F4_GATEWAY_EXTENSION_SOURCE,
    );
  },
);

export interface PiGatewayLaunch {
  readonly server: ManagedInferenceServer;
  readonly credential: InferenceGatewayCredential;
}

const piGatewayProviderName = (serverId: string) => `f4-${serverId}`;

const PI_THINKING_LEVELS = ["minimal", "low", "medium", "high", "xhigh", "max"] as const;
// Pi's documented defaults for a model that does not say.
const PI_DEFAULT_CONTEXT_WINDOW = 128_000;
const PI_DEFAULT_MAX_TOKENS = 16_384;

/** Pi model configs for registerProvider; a level the server does not advertise is unsupported. */
function piGatewayModels(server: ManagedInferenceServer) {
  return server.models.map((model) => {
    const efforts = new Set(model.reasoningEfforts ?? []);
    return {
      id: model.id,
      name: `${model.id} (${server.displayName})`,
      reasoning: efforts.size > 0,
      ...(efforts.size === 0
        ? {}
        : {
            thinkingLevelMap: Object.fromEntries(
              PI_THINKING_LEVELS.map((level) => [level, efforts.has(level) ? level : null]),
            ),
          }),
      input: model.images === false ? ["text"] : ["text", "image"],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: model.contextWindow ?? PI_DEFAULT_CONTEXT_WINDOW,
      maxTokens: Math.min(
        model.maxOutputTokens ?? PI_DEFAULT_MAX_TOKENS,
        model.contextWindow ?? Number.POSITIVE_INFINITY,
      ),
    };
  });
}

/** An explicit profile wins; "auto" follows the instance's link to an enabled inference server. */
export function resolvePiToolProfile(
  setting: PiSettings["toolProfile"],
  linkedToInferenceServer: boolean,
): McpToolProfile {
  if (setting !== "auto") return setting;
  // GLM-5.3-Flash passed as many mcp-tool-use cases with lean as with full (evals/mcp-tool-use).
  return linkedToInferenceServer ? "lean" : "full";
}

export function buildPiRpcLaunch(input: {
  readonly launchArgs: ReadonlyArray<string>;
  readonly environment: NodeJS.ProcessEnv;
  readonly mcpSession: McpProviderSessionConfig | undefined;
  readonly extensionPath: string | undefined;
  readonly sessionPath?: string | undefined;
  readonly ephemeral?: boolean;
  // F4 stops these processes as soon as they answer. They run --offline because Pi's startup
  // catalog refresh renews expired OAuth tokens, and a stop mid-request loses the rotated one.
  readonly shortLived?: boolean;
  readonly disableExtensions?: boolean;
  readonly disableTools?: boolean;
  /** A managed inference server: registered in Pi as `f4-<serverId>` through F4's gateway. */
  readonly gateway?: PiGatewayLaunch | undefined;
  /** Loaded alone, even under --no-extensions, when F4's full extension is not. */
  readonly gatewayExtensionPath?: string | undefined;
  readonly runtimeMode?: "approval-required" | "auto-accept-edits" | "auto" | "full-access";
  readonly toolProfile?: McpToolProfile;
}): {
  readonly args: ReadonlyArray<string>;
  readonly env: NodeJS.ProcessEnv;
} {
  const hasF4Extension = input.disableExtensions !== true && input.extensionPath !== undefined;
  const hasF4Mcp = hasF4Extension && input.mcpSession !== undefined;
  const extensionSafeArgs =
    input.disableExtensions === true
      ? withoutExplicitExtensions(input.launchArgs)
      : input.launchArgs;
  const launchArgs =
    input.disableTools === true ? withoutToolSelectionArgs(extensionSafeArgs) : extensionSafeArgs;
  const args = [
    "--mode",
    "rpc",
    ...(input.ephemeral === true
      ? ["--no-session"]
      : input.sessionPath !== undefined
        ? ["--session", input.sessionPath]
        : []),
    ...launchArgs,
    ...(input.shortLived === true && !launchArgs.includes("--offline") ? ["--offline"] : []),
    // Restrictions must follow launch args so user flags cannot re-enable unattended tools/extensions.
    ...(input.disableExtensions === true ? ["--no-extensions"] : []),
    ...(input.disableTools === true ? ["--no-tools"] : []),
  ];
  if (
    hasF4Extension &&
    input.extensionPath !== undefined &&
    !hasExplicitExtension(args, input.extensionPath)
  ) {
    args.push("--extension", input.extensionPath);
  }
  const gatewayCarrier = hasF4Extension
    ? "full"
    : input.gateway !== undefined && input.gatewayExtensionPath !== undefined
      ? "gateway-only"
      : undefined;
  if (gatewayCarrier === "gateway-only" && input.gatewayExtensionPath !== undefined) {
    args.push("--extension", input.gatewayExtensionPath);
  }
  const environment = { ...input.environment };
  // MCP credentials belong to this F4 session; discard inherited server/parent credentials.
  for (const name of [
    F4_GATEWAY_URL_ENV,
    F4_GATEWAY_TOKEN_ENV,
    F4_GATEWAY_PROVIDER_ENV,
    F4_GATEWAY_MODELS_ENV,
  ]) {
    delete environment[name];
  }
  delete environment[F4_MCP_URL_ENV];
  delete environment[F4_MCP_BEARER_ENV];
  delete environment[F4_PI_MCP_EXTENSION_PATH_ENV];
  delete environment[F4_PI_TOOL_PROFILE_ENV];

  return {
    args,
    env: {
      ...environment,
      ...(hasF4Extension && input.extensionPath !== undefined
        ? { [F4_PI_MCP_EXTENSION_PATH_ENV]: input.extensionPath }
        : {}),
      ...(hasF4Extension && input.runtimeMode !== undefined
        ? {
            [F4_PI_RUNTIME_MODE_ENV]:
              input.runtimeMode === "auto" ? "approval-required" : input.runtimeMode,
          }
        : {}),
      ...(hasF4Mcp && input.toolProfile !== undefined
        ? { [F4_PI_TOOL_PROFILE_ENV]: input.toolProfile }
        : {}),
      ...(hasF4Mcp && input.mcpSession !== undefined
        ? {
            [F4_MCP_URL_ENV]: input.mcpSession.endpoint,
            [F4_MCP_BEARER_ENV]: bearerTokenFromAuthorizationHeader(
              input.mcpSession.authorizationHeader,
            ),
          }
        : {}),
      ...(gatewayCarrier !== undefined && input.gateway !== undefined
        ? {
            [F4_GATEWAY_URL_ENV]: input.gateway.credential.baseUrl,
            [F4_GATEWAY_TOKEN_ENV]: input.gateway.credential.token,
            [F4_GATEWAY_PROVIDER_ENV]: piGatewayProviderName(input.gateway.server.serverId),
            [F4_GATEWAY_MODELS_ENV]: JSON.stringify(piGatewayModels(input.gateway.server)),
          }
        : {}),
    },
  };
}
