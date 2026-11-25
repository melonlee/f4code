import { createGitEnvironmentAtoms } from "@f4code/client-runtime/state/git";
import { connectionAtomRuntime } from "../connection/runtime";

export const gitEnvironment = createGitEnvironmentAtoms(connectionAtomRuntime);
