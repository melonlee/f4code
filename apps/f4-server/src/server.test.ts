import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { startF4Server } from "./server.ts";

describe("f4-server", () => {
  it("registers environments, enforces bearer auth, lists MCP endpoints, and redeems single-use pairing codes", async () => {
    const token = "test-f4-server-secret";
    const running = await startF4Server({
      host: "127.0.0.1",
      port: 0,
      token,
      dbPath: ":memory:",
    });
    try {
      const healthRes = await fetch(`${running.url}/health`);
      assert.equal(healthRes.status, 200);
      assert.deepEqual(await healthRes.json(), {
        ok: true,
        service: "f4-server",
        environments: 0,
        online: 0,
      });

      const unauthRes = await fetch(`${running.url}/v1/environments`);
      assert.equal(unauthRes.status, 401);

      const authHeaders = {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      };

      const registerRes = await fetch(`${running.url}/v1/environments/register`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          id: "env-macbook",
          label: "Drake's MacBook Air",
          endpoints: ["http://10.0.0.2:13773", "http://192.168.1.50:13773"],
          mcpUrl: "http://10.0.0.2:13773/mcp",
          e2eeFingerprint: "D409-667F-3A3C-B4D7",
          platform: "darwin",
          version: "0.1.11",
        }),
      });
      assert.equal(registerRes.status, 200);
      const registered = (await registerRes.json()) as {
        environment: { id: string; online: boolean; mcpUrl: string };
      };
      assert.equal(registered.environment.id, "env-macbook");
      assert.equal(registered.environment.online, true);
      assert.equal(registered.environment.mcpUrl, "http://10.0.0.2:13773/mcp");

      const mcpRes = await fetch(`${running.url}/v1/mcp/endpoints`, { headers: authHeaders });
      assert.equal(mcpRes.status, 200);
      const mcpJson = (await mcpRes.json()) as {
        endpoints: Array<{ environmentId: string; mcpUrl: string }>;
      };
      assert.equal(mcpJson.endpoints.length, 1);
      assert.equal(mcpJson.endpoints[0]!.mcpUrl, "http://10.0.0.2:13773/mcp");

      const pairRes = await fetch(`${running.url}/v1/environments/env-macbook/pairing`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ scopes: ["mcp", "rpc"] }),
      });
      assert.equal(pairRes.status, 200);
      const pairing = (await pairRes.json()) as { code: string };
      assert.match(pairing.code, /^[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}$/);

      const redeemRes = await fetch(`${running.url}/v1/pairing/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: pairing.code }),
      });
      assert.equal(redeemRes.status, 200);
      const redeemed = (await redeemRes.json()) as {
        environment: { id: string; e2eeFingerprint: string };
        scopes: string[];
      };
      assert.equal(redeemed.environment.id, "env-macbook");
      assert.equal(redeemed.environment.e2eeFingerprint, "D409-667F-3A3C-B4D7");
      assert.deepEqual(redeemed.scopes, ["mcp", "rpc"]);

      // Single-use pairing code cannot be redeemed twice
      const replayRes = await fetch(`${running.url}/v1/pairing/redeem`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: pairing.code }),
      });
      assert.equal(replayRes.status, 404);

      const deleteRes = await fetch(`${running.url}/v1/environments/env-macbook`, {
        method: "DELETE",
        headers: authHeaders,
      });
      assert.equal(deleteRes.status, 200);
    } finally {
      await running.close();
    }
  });
});
