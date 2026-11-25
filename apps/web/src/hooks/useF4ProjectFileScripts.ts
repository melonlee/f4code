import {
  F4_PROJECT_FILE_NAME,
  type EnvironmentId,
  type F4ProjectFile,
  type F4ProjectFileScript,
} from "@f4code/contracts";
import { parseF4ProjectFile } from "@f4code/shared/f4ProjectFile";

import { useProjectFileQuery } from "~/components/files/projectFilesQueryState";

const NO_SCRIPTS: ReadonlyArray<F4ProjectFileScript> = [];

export interface F4ProjectFileState {
  status: "loading" | "missing" | "invalid" | "valid";
  file: F4ProjectFile | null;
  scripts: ReadonlyArray<F4ProjectFileScript>;
}

export function useF4ProjectFileState(
  environmentId: EnvironmentId,
  cwd: string | null,
): F4ProjectFileState {
  const query = useProjectFileQuery(environmentId, cwd ?? "", F4_PROJECT_FILE_NAME, cwd !== null);
  const contents = query.data && !query.data.truncated ? query.data.contents : null;
  const isPending = query.isPending;
  if (contents === null) {
    return {
      status: isPending ? "loading" : "missing",
      file: null,
      scripts: NO_SCRIPTS,
    } as const;
  }
  const file = parseF4ProjectFile(contents);
  if (file === null) {
    return { status: "invalid", file: null, scripts: NO_SCRIPTS } as const;
  }
  return { status: "valid", file, scripts: file.scripts ?? NO_SCRIPTS } as const;
}

export function useF4ProjectFileScripts(
  environmentId: EnvironmentId,
  cwd: string | null,
): ReadonlyArray<F4ProjectFileScript> {
  return useF4ProjectFileState(environmentId, cwd).scripts;
}
