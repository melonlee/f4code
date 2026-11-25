import * as NodeCrypto from "node:crypto";
import * as NodeHttp from "node:http";

import { F4ServerStore, type RegisterEnvironmentInput } from "./store.ts";

export interface F4ServerOptions {
  readonly host?: string;
  readonly port?: number;
  readonly token: string;
  readonly dbPath: string;
  readonly onlineTtlMs?: number;
}

export interface RunningF4Server {
  readonly server: NodeHttp.Server;
  readonly store: F4ServerStore;
  readonly host: string;
  readonly port: number;
  readonly url: string;
  readonly close: () => Promise<void>;
}

const MAX_BODY_BYTES = 64 * 1024;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function constantTimeTokenMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(actual, "utf8");
  if (a.length !== b.length) return false;
  return NodeCrypto.timingSafeEqual(a, b);
}

function sendJson(res: NodeHttp.ServerResponse, status: number, payload: unknown): void {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

async function readJsonBody(req: NodeHttp.IncomingMessage): Promise<unknown> {
  const chunks: Array<Buffer> = [];
  let total = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === "string" ? Buffer.from(chunk) : (chunk as Buffer);
    total += buf.length;
    if (total > MAX_BODY_BYTES) {
      throw new Error("payload_too_large");
    }
    chunks.push(buf);
  }
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (text.length === 0) return {};
  return JSON.parse(text);
}

function parseRegisterInput(body: unknown): RegisterEnvironmentInput | null {
  if (!isRecord(body)) return null;
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const label = typeof body.label === "string" ? body.label.trim() : "";
  if (!id || !label) return null;
  const endpoints = Array.isArray(body.endpoints)
    ? body.endpoints
        .filter((entry): entry is string => typeof entry === "string")
        .map((entry) => entry.trim())
        .filter((entry) => /^https?:\/\//i.test(entry))
    : [];
  const mcpUrl =
    typeof body.mcpUrl === "string" && /^https?:\/\//i.test(body.mcpUrl.trim())
      ? body.mcpUrl.trim()
      : null;
  const e2eeFingerprint =
    typeof body.e2eeFingerprint === "string" && body.e2eeFingerprint.trim().length > 0
      ? body.e2eeFingerprint.trim()
      : null;
  const platform =
    typeof body.platform === "string" && body.platform.trim().length > 0
      ? body.platform.trim()
      : null;
  const version =
    typeof body.version === "string" && body.version.trim().length > 0
      ? body.version.trim()
      : null;
  return { id, label, endpoints, mcpUrl, e2eeFingerprint, platform, version };
}

export async function startF4Server(options: F4ServerOptions): Promise<RunningF4Server> {
  const host = options.host ?? "127.0.0.1";
  const store = new F4ServerStore(options.dbPath, {
    ...(options.onlineTtlMs === undefined ? {} : { onlineTtlMs: options.onlineTtlMs }),
  });

  const requireAuth = (req: NodeHttp.IncomingMessage, res: NodeHttp.ServerResponse): boolean => {
    const header = req.headers.authorization ?? "";
    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match || !constantTimeTokenMatch(options.token, match[1]!.trim())) {
      sendJson(res, 401, { error: "unauthorized", message: "Missing or invalid bearer token." });
      return false;
    }
    return true;
  };

  const server = NodeHttp.createServer(async (req, res) => {
    try {
      const method = (req.method ?? "GET").toUpperCase();
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
      const pathname = url.pathname;

      if (method === "GET" && pathname === "/health") {
        const environments = store.listEnvironments();
        sendJson(res, 200, {
          ok: true,
          service: "f4-server",
          environments: environments.length,
          online: environments.filter((env) => env.online).length,
        });
        return;
      }

      if (method === "POST" && pathname === "/v1/pairing/redeem") {
        const body = await readJsonBody(req);
        const code = isRecord(body) && typeof body.code === "string" ? body.code : "";
        if (!code.trim()) {
          sendJson(res, 400, { error: "invalid_request", message: "Missing pairing code." });
          return;
        }
        const redeemed = store.redeemPairingCode(code);
        if (!redeemed) {
          sendJson(res, 404, {
            error: "pairing_not_found",
            message: "Pairing code is invalid or expired.",
          });
          return;
        }
        sendJson(res, 200, redeemed);
        return;
      }

      if (!requireAuth(req, res)) return;

      if (method === "GET" && pathname === "/v1/environments") {
        sendJson(res, 200, { environments: store.listEnvironments() });
        return;
      }

      if (method === "POST" && pathname === "/v1/environments/register") {
        const body = await readJsonBody(req);
        const input = parseRegisterInput(body);
        if (!input) {
          sendJson(res, 400, {
            error: "invalid_request",
            message: "Environment registration requires non-empty id and label.",
          });
          return;
        }
        const environment = store.registerEnvironment(input);
        sendJson(res, 200, { environment });
        return;
      }

      if (method === "GET" && pathname === "/v1/mcp/endpoints") {
        const endpoints = store
          .listEnvironments()
          .filter((env) => env.online && env.mcpUrl !== null)
          .map((env) => ({
            environmentId: env.id,
            label: env.label,
            mcpUrl: env.mcpUrl!,
            e2eeFingerprint: env.e2eeFingerprint,
          }));
        sendJson(res, 200, { endpoints });
        return;
      }

      const pairingMatch = /^\/v1\/environments\/([^/]+)\/pairing$/u.exec(pathname);
      if (method === "POST" && pairingMatch) {
        const envId = decodeURIComponent(pairingMatch[1]!);
        const body = await readJsonBody(req);
        const scopes =
          isRecord(body) && Array.isArray(body.scopes)
            ? body.scopes.filter((item): item is string => typeof item === "string")
            : ["mcp"];
        const pairing = store.createPairingCode(envId, scopes);
        if (!pairing) {
          sendJson(res, 404, { error: "not_found", message: "Environment not found." });
          return;
        }
        sendJson(res, 200, pairing);
        return;
      }

      const deleteMatch = /^\/v1\/environments\/([^/]+)$/u.exec(pathname);
      if (method === "DELETE" && deleteMatch) {
        const envId = decodeURIComponent(deleteMatch[1]!);
        const deleted = store.deleteEnvironment(envId);
        if (!deleted) {
          sendJson(res, 404, { error: "not_found", message: "Environment not found." });
          return;
        }
        sendJson(res, 200, { ok: true, id: envId });
        return;
      }

      sendJson(res, 404, { error: "not_found", message: "Unknown route." });
    } catch (error) {
      if (error instanceof Error && error.message === "payload_too_large") {
        sendJson(res, 413, { error: "payload_too_large", message: "Request body is too large." });
        return;
      }
      if (error instanceof SyntaxError) {
        sendJson(res, 400, { error: "invalid_json", message: "Request body must be valid JSON." });
        return;
      }
      sendJson(res, 500, { error: "internal_error", message: "Internal server error." });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(options.port ?? 8787, host, () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address !== null ? address.port : (options.port ?? 8787);
  const url = `http://${host === "0.0.0.0" ? "127.0.0.1" : host}:${actualPort}`;

  return {
    server,
    store,
    host,
    port: actualPort,
    url,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => {
          store.close();
          if (error) reject(error);
          else resolve();
        });
      }),
  };
}
