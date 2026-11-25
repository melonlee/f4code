import * as Exit from "effect/Exit";
import * as Schema from "effect/Schema";

import { F4ProjectFile, F4_PROJECT_FILE_SCHEMA_URL } from "@f4code/contracts";

import { fromLenientJson } from "./schemaJson.ts";

export const F4ProjectFileFromJson = fromLenientJson(F4ProjectFile);

const decodeF4ProjectFile = Schema.decodeExit(F4ProjectFileFromJson);

export function parseF4ProjectFile(contents: string): F4ProjectFile | null {
  const decoded = decodeF4ProjectFile(contents);
  return Exit.isSuccess(decoded) ? decoded.value : null;
}

export function buildF4ProjectFileJsonSchema(): Record<string, unknown> {
  const document = Schema.toJsonSchemaDocument(F4ProjectFile, { onExcessProperty: "error" });
  const jsonSchema: Record<string, unknown> = {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: F4_PROJECT_FILE_SCHEMA_URL,
    ...document.schema,
  };
  if (document.definitions && Object.keys(document.definitions).length > 0) {
    jsonSchema.$defs = document.definitions;
  }
  return jsonSchema;
}
