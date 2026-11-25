import type { APIRoute } from "astro";

import { buildF4ProjectFileJsonSchema } from "@f4code/shared/f4ProjectFile";

export const GET: APIRoute = () =>
  new Response(`${JSON.stringify(buildF4ProjectFileJsonSchema(), null, 2)}\n`, {
    headers: { "Content-Type": "application/json" },
  });
