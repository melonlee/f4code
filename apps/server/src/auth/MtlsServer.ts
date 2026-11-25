// Local TLS 1.3 mutual-TLS (mTLS) HTTPS server and client helpers.
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeHttps from "node:https";
import * as NodeModule from "node:module";
import type * as NodeTls from "node:tls";

import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type * as Undici from "undici";

import {
  ensureLocalMtlsPki,
  isMtlsClientRevoked,
  issueEphemeralLocalCliClientCert,
} from "./MtlsPki.ts";

const requireUndici = NodeModule.createRequire(import.meta.url);

export interface MtlsServerOptionsInput {
  readonly enabled: boolean;
  readonly mtlsDir: string;
  readonly host?: string | undefined;
  readonly certPath?: string | undefined;
  readonly keyPath?: string | undefined;
  readonly caPath?: string | undefined;
}

export interface ResolvedMtlsServerConfig {
  readonly httpsOptions: NodeHttps.ServerOptions;
  readonly caFingerprint256: string;
  readonly serverFingerprint256: string;
  readonly mtlsDir: string;
  readonly isManagedPki: boolean;
}

export class MtlsConfigError extends Schema.TaggedError<MtlsConfigError>()("MtlsConfigError", {
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return `Invalid mTLS configuration: ${this.detail}`;
  }
}

export const isMtlsEnabled = (config: {
  readonly mtlsEnabled?: boolean | undefined;
  readonly tlsCertPath?: string | undefined;
  readonly tlsKeyPath?: string | undefined;
  readonly tlsCaPath?: string | undefined;
}): boolean =>
  config.mtlsEnabled === true ||
  config.tlsCertPath !== undefined ||
  config.tlsKeyPath !== undefined ||
  config.tlsCaPath !== undefined;

export const resolveMtlsServerConfig = Effect.fn("MtlsServer.resolveMtlsServerConfig")(function* (
  input: MtlsServerOptionsInput,
) {
  const hasCustomAny =
    input.certPath !== undefined || input.keyPath !== undefined || input.caPath !== undefined;

  if (hasCustomAny) {
    if (!input.certPath || !input.keyPath || !input.caPath) {
      return yield* new MtlsConfigError({
        detail:
          "Custom mTLS requires all three of --tls-cert, --tls-key, and --tls-ca (or use --mtls for automatic local PKI).",
      });
    }
    const { certPem, keyPem, caPem, serverX509, caX509 } = yield* Effect.try({
      try: () => {
        const certPem = NodeFS.readFileSync(input.certPath!, "utf8");
        const keyPem = NodeFS.readFileSync(input.keyPath!, "utf8");
        const caPem = NodeFS.readFileSync(input.caPath!, "utf8");
        const serverX509 = new NodeCrypto.X509Certificate(certPem);
        const caX509 = new NodeCrypto.X509Certificate(caPem);
        const privateKey = NodeCrypto.createPrivateKey(keyPem);
        const derivedPub = NodeCrypto.createPublicKey(privateKey).export({
          type: "spki",
          format: "der",
        });
        const certPub = serverX509.publicKey.export({ type: "spki", format: "der" });
        if (!derivedPub.equals(certPub)) {
          throw new Error("--tls-key does not match the public key in --tls-cert.");
        }
        return { certPem, keyPem, caPem, serverX509, caX509 };
      },
      catch: (cause) =>
        new MtlsConfigError({
          detail: "Failed to read, parse, or match --tls-cert, --tls-key, and --tls-ca.",
          cause,
        }),
    });
    return {
      httpsOptions: {
        cert: certPem,
        key: keyPem,
        ca: caPem,
        minVersion: "TLSv1.3",
        requestCert: true,
        rejectUnauthorized: true,
      },
      caFingerprint256: caX509.fingerprint256,
      serverFingerprint256: serverX509.fingerprint256,
      mtlsDir: input.mtlsDir,
      isManagedPki: false,
    } satisfies ResolvedMtlsServerConfig;
  }

  const materials = yield* ensureLocalMtlsPki({
    mtlsDir: input.mtlsDir,
    ...(input.host ? { extraSans: [input.host] } : {}),
  });

  return {
    httpsOptions: {
      cert: materials.serverCertPem,
      key: materials.serverKeyPem,
      ca: materials.caCertPem,
      minVersion: "TLSv1.3",
      requestCert: true,
      rejectUnauthorized: true,
    },
    caFingerprint256: materials.caFingerprint256,
    serverFingerprint256: materials.serverFingerprint256,
    mtlsDir: input.mtlsDir,
    isManagedPki: true,
  } satisfies ResolvedMtlsServerConfig;
});

