// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeHttps from "node:https";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import type * as NodeTls from "node:tls";

import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

class TlsRequestError extends Schema.TaggedError<TlsRequestError>()("TlsRequestError", {
  cause: Schema.Defect(),
}) {}

import { resolveBoundEndpoints } from "../environment/DirectEndpoints.ts";
import { makePersistedServerRuntimeState } from "../serverRuntimeState.ts";
import { formatHeadlessServeOutput, resolveHeadlessConnectionString } from "../startupAccess.ts";
import {
  ensureLocalMtlsPki,
  isMtlsClientRevoked,
  issueMtlsClientCertificate,
  listMtlsClientCertificates,
  revokeMtlsClientCertificate,
} from "./MtlsPki.ts";
import {
  createLocalCliMtlsFetch,
  createMtlsHttpsServer,
  resolveMtlsServerConfig,
} from "./MtlsServer.ts";

function withTempDir<A, E, R>(
  use: (dir: string) => Effect.Effect<A, E, R>,
): Effect.Effect<A, E, R> {
  return Effect.acquireUseRelease(
    Effect.sync(() => NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "f4-mtls-test-"))),
    use,
    (dir) => Effect.sync(() => NodeFS.rmSync(dir, { recursive: true, force: true })),
  );
}

function httpsGet(options: {
  readonly port: number;
  readonly ca: string;
  readonly cert?: string;
  readonly key?: string;
}): Promise<{
  readonly statusCode: number;
  readonly body: string;
  readonly protocol: string | null;
}> {
  return new Promise((resolve, reject) => {
    const req = NodeHttps.request(
      {
        host: "127.0.0.1",
        port: options.port,
        path: "/ping",
        method: "GET",
        ca: options.ca,
        ...(options.cert ? { cert: options.cert } : {}),
        ...(options.key ? { key: options.key } : {}),
        minVersion: "TLSv1.3",
        rejectUnauthorized: true,
      },
      (res) => {
        const chunks: Array<Buffer> = [];
        const tlsSocket = res.socket as NodeTls.TLSSocket;
        const protocol =
          typeof tlsSocket.getProtocol === "function" ? tlsSocket.getProtocol() : null;
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () =>
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            protocol,
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("MtlsPki", () => {
  it.effect(
    "generates a valid CA, server cert with SANs, and client certs, and enforces revocation",
    () =>
      withTempDir((mtlsDir) =>
        Effect.gen(function* () {
          const first = yield* ensureLocalMtlsPki({
            mtlsDir,
            environmentId: "env-local-test-1234",
            extraSans: ["workstation.local", "10.0.0.42"],
          });

          const caX509 = new NodeCrypto.X509Certificate(first.caCertPem);
          const serverX509 = new NodeCrypto.X509Certificate(first.serverCertPem);
          expect(caX509.ca).toBe(true);
          expect(serverX509.ca).toBe(false);
          expect(serverX509.verify(caX509.publicKey)).toBe(true);
          expect(first.sans).toContain("localhost");
          expect(first.sans).toContain("127.0.0.1");
          expect(first.sans).toContain("workstation.local");
          expect(first.sans).toContain("10.0.0.42");

          // Second call reuses the exact same CA and server certificate.
          const second = yield* ensureLocalMtlsPki({
            mtlsDir,
            extraSans: ["workstation.local"],
          });
          expect(second.caFingerprint256).toBe(first.caFingerprint256);
          expect(second.serverFingerprint256).toBe(first.serverFingerprint256);

          // Requesting a new SAN rotates the server cert under the same CA.
          const rotated = yield* ensureLocalMtlsPki({
            mtlsDir,
            extraSans: ["192.168.1.55"],
          });
          expect(rotated.caFingerprint256).toBe(first.caFingerprint256);
          expect(rotated.serverFingerprint256).not.toBe(first.serverFingerprint256);
          expect(rotated.sans).toContain("192.168.1.55");

          // Issue and revoke a client certificate.
          const bundle = yield* issueMtlsClientCertificate({
            mtlsDir,
            label: "my-laptop",
          });
          const clientX509 = new NodeCrypto.X509Certificate(bundle.certPem);
          expect(clientX509.ca).toBe(false);
          expect(clientX509.verify(caX509.publicKey)).toBe(true);
          expect(listMtlsClientCertificates(mtlsDir)).toHaveLength(1);
          expect(
            isMtlsClientRevoked(mtlsDir, {
              serialNumber: bundle.record.serialNumber,
              fingerprint256: bundle.record.fingerprint256,
            }),
          ).toBe(false);

          const revoked = yield* revokeMtlsClientCertificate({
            mtlsDir,
            identifier: bundle.record.id,
          });
          expect(revoked?.id).toBe(bundle.record.id);
          expect(revoked?.revokedAt).toBeDefined();
          expect(
            isMtlsClientRevoked(mtlsDir, {
              serialNumber: bundle.record.serialNumber,
              fingerprint256: bundle.record.fingerprint256,
            }),
          ).toBe(true);
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("MtlsServer", () => {
  it.live(
    "enforces TLS 1.3 mutual authentication and immediately rejects revoked or untrusted clients",
    () =>
      withTempDir((mtlsDir) =>
        withTempDir((otherCaDir) =>
          Effect.gen(function* () {
            const resolved = yield* resolveMtlsServerConfig({
              enabled: true,
              mtlsDir,
              host: "127.0.0.1",
            });
            const validClient = yield* issueMtlsClientCertificate({
              mtlsDir,
              label: "trusted-device",
            });
            const foreignClient = yield* issueMtlsClientCertificate({
              mtlsDir: otherCaDir,
              label: "foreign-device",
            });

            const revokedPeers: Array<string> = [];
            let requestHandlerCalls = 0;
            const server = createMtlsHttpsServer(resolved, {
              onRevokedClient: (peer) => {
                if (peer.fingerprint256) revokedPeers.push(peer.fingerprint256);
              },
            });
            server.on("request", (_req, res) => {
              requestHandlerCalls += 1;
              res.writeHead(200, { "content-type": "text/plain" }).end("ok");
            });

            const port = yield* Effect.acquireRelease(
              Effect.promise(
                () =>
                  new Promise<number>((resolve, reject) => {
                    server.once("error", reject);
                    server.listen(0, "127.0.0.1", () => {
                      const addr = server.address();
                      if (!addr || typeof addr === "string") {
                        reject(new Error("Expected TCP address"));
                        return;
                      }
                      resolve(addr.port);
                    });
                  }),
              ),
              () =>
                Effect.promise(
                  () =>
                    new Promise<void>((resolve) => {
                      server.close(() => resolve());
                    }),
                ),
            );

            // 1. Valid CA-signed client succeeds over TLS 1.3.
            const ok = yield* Effect.promise(() =>
              httpsGet({
                port,
                ca: validClient.caCertPem,
                cert: validClient.certPem,
                key: validClient.keyPem,
              }),
            );
            expect(ok.statusCode).toBe(200);
            expect(ok.body).toBe("ok");
            expect(ok.protocol).toBe("TLSv1.3");

            // 2. Client with no certificate is rejected at TLS handshake.
            const noCertFailed = yield* Effect.tryPromise({
              try: () =>
                httpsGet({
                  port,
                  ca: validClient.caCertPem,
                }),
              catch: (cause) => new TlsRequestError({ cause }),
            }).pipe(Effect.flip);
            expect(noCertFailed).toBeDefined();

            // 3. Client signed by a different CA is rejected at TLS handshake.
            const foreignFailed = yield* Effect.tryPromise({
              try: () =>
                httpsGet({
                  port,
                  ca: validClient.caCertPem,
                  cert: foreignClient.certPem,
                  key: foreignClient.keyPem,
                }),
              catch: (cause) => new TlsRequestError({ cause }),
            }).pipe(Effect.flip);
            expect(foreignFailed).toBeDefined();

            // 4. Local CLI ephemeral client fetch authenticates cleanly.
            const cliFetch = createLocalCliMtlsFetch(mtlsDir);
            expect(cliFetch).toBeDefined();
            const cliResponse = yield* Effect.promise(async () => {
              try {
                const res = await cliFetch!.fetch(`https://127.0.0.1:${port}/ping`);
                return { status: res.status, text: await res.text() };
              } finally {
                await cliFetch?.close();
              }
            });
            expect(cliResponse).toEqual({ status: 200, text: "ok" });

            // 5. Presenting the server certificate (EKU=serverAuth only) as a client cert is rejected.
            const serverCertAsClientFailed = yield* Effect.tryPromise({
              try: () =>
                httpsGet({
                  port,
                  ca: validClient.caCertPem,
                  cert: String(resolved.httpsOptions.cert),
                  key: String(resolved.httpsOptions.key),
                }),
              catch: (cause) => new TlsRequestError({ cause }),
            }).pipe(Effect.flip);
            expect(serverCertAsClientFailed).toBeDefined();

            // 6. Revoking the trusted client immediately drops subsequent connections
            //    and prevents downstream request handlers from executing on keep-alive sockets.
            const callsBeforeRevoke = requestHandlerCalls;
            yield* revokeMtlsClientCertificate({ mtlsDir, identifier: validClient.record.id });
            const revokedFailed = yield* Effect.tryPromise({
              try: () =>
                httpsGet({
                  port,
                  ca: validClient.caCertPem,
                  cert: validClient.certPem,
                  key: validClient.keyPem,
                }),
              catch: (cause) => new TlsRequestError({ cause }),
            }).pipe(Effect.flip);
            expect(revokedFailed).toBeDefined();
            expect(revokedPeers).toContain(validClient.record.fingerprint256);
            expect(requestHandlerCalls).toBe(callsBeforeRevoke);

            // 7. A corrupted clients.json registry fails closed instead of allowing connections.
            const secondClient = yield* issueMtlsClientCertificate({
              mtlsDir,
              label: "second-device",
            });
            NodeFS.writeFileSync(NodePath.join(mtlsDir, "clients.json"), "{corrupted-json", "utf8");
            const failClosed = yield* Effect.tryPromise({
              try: () =>
                httpsGet({
                  port,
                  ca: secondClient.caCertPem,
                  cert: secondClient.certPem,
                  key: secondClient.keyPem,
                }),
              catch: (cause) => new TlsRequestError({ cause }),
            }).pipe(Effect.flip);
            expect(failClosed).toBeDefined();
          }),
        ).pipe(Effect.scoped),
      ).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rejects partial custom TLS flag sets, mismatched cert/key pairs, and invalid SANs",
    () =>
      withTempDir((mtlsDir) =>
        Effect.gen(function* () {
          const partialError = yield* resolveMtlsServerConfig({
            enabled: true,
            mtlsDir,
            certPath: "/tmp/server.pem",
          }).pipe(Effect.flip);
          expect(partialError._tag).toBe("MtlsConfigError");

          const pki = yield* ensureLocalMtlsPki({ mtlsDir });
          const client = yield* issueMtlsClientCertificate({ mtlsDir, label: "wrong-key" });
          const mismatchError = yield* resolveMtlsServerConfig({
            enabled: true,
            mtlsDir,
            certPath: pki.paths.serverCertPath,
            keyPath: client.keyPath,
            caPath: pki.paths.caCertPath,
          }).pipe(Effect.flip);
          expect(mismatchError._tag).toBe("MtlsConfigError");

          const invalidSanError = yield* ensureLocalMtlsPki({
            mtlsDir,
            extraSans: ["bad host\nname"],
          }).pipe(Effect.flip);
          expect(invalidSanError._tag).toBe("MtlsPkiError");
        }),
      ).pipe(Effect.provide(NodeServices.layer)),
  );
});

describe("mTLS origin and endpoint formatting", () => {
  it.effect(
    "uses https:// for headless output, runtime state, and direct LAN endpoints when mTLS is enabled",
    () =>
      Effect.gen(function* () {
        const connectionString = resolveHeadlessConnectionString("192.168.1.20", 3773, {
          mtlsEnabled: true,
          platform: "darwin",
        });
        expect(connectionString).toBe("https://192.168.1.20:3773");

        const output = formatHeadlessServeOutput({
          connectionString,
          token: "tok-123",
          pairingUrl: `${connectionString}/pair#token=tok-123`,
        });
        expect(output).toContain("local mTLS (TLS 1.3 mutual authentication)");
        expect(output).not.toContain("plain HTTP");

        const runtimeState = yield* makePersistedServerRuntimeState({
          config: {
            host: "127.0.0.1",
            mtlsEnabled: true,
            devUrl: undefined,
          },
          port: 3773,
        });
        expect(runtimeState.origin).toBe("https://127.0.0.1:3773");

        const endpoints = resolveBoundEndpoints({
          platform: "darwin",
          host: "192.168.1.20",
          port: 3773,
          interfaces: {},
          mtlsEnabled: true,
        });
        expect(endpoints).toEqual([{ kind: "lan", httpBaseUrl: "https://192.168.1.20:3773/" }]);
      }),
  );
});
