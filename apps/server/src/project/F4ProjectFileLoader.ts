import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";

import { F4_PROJECT_FILE_NAME, type F4ProjectFile } from "@f4code/contracts";
import { F4ProjectFileFromJson } from "@f4code/shared/f4ProjectFile";

const decodeF4ProjectFileJson = Schema.decodeEffect(F4ProjectFileFromJson);

export class F4ProjectFileLoadError extends Schema.TaggedError<F4ProjectFileLoadError>()(
  "F4ProjectFileLoadError",
  {
    operation: Schema.Literals(["read", "decode"]),
    workspaceRoot: Schema.String,
    filePath: Schema.String,
    cause: Schema.Defect(),
  },
) {
  override get message(): string {
    return `Failed to ${this.operation} ${F4_PROJECT_FILE_NAME} at ${this.filePath}.`;
  }
}

export class F4ProjectFileLoader extends Context.Service<
  F4ProjectFileLoader,
  {
    /** Never fails; missing/unreadable/invalid files return none, with warnings for invalid files. */
    readonly load: (workspaceRoot: string) => Effect.Effect<Option.Option<F4ProjectFile>>;
  }
>()("f4/project/F4ProjectFileLoader") {}

const logF4ProjectFileLoadError = (error: F4ProjectFileLoadError) =>
  Effect.logWarning(error).pipe(
    Effect.annotateLogs({
      operation: error.operation,
      workspaceRoot: error.workspaceRoot,
      filePath: error.filePath,
      errorTag: error._tag,
    }),
  );

/** @public */
export const make = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const load: F4ProjectFileLoader["Service"]["load"] = Effect.fn("F4ProjectFileLoader.load")(
    function* (workspaceRoot) {
      const filePath = path.join(workspaceRoot, F4_PROJECT_FILE_NAME);
      const raw = yield* fileSystem.readFileString(filePath).pipe(
        Effect.asSome,
        Effect.catchTags({
          PlatformError: (error) =>
            error.reason._tag === "NotFound"
              ? Effect.succeed(Option.none<string>())
              : logF4ProjectFileLoadError(
                  new F4ProjectFileLoadError({
                    operation: "read",
                    workspaceRoot,
                    filePath,
                    cause: error,
                  }),
                ).pipe(Effect.as(Option.none<string>())),
        }),
      );
      if (Option.isNone(raw)) {
        return Option.none<F4ProjectFile>();
      }
      return yield* decodeF4ProjectFileJson(raw.value).pipe(
        Effect.asSome,
        Effect.catchTags({
          SchemaError: (error) =>
            logF4ProjectFileLoadError(
              new F4ProjectFileLoadError({
                operation: "decode",
                workspaceRoot,
                filePath,
                cause: error,
              }),
            ).pipe(Effect.as(Option.none<F4ProjectFile>())),
        }),
      );
    },
  );

  return F4ProjectFileLoader.of({ load });
});

export const layer = Layer.effect(F4ProjectFileLoader, make);