/**
 * Create a TLS 1.3 mutual-TLS HTTPS server that rejects unauthenticated peers
 * during the TLS handshake and enforces managed client certificate revocations
 * immediately on `secureConnection`.
 */
export function createMtlsHttpsServer(
  resolved: ResolvedMtlsServerConfig,
  options?: {
    readonly onRevokedClient?: (peer: {
      readonly serialNumber?: string | undefined;
      readonly fingerprint256?: string | undefined;
    }) => void;
  },
): NodeHttps.Server {
  const server = NodeHttps.createServer(resolved.httpsOptions);
  const rejectIfRevoked = (tlsSocket: NodeTls.TLSSocket): boolean => {
    if (!tlsSocket.authorized) {
      tlsSocket.destroy();
      return true;
    }
    const peer = tlsSocket.getPeerCertificate(false);
    if (!peer || !peer.fingerprint256) {
      tlsSocket.destroy();
      return true;
    }
    if (resolved.isManagedPki && isMtlsClientRevoked(resolved.mtlsDir, peer)) {
      options?.onRevokedClient?.({
        serialNumber: peer.serialNumber,
        fingerprint256: peer.fingerprint256,
      });
      tlsSocket.destroy();
      return true;
    }
    return false;
  };
  server.on("secureConnection", (tlsSocket: NodeTls.TLSSocket) => {
    rejectIfRevoked(tlsSocket);
  });
  // Intercept request/upgrade dispatch before any HTTP or WebSocket listener runs so a
  // revoked client on an already-open keep-alive socket can never trigger side effects.
  const originalEmit = server.emit.bind(server);
  server.emit = ((event: string | symbol, ...args: Array<unknown>) => {
    if (event === "request" || event === "upgrade") {
      const req = args[0] as { readonly socket?: NodeTls.TLSSocket } | undefined;
      const tlsSocket = req?.socket;
      if (tlsSocket && typeof tlsSocket.getPeerCertificate === "function") {
        if (rejectIfRevoked(tlsSocket)) {
          const second = args[1] as { destroy?: () => void } | undefined;
          second?.destroy?.();
          return false;
        }
      }
    }
    return originalEmit(event as string, ...args);
  }) as typeof server.emit;
  return server;
}

/**
 * Build an mTLS-authenticated `fetch` and `close` handle using the same `undici`
 * copy for both `fetch` and `Agent` (avoiding Node 22 bundled-undici vs npm
 * undici v8 dispatcher incompatibilities).
 */
export function createLocalCliMtlsFetch(mtlsDir: string):
  | {
      readonly fetch: typeof globalThis.fetch;
      readonly close: () => Promise<void>;
    }
  | undefined {
  const bundle = issueEphemeralLocalCliClientCert(mtlsDir);
  if (bundle === null) return undefined;
  const undici = requireUndici("undici") as typeof Undici;
  const agent = new undici.Agent({
    allowH2: false,
    connect: {
      ca: bundle.caCertPem,
      cert: bundle.certPem,
      key: bundle.keyPem,
      minVersion: "TLSv1.3",
      rejectUnauthorized: true,
    },
  });
  return {
    fetch: ((input: Parameters<typeof globalThis.fetch>[0], init?: RequestInit) =>
      undici.fetch(input as Undici.RequestInfo, {
        ...(init as Undici.RequestInit | undefined),
        dispatcher: agent,
      })) as unknown as typeof globalThis.fetch,
    close: () => agent.close(),
  };
}
