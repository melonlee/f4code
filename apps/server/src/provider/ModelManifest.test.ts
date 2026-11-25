import { assert, describe, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { ProviderDriverKind } from "@f4code/contracts";
import * as ModelCatalog from "@f4code/provider-core/server/ModelCatalog";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as TestClock from "effect/testing/TestClock";
import { HttpClient, HttpClientResponse } from "effect/http";

import * as ServerConfig from "../config.ts";
import * as ServerSettings from "../serverSettings.ts";
import * as ModelManifest from "./ModelManifest.ts";

describe("resolveProviderCatalog", () => {
  it.each([
    { releasedAt: "2026-01-01", now: "2026-01-01T00:00:00Z", badge: "new" },
    { releasedAt: "2026-01-01", now: "2026-01-07T23:59:59.999Z", badge: "new" },
    { releasedAt: "2026-01-01", now: "2026-01-08T00:00:00Z", badge: undefined },
    { releasedAt: "2026-01-01", now: "2026-02-01T00:00:00Z", badge: undefined },
    { releasedAt: "2026-01-02T00:00:00Z", now: "2026-01-01T00:00:00Z", badge: undefined },
    { releasedAt: undefined, now: "2026-01-01T00:00:00Z", badge: undefined },
    { releasedAt: "invalid", now: "2026-01-01T00:00:00Z", badge: undefined },
  ])("derives the new badge from releasedAt=$releasedAt at $now", ({ releasedAt, now, badge }) => {
    const manifest: ModelManifest.ModelManifestData = {
      version: 1,
      currentModels: {},
      providers: {
        synthetic: {
          profiles: {},
          models: [
            {
              slug: "model-next",
              name: "Model Next",
              status: "current",
              ...(releasedAt === undefined ? {} : { releasedAt }),
            },
            {
              slug: "model-legacy",
              name: "Model Legacy",
              status: "legacy",
              releasedAt: now,
            },
          ],
        },
      },
    };
    const catalog = ModelManifest.resolveProviderCatalog(
      manifest,
      ProviderDriverKind.make("synthetic"),
      Date.parse(now),
    );
    assert.strictEqual(catalog?.models[0]?.badge, badge);
    assert.strictEqual(catalog?.models[1]?.badge, undefined);
  });

  it.effect("expires badges when rereading a cached manifest without a refresh", () => {
    const manifest: ModelManifest.ModelManifestData = {
      version: 1,
      currentModels: {},
      providers: {
        synthetic: {
          profiles: {},
          models: [
            {
              slug: "model-next",
              name: "Model Next",
              status: "current",
              releasedAt: "1970-01-01T00:00:00Z",
            },
          ],
        },
      },
    };
    return Effect.gen(function* () {
      const service = yield* ModelCatalog.ModelCatalog;
      const readCatalog = service.current(ProviderDriverKind.make("synthetic"));
      assert.strictEqual((yield* readCatalog)?.models[0]?.badge, "new");
      yield* TestClock.adjust("7 days");
      assert.strictEqual((yield* readCatalog)?.models[0]?.badge, undefined);
    }).pipe(
      Effect.provide(
        ModelManifest.layerModelCatalog.pipe(
          Layer.provide(
            Layer.succeed(ModelManifest.ModelManifest, {
              current: Effect.succeed(manifest),
              refresh: Effect.die("Catalog reads must not refresh the manifest"),
              forceRefresh: Effect.die("Catalog reads must not refresh the manifest"),
              refreshOnDemand: Effect.die("Catalog reads must not refresh the manifest"),
              refreshInBackground: Effect.die("Catalog reads must not refresh the manifest"),
            }),
          ),
        ),
      ),
    );
  });

  it("rejects invalid catalog references", () => {
    const invalidCatalog = (input: {
      readonly models: NonNullable<ModelManifest.ModelManifestData["providers"]>[string]["models"];
      readonly defaultChat?: string;
    }): ModelManifest.ModelManifestData => ({
      version: 1,
      currentModels: {},
      providers: {
        synthetic: {
          ...(input.defaultChat ? { defaults: { chat: input.defaultChat } } : {}),
          profiles: {},
          models: input.models,
        },
      },
    });

    for (const invalid of [
      invalidCatalog({
        models: [
          { slug: "duplicate", name: "First", status: "current" },
          { slug: "duplicate", name: "Second", status: "current" },
        ],
      }),
      invalidCatalog({
        models: [
          {
            slug: "missing-profile",
            name: "Missing Profile",
            status: "current",
            profile: "missing",
          },
        ],
      }),
      invalidCatalog({
        models: [{ slug: "present", name: "Present", status: "current" }],
        defaultChat: "absent",
      }),
    ]) {
      assert.isNull(
        ModelManifest.resolveProviderCatalog(invalid, ProviderDriverKind.make("synthetic")),
      );
    }
  });
});

const REMOTE_UPDATED_AT = "2099-01-01T00:00:00Z";

const REMOTE_MANIFEST: ModelManifest.ModelManifestData = {
  version: 1,
  updatedAt: REMOTE_UPDATED_AT,
  currentModels: {
    codex: ["remote-model"],
    claudeAgent: ["remote-agent-model"],
  },
};

const REMOTE_CLAUDE_MANIFEST: ModelManifest.ModelManifestData = {
  version: 1,
  updatedAt: REMOTE_UPDATED_AT,
  currentModels: {},
  providers: {
    claudeAgent: {
      profiles: {
        synthetic: {
          adapter: { claudeCode: { effortMap: { extreme: "high" } } },
        },
      },
      models: [
        {
          slug: "remote-only-model",
          name: "Remote Only Model",
          status: "current",
          profile: "synthetic",
        },
      ],
    },
  },
};

const remoteClaudeManifestWithCompatibility = (
  compatibility: unknown,
): ModelManifest.ModelManifestData => ({
  ...REMOTE_CLAUDE_MANIFEST,
  providers: {
    claudeAgent: {
      profiles: REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.profiles,
      models: REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.models.map((model) => ({
        ...model,
        adapter: { claudeCode: compatibility },
      })),
    },
  },
});

const INVALID_REMOTE_MANIFESTS: ReadonlyArray<ModelManifest.ModelManifestData> = [
  {
    ...REMOTE_CLAUDE_MANIFEST,
    providers: {
      claudeAgent: {
        profiles: {
          synthetic: {
            adapter: { claudeCode: { effortMap: { extreme: 123 } } },
          },
        },
        models: REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.models,
      },
    },
  },
  {
    ...REMOTE_CLAUDE_MANIFEST,
    providers: {
      claudeAgent: {
        profiles: {},
        models: REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.models,
      },
    },
  },
  {
    ...REMOTE_CLAUDE_MANIFEST,
    providers: {
      claudeAgent: {
        profiles: REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.profiles,
        models: [
          ...REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.models,
          {
            slug: "remote-only-model",
            name: "Duplicate Remote Model",
            status: "current",
            profile: "synthetic",
          },
        ],
      },
    },
  },
  {
    ...REMOTE_CLAUDE_MANIFEST,
    providers: {
      claudeAgent: {
        defaults: { chat: "absent-model" },
        profiles: REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.profiles,
        models: REMOTE_CLAUDE_MANIFEST.providers!.claudeAgent!.models,
      },
    },
  },
  remoteClaudeManifestWithCompatibility({ minVersion: "2.x" }),
  remoteClaudeManifestWithCompatibility({ maxVersionExclusive: "2.x" }),
  remoteClaudeManifestWithCompatibility({
    minVersion: "2.2",
    maxVersionExclusive: "2.1",
  }),
];

const layerHttpClient = (handler: () => Response) =>
  Layer.succeed(
    HttpClient.HttpClient,
    HttpClient.make((request) => Effect.succeed(HttpClientResponse.fromWeb(request, handler()))),
  );

const layerService = (input: {
  readonly prefix: string;
  readonly response: () => Response;
  readonly settings?: Parameters<typeof ServerSettings.layerTest>[0];
}) =>
  ServerConfig.layerTest(process.cwd(), { prefix: input.prefix }).pipe(
    Layer.provideMerge(NodeServices.layer),
    Layer.provideMerge(ServerSettings.layerTest(input.settings ?? {})),
    Layer.provideMerge(layerHttpClient(input.response)),
  );

describe("ModelManifest service", () => {
  it.effect("does not fetch when provider update checks are disabled", () =>
    Effect.gen(function* () {
      let fetchCount = 0;
      const service = yield* ModelManifest.make.pipe(
        Effect.provide(
          layerHttpClient(() => {
            fetchCount += 1;
            return Response.json(REMOTE_MANIFEST);
          }),
        ),
      );
      assert.deepStrictEqual(yield* service.refresh, ModelManifest.BUNDLED_MODEL_MANIFEST);
      assert.deepStrictEqual(yield* service.forceRefresh, ModelManifest.BUNDLED_MODEL_MANIFEST);
      assert.strictEqual(fetchCount, 0);
    }).pipe(
      Effect.scoped,
      Effect.provide(
        layerService({
          prefix: "model-manifest-optout-test",
          response: () => Response.json(REMOTE_MANIFEST),
          settings: { enableProviderUpdateChecks: false },
        }),
      ),
    ),
  );
});
