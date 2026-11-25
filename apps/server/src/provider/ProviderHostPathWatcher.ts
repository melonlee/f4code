import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Stream from "effect/Stream";

import * as DesktopHostChannel from "../resourceMonitor/DesktopHostChannel.ts";
import * as ProviderRegistry from "./ProviderRegistry.ts";

/** The desktop's shell PATH can arrive after drivers were built and checked against a bare one. */
export const layer = Layer.effectDiscard(
  Effect.gen(function* () {
    const receiver = yield* DesktopHostChannel.DesktopHostChannel;
    const providers = yield* ProviderRegistry.ProviderRegistry;
    yield* receiver.pathChanges.pipe(
      Stream.runForEach(() => providers.rebuildMissingAndRefresh),
      Effect.forkScoped,
    );
  }),
);
