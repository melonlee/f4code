import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

export default Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`ALTER TABLE inference_requests ADD COLUMN failure_cause TEXT`;
  yield* sql`ALTER TABLE inference_requests ADD COLUMN upstream_http_status INTEGER`;
  yield* sql`ALTER TABLE inference_requests ADD COLUMN reasoning_tokens INTEGER`;
});
