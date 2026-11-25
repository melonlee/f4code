import { makeSecretProviderDefinitionRegistry } from "@f4code/secret-provider-core/shared/definition";
import * as OnePassword from "@f4code/secret-provider-onepassword/shared/definition";

export const builtInSecretProviderDefinitions = makeSecretProviderDefinitionRegistry([
  OnePassword.definition,
]);
