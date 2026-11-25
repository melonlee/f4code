import type {
  DesktopHostSnapshot,
  HostPowerSnapshot,
  ResourceMonitorSnapshotEvent,
  ResourceMonitorHealth,
  ResourceMonitorHistoryInput,
  ResourceMonitorRetryResult,
  ResourceMonitorSnapshot,
} from "@f4code/contracts";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as PubSub from "effect/PubSub";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Scope from "effect/Scope";
import * as Semaphore from "effect/Semaphore";
import * as Stream from "effect/Stream";

import * as DesktopHostChannel from "./DesktopHostChannel.ts";
import {
  emptyMonitorCounters,
  mergeProcesses,
  type ProcessState,
  type MonitorCounters,
} from "./Model.ts";
import * as NativeMonitorClient from "./NativeMonitorClient.ts";
import * as ResourceAttribution from "./ResourceAttribution.ts";
import {
  buildResourceMonitorHistory,
  normalizeResourceMonitorHistoryInput,
  type ResourceMonitorHistoryWithLegacyBuckets,
} from "./ResourceMonitorHistory.ts";
import { subscribeBeforeSnapshot } from "../utils/subscribeBeforeSnapshot.ts";

export class ResourceMonitorRefreshFailed extends Schema.TaggedError<ResourceMonitorRefreshFailed>()(
  "ResourceMonitorRefreshFailed",
  {
    operation: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Resource monitoring operation '${this.operation}' failed.`;
  }
}

export class ResourceMonitor extends Context.Service<
  ResourceMonitor,
  {
    readonly latest: Effect.Effect<ResourceMonitorSnapshot>;
    readonly changes: Stream.Stream<ResourceMonitorSnapshot>;
    readonly subscribe: Effect.Effect<
      {
        readonly latest: ResourceMonitorSnapshot;
        readonly changes: Stream.Stream<ResourceMonitorSnapshot>;
      },
      never,
      Scope.Scope
    >;
    readonly readHistory: (
      input: ResourceMonitorHistoryInput,
    ) => Effect.Effect<ResourceMonitorHistoryWithLegacyBuckets>;
    readonly refresh: Effect.Effect<ResourceMonitorSnapshot, ResourceMonitorRefreshFailed>;
    readonly retry: Effect.Effect<ResourceMonitorRetryResult>;
  }
>()("f4/resourceMonitor/ResourceMonitor") {}

interface MonitorState {
  readonly nativeSnapshot: Option.Option<ResourceMonitorSnapshotEvent>;
  readonly desktopSnapshot: Option.Option<DesktopHostSnapshot>;
  readonly previous: ReadonlyMap<string, ProcessState>;
  readonly counters: MonitorCounters;
  readonly latest: ResourceMonitorSnapshot;
  readonly lastNativeSequence: number;
  readonly lastNativeGeneration: number;
}

interface LiveMonitorState {
  readonly retainCount: number;
  readonly scope: Option.Option<Scope.Closeable>;
}

function unknownPower(updatedAt: DateTime.Utc): HostPowerSnapshot {
  return {
    source: "unknown",
    idle: "unknown",
    idleSeconds: null,
    locked: "unknown",
    suspended: false,
    onBattery: "unknown",
    lowPowerMode: "unknown",
    thermalState: "unknown",
    stale: true,
    updatedAt,
  };
}

function buildHealth(input: {
  readonly native: NativeMonitorClient.NativeMonitorClientHealth;
  readonly desktop: DesktopHostChannel.DesktopHostChannelHealth;
  readonly nativeSnapshot: Option.Option<ResourceMonitorSnapshotEvent>;
}): ResourceMonitorHealth {
  return {
    native: {
      status: input.native.status,
      lastSampleAt: input.native.lastSampleAt,
      lastError: input.native.lastError,
    },
    desktop: {
      status: input.desktop.status,
      lastSampleAt: input.desktop.lastSampleAt,
      lastError: input.desktop.lastError,
    },
    sidecarVersion: Option.map(input.native.hello, (hello) => hello.sidecarVersion),
    sidecarPid: Option.map(input.native.hello, (hello) => hello.sidecarPid),
    restartCount: input.native.restartCount,
    collectionDurationMicros: Option.match(input.nativeSnapshot, {
      onNone: () => 0,
      onSome: (snapshot) => snapshot.collectionDurationMicros,
    }),
    scannedProcessCount: Option.match(input.nativeSnapshot, {
      onNone: () => 0,
      onSome: (snapshot) => snapshot.scannedProcessCount,
    }),
    retainedProcessCount: Option.match(input.nativeSnapshot, {
      onNone: () => 0,
      onSome: (snapshot) => snapshot.retainedProcessCount,
    }),
    inaccessibleProcessCount: Option.match(input.nativeSnapshot, {
      onNone: () => 0,
      onSome: (snapshot) => snapshot.inaccessibleProcessCount,
    }),
  };
}

/** @public */
export const make = Effect.fn("resourceMonitor.resourceMonitor.make")(function* () {
  const nativeClient = yield* NativeMonitorClient.NativeMonitorClient;
  const desktopReceiver = yield* DesktopHostChannel.DesktopHostChannel;
  const attribution = yield* ResourceAttribution.ResourceAttribution;
  const mutex = yield* Semaphore.make(1);
  const changes = yield* PubSub.sliding<ResourceMonitorSnapshot>(8);
  const initialReadAt = yield* DateTime.now;
  const nativeHealthSubscription = yield* nativeClient.subscribeHealth;
  const desktopHealthSubscription = yield* desktopReceiver.subscribeHealth;
  const desktopSubscription = yield* desktopReceiver.subscribe;
  const initialDesktop = desktopSubscription.latest;
  if (Option.isSome(initialDesktop)) {
    const electronRoot = initialDesktop.value.electronProcesses.find(
      (process) => process.pid === initialDesktop.value.electronPid,
    );
    yield* nativeClient
      .setExternalProcesses([
        {
          pid: initialDesktop.value.electronPid,
          ...(electronRoot === undefined ? {} : { startTimeMs: electronRoot.creationTimeMs }),
        },
      ])
      .pipe(Effect.ignore);
    yield* nativeClient.setHostPowerState(initialDesktop.value.power).pipe(Effect.ignore);
  }
  const initialNativeHealth = nativeHealthSubscription.latest;
  const initialDesktopHealth = desktopHealthSubscription.latest;
  const initialAttribution = yield* attribution.snapshot;
  const initialMerge = mergeProcesses({
    serverPid: process.pid,
    sidecarPid: Option.map(initialNativeHealth.hello, (hello) => hello.sidecarPid),
    fallbackSampledAtMs: DateTime.toEpochMillis(initialReadAt),
    nativeSnapshot: Option.none(),
    desktopSnapshot: initialDesktop,
    previous: new Map(),
    counters: emptyMonitorCounters(),
    updatePrevious: false,
  });
  const initialSnapshot: ResourceMonitorSnapshot = {
    readAt: initialReadAt,
    sampleIntervalMs: initialNativeHealth.sampleIntervalMs,
    processes: initialMerge.processes,
    groups: initialMerge.groups,
    power: Option.match(initialDesktop, {
      onNone: () => unknownPower(initialReadAt),
      onSome: (desktop) => desktop.power,
    }),
    speedLimitPercent: Option.flatMap(initialDesktop, (desktop) => desktop.speedLimitPercent),
    attribution: initialAttribution,
    health: buildHealth({
      native: initialNativeHealth,
      desktop: initialDesktopHealth,
      nativeSnapshot: Option.none(),
    }),
  };
  const state = yield* Ref.make<MonitorState>({
    nativeSnapshot: Option.none(),
    desktopSnapshot: initialDesktop,
    previous: new Map(),
    counters: emptyMonitorCounters(),
    latest: initialSnapshot,
    lastNativeSequence: 0,
    lastNativeGeneration: initialNativeHealth.restartCount,
  });
  const liveState = yield* Ref.make<LiveMonitorState>({
    retainCount: 0,
    scope: Option.none(),
  });
  const liveMutex = yield* Semaphore.make(1);
  const refreshHealth = mutex.withPermits(1)(
    Effect.gen(function* () {
      const current = yield* Ref.get(state);
      const [nativeHealth, desktopHealth] = yield* Effect.all([
        nativeClient.health,
        desktopReceiver.health,
      ]);
      const snapshot: ResourceMonitorSnapshot = {
        ...current.latest,
        health: buildHealth({
          native: nativeHealth,
          desktop: desktopHealth,
          nativeSnapshot: current.nativeSnapshot,
        }),
      };
      yield* Ref.set(state, {
        ...current,
        latest: snapshot,
      });
      if ((yield* Ref.get(liveState)).retainCount > 0) {
        yield* PubSub.publish(changes, snapshot);
      }
    }),
  );

  const rebuild = (input: {
    readonly nativeSnapshot?: NativeMonitorClient.NativeMonitorSnapshot;
    readonly desktopSnapshot?: DesktopHostSnapshot;
    readonly updatePrevious: boolean;
    readonly publishWhenLive?: boolean;
  }): Effect.Effect<ResourceMonitorSnapshot> =>
    mutex.withPermits(1)(
      Effect.gen(function* () {
        const current = yield* Ref.get(state);
        const nativeHealth = yield* nativeClient.health;
        const incomingNativeSnapshot = input.nativeSnapshot;
        if (
          incomingNativeSnapshot &&
          (incomingNativeSnapshot.generation < nativeHealth.restartCount ||
            incomingNativeSnapshot.generation < current.lastNativeGeneration ||
            (incomingNativeSnapshot.generation === current.lastNativeGeneration &&
              incomingNativeSnapshot.snapshot.sequence <= current.lastNativeSequence))
        ) {
          return current.latest;
        }
        const nativeSnapshot = incomingNativeSnapshot
          ? Option.some(incomingNativeSnapshot.snapshot)
          : current.nativeSnapshot;
        const desktopSnapshot = input.desktopSnapshot
          ? Option.some(input.desktopSnapshot)
          : current.desktopSnapshot;
        const [desktopHealth, attributionSnapshot] = yield* Effect.all([
          desktopReceiver.health,
          attribution.snapshot,
        ]);
        const recordedElectronRoots = Option.match(nativeSnapshot, {
          onNone: () => [],
          onSome: (snapshot) => snapshot.externalProcesses ?? [],
        });
        const electronRootPids = new Set(recordedElectronRoots.map((process) => process.pid));
        Option.match(desktopSnapshot, {
          onNone: () => undefined,
          onSome: (desktop) => electronRootPids.add(desktop.electronPid),
        });
        const electronRootStartTimes = new Map(
          recordedElectronRoots.flatMap((process) =>
            process.startTimeMs === undefined ? [] : [[process.pid, process.startTimeMs] as const],
          ),
        );
        const merged = mergeProcesses({
          serverPid: process.pid,
          sidecarPid: Option.map(nativeHealth.hello, (hello) => hello.sidecarPid),
          fallbackSampledAtMs: DateTime.toEpochMillis(current.latest.readAt),
          nativeSnapshot,
          desktopSnapshot,
          electronRootPids,
          electronRootStartTimes,
          previous: current.previous,
          counters: current.counters,
          updatePrevious: input.updatePrevious,
        });
        const readAt = DateTime.makeUnsafe(merged.sampledAtMs);
        const snapshot: ResourceMonitorSnapshot = {
          readAt,
          sampleIntervalMs: nativeHealth.sampleIntervalMs,
          processes: merged.processes,
          groups: merged.groups,
          power: Option.match(desktopSnapshot, {
            onNone: () => unknownPower(readAt),
            onSome: (desktop) => desktop.power,
          }),
          speedLimitPercent: Option.match(desktopSnapshot, {
            onNone: () => Option.none(),
            onSome: (desktop) => desktop.speedLimitPercent,
          }),
          attribution: attributionSnapshot,
          health: buildHealth({
            native: nativeHealth,
            desktop: desktopHealth,
            nativeSnapshot,
          }),
        };
        yield* Ref.set(state, {
          nativeSnapshot,
          desktopSnapshot,
          previous: merged.previous,
          counters: merged.counters,
          latest: snapshot,
          lastNativeSequence:
            incomingNativeSnapshot?.snapshot.sequence ?? current.lastNativeSequence,
          lastNativeGeneration: incomingNativeSnapshot?.generation ?? current.lastNativeGeneration,
        });
        if (!input.publishWhenLive || (yield* Ref.get(liveState)).retainCount > 0) {
          yield* PubSub.publish(changes, snapshot);
        }
        return snapshot;
      }),
    );

  const ingestNative = (snapshot: NativeMonitorClient.NativeMonitorSnapshot) =>
    rebuild({ nativeSnapshot: snapshot, updatePrevious: true });
  const ingestDesktop =
    /* Desktop samples arrive continuously; avoid a span per monitor sample. */
    Effect.fnUntraced(function* (snapshot: DesktopHostSnapshot) {
      const electronRoot = snapshot.electronProcesses.find(
        (process) => process.pid === snapshot.electronPid,
      );
      yield* nativeClient
        .setExternalProcesses([
          {
            pid: snapshot.electronPid,
            ...(electronRoot === undefined ? {} : { startTimeMs: electronRoot.creationTimeMs }),
          },
        ])
        .pipe(Effect.ignore);
      yield* nativeClient.setHostPowerState(snapshot.power).pipe(Effect.ignore);
      return yield* rebuild({
        desktopSnapshot: snapshot,
        updatePrevious: false,
        publishWhenLive: true,
      });
    });

  yield* desktopSubscription.changes.pipe(
    Stream.runForEach((snapshot) => ingestDesktop(snapshot)),
    Effect.forkScoped,
  );

  const acquireLive = liveMutex.withPermits(1)(
    Effect.uninterruptible(
      Effect.gen(function* () {
        const current = yield* Ref.get(liveState);
        if (current.retainCount > 0) {
          yield* Ref.set(liveState, { ...current, retainCount: current.retainCount + 1 });
          return;
        }

        const scope = yield* Scope.make();
        yield* desktopReceiver.setDiagnosticsDemand(true).pipe(Effect.ignore);
        yield* nativeClient.snapshots.pipe(
          Stream.runForEach(ingestNative),
          Effect.catch((error) =>
            Effect.logWarning("Native resource monitoring stream stopped", {
              cause: error.message,
            }),
          ),
          Effect.forkIn(scope),
        );
        yield* nativeClient.sampleNow.pipe(
          Effect.flatMap(ingestNative),
          Effect.ignore,
          Effect.forkIn(scope),
        );
        yield* Ref.set(liveState, { retainCount: 1, scope: Option.some(scope) });
      }),
    ),
  );

  const releaseLive = liveMutex.withPermits(1)(
    Effect.gen(function* () {
      const current = yield* Ref.get(liveState);
      if (current.retainCount <= 1) {
        yield* Ref.set(liveState, { retainCount: 0, scope: Option.none() });
        if (Option.isSome(current.scope)) {
          yield* Scope.close(current.scope.value, Exit.void).pipe(Effect.ignore);
        }
        yield* desktopReceiver.setDiagnosticsDemand(false).pipe(Effect.ignore);
        return;
      }
      yield* Ref.set(liveState, { ...current, retainCount: current.retainCount - 1 });
    }),
  );

  const latest = Ref.get(state).pipe(Effect.map((current) => current.latest));
  const subscribe = subscribeBeforeSnapshot(
    changes,
    Effect.acquireRelease(acquireLive, () => releaseLive).pipe(Effect.andThen(latest)),
    mutex,
  );
  const liveChanges = Stream.unwrap(Effect.map(subscribe, ({ changes }) => changes));

  const readHistory: ResourceMonitor["Service"]["readHistory"] = Effect.fn(
    "ResourceMonitor.readHistory",
  )(function* (input) {
    const readAt = yield* DateTime.now;
    const normalizedInput = normalizeResourceMonitorHistoryInput(input);
    const historyResult = yield* Effect.result(nativeClient.readHistory(normalizedInput.windowMs));
    if (Result.isFailure(historyResult)) {
      yield* Effect.logWarning("Failed to read native resource monitoring history", {
        cause: historyResult.failure.message,
      });
    }
    const [nativeHealth, desktopHealth] = yield* Effect.all([
      nativeClient.health,
      desktopReceiver.health,
    ]);
    const current = yield* Ref.get(state);
    return buildResourceMonitorHistory({
      readAt,
      windowMs: normalizedInput.windowMs,
      bucketMs: normalizedInput.bucketMs,
      sampleIntervalMs: nativeHealth.sampleIntervalMs,
      serverPid: process.pid,
      sidecarPid: Option.map(nativeHealth.hello, (hello) => hello.sidecarPid),
      desktopSnapshot: current.desktopSnapshot,
      snapshots: Result.isSuccess(historyResult) ? historyResult.success : [],
      health: buildHealth({
        native: nativeHealth,
        desktop: desktopHealth,
        nativeSnapshot: current.nativeSnapshot,
      }),
    });
  });
  yield* nativeHealthSubscription.changes.pipe(
    Stream.runForEach(() => refreshHealth),
    Effect.forkScoped,
  );
  yield* desktopHealthSubscription.changes.pipe(
    Stream.runForEach(() => refreshHealth),
    Effect.forkScoped,
  );

  const refresh: ResourceMonitor["Service"]["refresh"] = nativeClient.sampleNow.pipe(
    Effect.flatMap(ingestNative),
    Effect.mapError(
      (cause) =>
        new ResourceMonitorRefreshFailed({
          operation: "refresh",
          cause,
        }),
    ),
  );

  return ResourceMonitor.of({
    latest,
    changes: liveChanges,
    subscribe,
    readHistory,
    refresh,
    retry: nativeClient.retry.pipe(
      Effect.zip(Ref.get(state)),
      Effect.map(([accepted, current]): ResourceMonitorRetryResult => ({
        accepted,
        snapshot: current.latest,
      })),
    ),
  });
});

export const layer = Layer.effect(ResourceMonitor, make());
