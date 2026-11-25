// Registers a linked inference server as a Pi provider routed through F4's gateway. Pi resolves
// "$F4_GATEWAY_TOKEN" from the environment itself (1.5 provider-composer), so the token never
// lands in argv, settings, or ~/.pi.
export const PI_F4_GATEWAY_EXTENSION_FILENAME = "pi-f4-gateway-extension.ts";

export const F4_GATEWAY_URL_ENV = "F4_GATEWAY_URL";
export const F4_GATEWAY_TOKEN_ENV = "F4_GATEWAY_TOKEN";
export const F4_GATEWAY_PROVIDER_ENV = "F4_GATEWAY_PROVIDER";
export const F4_GATEWAY_MODELS_ENV = "F4_GATEWAY_MODELS";

/** Self-contained so it can sit in both F4's full extension and the gateway-only one. */
export const PI_F4_GATEWAY_PROVIDER_SNIPPET = `\
function registerF4GatewayProvider(pi: ExtensionAPI) {
  const baseUrl = process.env[${JSON.stringify(F4_GATEWAY_URL_ENV)}];
  const name = process.env[${JSON.stringify(F4_GATEWAY_PROVIDER_ENV)}];
  const modelsJson = process.env[${JSON.stringify(F4_GATEWAY_MODELS_ENV)}];
  if (!baseUrl || !name || !modelsJson || !process.env[${JSON.stringify(F4_GATEWAY_TOKEN_ENV)}]) return;
  let models: unknown;
  try {
    models = JSON.parse(modelsJson);
  } catch {
    return;
  }
  if (!Array.isArray(models) || models.length === 0) return;
  pi.registerProvider(name, {
    baseUrl,
    apiKey: ${JSON.stringify(`$${F4_GATEWAY_TOKEN_ENV}`)},
    api: "openai-completions",
    models,
  });
}
`;

export const PI_F4_GATEWAY_EXTENSION_SOURCE = `\
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

${PI_F4_GATEWAY_PROVIDER_SNIPPET}
export default function f4GatewayExtension(pi: ExtensionAPI) {
  registerF4GatewayProvider(pi);
}
`;
