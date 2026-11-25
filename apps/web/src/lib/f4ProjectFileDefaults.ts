import {
  F4_PROJECT_FILE_NAME,
  type EnvironmentId,
  type ProjectReadFileResult,
  type F4ProjectFile,
} from "@f4code/contracts";
import { parseF4ProjectFile } from "@f4code/shared/f4ProjectFile";
import { executeAtomQuery } from "@f4code/client-runtime/state/runtime";
import { AsyncResult } from "effect/reactivity";

import {
  getProjectFileQueryAtom,
  resolveProjectFileQueryData,
} from "~/components/files/projectFilesQueryState";
import { appAtomRegistry } from "~/rpc/atomRegistry";

function toF4ProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
  result: ProjectReadFileResult | null,
): F4ProjectFile | null {
  const data = resolveProjectFileQueryData(
    environmentId,
    workspaceRoot,
    F4_PROJECT_FILE_NAME,
    result,
  );
  if (data === null || data.exists === false || data.truncated) return null;
  return parseF4ProjectFile(data.contents);
}

export async function readF4ProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): Promise<F4ProjectFile | null> {
  const result = await executeAtomQuery(
    appAtomRegistry,
    getProjectFileQueryAtom(environmentId, workspaceRoot, F4_PROJECT_FILE_NAME),
    { reportDefect: false, reportFailure: false },
  );
  return toF4ProjectFile(
    environmentId,
    workspaceRoot,
    result._tag === "Success" ? result.value : null,
  );
}

/** The project's f4.json from an earlier read, or `undefined` when none has loaded yet. */
export function peekF4ProjectFile(
  environmentId: EnvironmentId,
  workspaceRoot: string,
): F4ProjectFile | null | undefined {
  const result = appAtomRegistry.get(
    getProjectFileQueryAtom(environmentId, workspaceRoot, F4_PROJECT_FILE_NAME),
  );
  return AsyncResult.isSuccess(result)
    ? toF4ProjectFile(environmentId, workspaceRoot, result.value)
    : undefined;
}
