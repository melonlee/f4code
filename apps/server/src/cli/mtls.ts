// CLI commands for managing local TLS 1.3 mTLS certificates (`f4 auth mtls ...`).
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";

import * as Clock from "effect/Clock";
import * as Console from "effect/Console";
import * as DateTime from "effect/DateTime";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { Argument, Command, Flag, GlobalFlag } from "effect/cli";

import {
  ensureLocalMtlsPki,
  issueMtlsClientCertificate,
  listMtlsClientCertificates,
  resolveMtlsPaths,
  revokeMtlsClientCertificate,
} from "../auth/MtlsPki.ts";
import { authLocationFlags, DurationFromString, resolveCliAuthConfig } from "./config.ts";

const encodeUnknownJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));

const jsonFlag = Flag.Boolean("json").pipe(
  Flag.withDescription("Emit JSON instead of human-readable output."),
  Flag.withDefault(false),
);

const sanFlag = Flag.String("san").pipe(
  Flag.withDescription(
    "Additional DNS hostname or IP address to include in the server certificate SAN list (repeatable).",
  ),
  Flag.withDefault([] as ReadonlyArray<string>),
  Flag.map((value) =>
    (Array.isArray(value) ? value : [value])
      .flatMap((entry) => entry.split(","))
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0),
  ),
);

const forceFlag = Flag.Boolean("force").pipe(
  Flag.withDescription(
    "Regenerate the local CA and server certificate even if they already exist.",
  ),
  Flag.withDefault(false),
);

const labelFlag = Flag.String("label").pipe(
  Flag.withDescription("Human-readable name for the client certificate (e.g. `laptop`, `phone`)."),
  Flag.withDefault("client"),
);

const ttlFlag = Flag.String("ttl").pipe(
  Flag.withSchema(DurationFromString),
  Flag.withDescription("Certificate validity duration, for example `30d`, `90d`, or `365d`."),
  Flag.optional,
);

const outDirFlag = Flag.String("out-dir").pipe(
  Flag.withDescription(
    "Optional directory to write the client cert, private key, and CA cert bundle into.",
  ),
  Flag.optional,
);

const mtlsInitCommand = Command.make("init", {
  ...authLocationFlags,
  san: sanFlag,
  force: forceFlag,
  json: jsonFlag,
}).pipe(
  Command.withDescription("Initialize (or inspect) the local mTLS CA and server certificate."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig(flags, logLevel, { quietLogs: flags.json });
      const materials = yield* ensureLocalMtlsPki({
        mtlsDir: config.mtlsDir,
        extraSans: flags.san,
        forceRegenerate: flags.force,
      });
      if (flags.json) {
        yield* Console.log(
          encodeUnknownJson({
            mtlsDir: materials.paths.dir,
            caCertPath: materials.paths.caCertPath,
            caFingerprint256: materials.caFingerprint256,
            serverCertPath: materials.paths.serverCertPath,
            serverFingerprint256: materials.serverFingerprint256,
            serverExpiresAt: materials.serverExpiresAt,
            sans: materials.sans,
          }),
        );
        return;
      }
      yield* Console.log(
        [
          "Local mTLS PKI is ready.",
          `CA certificate:     ${materials.paths.caCertPath}`,
          `CA SHA-256:         ${materials.caFingerprint256}`,
          `Server certificate: ${materials.paths.serverCertPath}`,
          `Server SHA-256:     ${materials.serverFingerprint256}`,
          `Server expires:     ${materials.serverExpiresAt}`,
          `Server SANs:        ${materials.sans.join(", ")}`,
          "",
          "Start the server with `f4 serve --mtls` (or `f4 serve --lan --mtls`).",
          "Issue a client cert with `f4 auth mtls issue --label <device>`.",
        ].join("\n"),
      );
    }),
  ),
);

const mtlsIssueCommand = Command.make("issue", {
  ...authLocationFlags,
  label: labelFlag,
  ttl: ttlFlag,
  outDir: outDirFlag,
  json: jsonFlag,
}).pipe(
  Command.withDescription("Issue a client certificate signed by the local mTLS CA."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig(flags, logLevel, { quietLogs: flags.json });
      const bundle = yield* issueMtlsClientCertificate({
        mtlsDir: config.mtlsDir,
        label: flags.label,
        ...(Option.isSome(flags.ttl) ? { ttlMs: Duration.toMillis(flags.ttl.value) } : {}),
        ...(Option.isSome(flags.outDir) ? { outDir: flags.outDir.value } : {}),
      });
      if (flags.json) {
        yield* Console.log(
          encodeUnknownJson({
            client: bundle.record,
            certPath: bundle.certPath,
            keyPath: bundle.keyPath,
            caCertPath: bundle.caCertPath,
          }),
        );
        return;
      }
      yield* Console.log(
        [
          `Issued local mTLS client certificate: ${bundle.record.id} (${bundle.record.label})`,
          `Serial:         ${bundle.record.serialNumber}`,
          `SHA-256:        ${bundle.record.fingerprint256}`,
          `Expires:        ${bundle.record.expiresAt}`,
          `Client cert:    ${bundle.certPath}`,
          `Client key:     ${bundle.keyPath}`,
          `CA cert:        ${bundle.caCertPath}`,
          "",
          "Example curl:",
          `  curl --cacert "${bundle.caCertPath}" --cert "${bundle.certPath}" --key "${bundle.keyPath}" https://127.0.0.1:3773/api/auth/descriptor`,
        ].join("\n"),
      );
    }),
  ),
);

const mtlsListCommand = Command.make("list", {
  ...authLocationFlags,
  json: jsonFlag,
}).pipe(
  Command.withDescription("List issued local mTLS client certificates."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig(flags, logLevel, { quietLogs: flags.json });
      const clients = listMtlsClientCertificates(config.mtlsDir);
      if (flags.json) {
        yield* Console.log(encodeUnknownJson({ clients }));
        return;
      }
      if (clients.length === 0) {
        yield* Console.log("No local mTLS client certificates have been issued.");
        return;
      }
      const nowMs = yield* Clock.currentTimeMillis;
      const lines = clients.map((client) => {
        const status =
          client.revokedAt !== undefined
            ? `revoked (${client.revokedAt})`
            : Date.parse(client.expiresAt) <= nowMs
              ? "expired"
              : "active";
        return `${client.id}  ${client.label}  [${status}]  expires=${client.expiresAt}  sha256=${client.fingerprint256}`;
      });
      yield* Console.log(lines.join("\n"));
    }),
  ),
);

const mtlsRevokeCommand = Command.make("revoke", {
  ...authLocationFlags,
  identifier: Argument.String("id-or-fingerprint").pipe(
    Argument.withDescription("Client certificate id, serial number, or SHA-256 fingerprint."),
  ),
}).pipe(
  Command.withDescription("Revoke an issued local mTLS client certificate."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig(flags, logLevel);
      const revoked = yield* revokeMtlsClientCertificate({
        mtlsDir: config.mtlsDir,
        identifier: flags.identifier,
      });
      yield* Console.log(
        revoked
          ? `Revoked local mTLS client certificate ${revoked.id} (${revoked.label}).`
          : `No active local mTLS client certificate matched ${flags.identifier}.`,
      );
    }),
  ),
);

const mtlsStatusCommand = Command.make("status", {
  ...authLocationFlags,
  json: jsonFlag,
}).pipe(
  Command.withDescription("Show local mTLS CA, server certificate, and client counts."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const logLevel = yield* GlobalFlag.LogLevel;
      const config = yield* resolveCliAuthConfig(flags, logLevel, { quietLogs: flags.json });
      const paths = resolveMtlsPaths(config.mtlsDir);
      const initialized =
        NodeFS.existsSync(paths.caCertPath) && NodeFS.existsSync(paths.serverCertPath);
      const clients = listMtlsClientCertificates(config.mtlsDir);
      const nowMs = yield* Clock.currentTimeMillis;
      const activeClients = clients.filter(
        (c) => c.revokedAt === undefined && Date.parse(c.expiresAt) > nowMs,
      ).length;
      const revokedClients = clients.filter((c) => c.revokedAt !== undefined).length;
      const caX509 = initialized
        ? new NodeCrypto.X509Certificate(NodeFS.readFileSync(paths.caCertPath, "utf8"))
        : undefined;
      const serverX509 = initialized
        ? new NodeCrypto.X509Certificate(NodeFS.readFileSync(paths.serverCertPath, "utf8"))
        : undefined;

      const summary = {
        initialized,
        mtlsDir: paths.dir,
        caCertPath: paths.caCertPath,
        caFingerprint256: caX509?.fingerprint256 ?? null,
        serverCertPath: paths.serverCertPath,
        serverFingerprint256: serverX509?.fingerprint256 ?? null,
        serverExpiresAt: serverX509
          ? DateTime.formatIso(DateTime.makeUnsafe(Date.parse(serverX509.validTo)))
          : null,
        totalClients: clients.length,
        activeClients,
        revokedClients,
      };
      if (flags.json) {
        yield* Console.log(encodeUnknownJson(summary));
        return;
      }
      if (!initialized) {
        yield* Console.log(
          `Local mTLS PKI is not initialized (${paths.dir}). Run \`f4 auth mtls init\` or start with \`f4 serve --mtls\`.`,
        );
        return;
      }
      yield* Console.log(
        [
          "Local mTLS status: initialized",
          `Directory:      ${paths.dir}`,
          `CA SHA-256:     ${summary.caFingerprint256}`,
          `Server SHA-256: ${summary.serverFingerprint256}`,
          `Server expires: ${summary.serverExpiresAt}`,
          `Clients:        ${activeClients} active, ${revokedClients} revoked (${clients.length} total)`,
        ].join("\n"),
      );
    }),
  ),
);

export const mtlsCommand = Command.make("mtls").pipe(
  Command.withDescription("Manage local TLS 1.3 mutual-TLS (mTLS) certificates."),
  Command.withSubcommands([
    mtlsInitCommand,
    mtlsIssueCommand,
    mtlsListCommand,
    mtlsRevokeCommand,
    mtlsStatusCommand,
  ]),
);
