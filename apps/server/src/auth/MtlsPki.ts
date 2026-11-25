// Pure-Node X.509 v3 ECDSA P-256 PKI for local mTLS (no Cloudflare, no external binaries).
// @effect-diagnostics nodeBuiltinImport:off
import * as NodeCrypto from "node:crypto";
import * as NodeFS from "node:fs";
import * as NodeNet from "node:net";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

import { writeFileStringAtomically } from "@f4code/shared/atomicWrite";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const OID_ECDSA_WITH_SHA256 = "1.2.840.10045.4.3.2";
const OID_COMMON_NAME = "2.5.4.3";
const OID_ORGANIZATION = "2.5.4.10";
const OID_SUBJECT_KEY_ID = "2.5.29.14";
const OID_KEY_USAGE = "2.5.29.15";
const OID_SUBJECT_ALT_NAME = "2.5.29.17";
const OID_BASIC_CONSTRAINTS = "2.5.29.19";
const OID_AUTHORITY_KEY_ID = "2.5.29.35";
const OID_EXT_KEY_USAGE = "2.5.29.37";
const OID_SERVER_AUTH = "1.3.6.1.5.5.7.3.1";
const OID_CLIENT_AUTH = "1.3.6.1.5.5.7.3.2";

const DEFAULT_CA_TTL_DAYS = 3650;
const DEFAULT_SERVER_TTL_DAYS = 365;
const DEFAULT_CLIENT_TTL_DAYS = 90;
const SERVER_RENEWAL_LEAD_MS = 30 * 24 * 60 * 60 * 1000;

export const MtlsClientRecord = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  serialNumber: Schema.String,
  fingerprint256: Schema.String,
  createdAt: Schema.String,
  expiresAt: Schema.String,
  revokedAt: Schema.optional(Schema.String),
});
export type MtlsClientRecord = typeof MtlsClientRecord.Type;

const MtlsRegistryFile = Schema.Struct({
  version: Schema.Literal(1),
  clients: Schema.Array(MtlsClientRecord),
});
type MtlsRegistryFile = typeof MtlsRegistryFile.Type;
const MtlsRegistryJson = Schema.fromJsonString(MtlsRegistryFile);
const decodeRegistryJson = Schema.decodeSync(MtlsRegistryJson);
const encodeRegistryJson = Schema.encodeSync(MtlsRegistryJson);

export interface MtlsPaths {
  readonly dir: string;
  readonly caCertPath: string;
  readonly caKeyPath: string;
  readonly serverCertPath: string;
  readonly serverKeyPath: string;
  readonly clientsDir: string;
  readonly registryPath: string;
}

export interface MtlsServerMaterials {
  readonly caCertPem: string;
  readonly caFingerprint256: string;
  readonly serverCertPem: string;
  readonly serverKeyPem: string;
  readonly serverFingerprint256: string;
  readonly serverExpiresAt: string;
  readonly sans: ReadonlyArray<string>;
  readonly paths: MtlsPaths;
}

export interface IssuedMtlsClientBundle {
  readonly record: MtlsClientRecord;
  readonly certPem: string;
  readonly keyPem: string;
  readonly caCertPem: string;
  readonly certPath: string;
  readonly keyPath: string;
  readonly caCertPath: string;
}

export class MtlsPkiError extends Schema.TaggedError<MtlsPkiError>()("MtlsPkiError", {
  operation: Schema.String,
  detail: Schema.String,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return `Local mTLS PKI failed (${this.operation}): ${this.detail}`;
  }
}

export function resolveMtlsPaths(mtlsDir: string): MtlsPaths {
  return {
    dir: mtlsDir,
    caCertPath: NodePath.join(mtlsDir, "ca-cert.pem"),
    caKeyPath: NodePath.join(mtlsDir, "ca-key.pem"),
    serverCertPath: NodePath.join(mtlsDir, "server-cert.pem"),
    serverKeyPath: NodePath.join(mtlsDir, "server-key.pem"),
    clientsDir: NodePath.join(mtlsDir, "clients"),
    registryPath: NodePath.join(mtlsDir, "clients.json"),
  };
}

function derLength(length: number): Buffer {
  if (length < 0x80) return Buffer.from([length]);
  const bytes: Array<number> = [];
  let remaining = length;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function derTag(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), derLength(content.length), content]);
}

function derSequence(items: ReadonlyArray<Buffer>): Buffer {
  return derTag(0x30, Buffer.concat(items));
}

function derSet(items: ReadonlyArray<Buffer>): Buffer {
  return derTag(0x31, Buffer.concat(items));
}

function derIntegerBytes(raw: Buffer): Buffer {
  let start = 0;
  while (start < raw.length - 1 && raw[start] === 0x00) {
    start += 1;
  }
  const trimmed = raw.subarray(start);
  const needsZeroPrefix = (trimmed[0] ?? 0) >= 0x80;
  return derTag(0x02, needsZeroPrefix ? Buffer.concat([Buffer.from([0x00]), trimmed]) : trimmed);
}

function derInteger(value: number): Buffer {
  if (value === 0) return derTag(0x02, Buffer.from([0x00]));
  const bytes: Array<number> = [];
  let remaining = value;
  while (remaining > 0) {
    bytes.unshift(remaining & 0xff);
    remaining >>>= 8;
  }
  return derIntegerBytes(Buffer.from(bytes));
}

function derBoolean(value: boolean): Buffer {
  return derTag(0x01, Buffer.from([value ? 0xff : 0x00]));
}

function derBitString(bytes: Buffer, unusedBits = 0): Buffer {
  return derTag(0x03, Buffer.concat([Buffer.from([unusedBits]), bytes]));
}

function derOctetString(bytes: Buffer): Buffer {
  return derTag(0x04, bytes);
}

function derUtf8String(value: string): Buffer {
  return derTag(0x0c, Buffer.from(value, "utf8"));
}

function derOid(oid: string): Buffer {
  const arcs = oid.split(".").map((part) => Number.parseInt(part, 10));
  const first = arcs[0] ?? 0;
  const second = arcs[1] ?? 0;
  const out: Array<number> = [first * 40 + second];
  for (let i = 2; i < arcs.length; i += 1) {
    const value = arcs[i] ?? 0;
    if (value < 0x80) {
      out.push(value);
      continue;
    }
    const encoded: Array<number> = [];
    let remaining = value;
    encoded.unshift(remaining & 0x7f);
    remaining >>>= 7;
    while (remaining > 0) {
      encoded.unshift((remaining & 0x7f) | 0x80);
      remaining >>>= 7;
    }
    out.push(...encoded);
  }
  return derTag(0x06, Buffer.from(out));
}

function derExplicit(tagNumber: number, content: Buffer): Buffer {
  return derTag(0xa0 | tagNumber, content);
}

function derTime(date: Date): Buffer {
  const year = date.getUTCFullYear();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const mm = pad2(date.getUTCMonth() + 1);
  const dd = pad2(date.getUTCDate());
  const hh = pad2(date.getUTCHours());
  const mi = pad2(date.getUTCMinutes());
  const ss = pad2(date.getUTCSeconds());
  if (year >= 1950 && year <= 2049) {
    const yy = pad2(year % 100);
    return derTag(0x17, Buffer.from(`${yy}${mm}${dd}${hh}${mi}${ss}Z`, "ascii"));
  }
  return derTag(0x18, Buffer.from(`${year}${mm}${dd}${hh}${mi}${ss}Z`, "ascii"));
}

function derName(fields: ReadonlyArray<readonly [oid: string, value: string]>): Buffer {
  return derSequence(
    fields.map(([oid, value]) => derSet([derSequence([derOid(oid), derUtf8String(value)])])),
  );
}

function derExtension(oid: string, critical: boolean, value: Buffer): Buffer {
  const items: Array<Buffer> = [derOid(oid)];
  if (critical) items.push(derBoolean(true));
  items.push(derOctetString(value));
  return derSequence(items);
}

function parseIpv4Bytes(ip: string): Buffer {
  const octets = ip.split(".").map((part) => Number.parseInt(part, 10));
  return Buffer.from(octets);
}

function parseIpv6Bytes(ip: string): Buffer {
  const normalized = ip.startsWith("[") && ip.endsWith("]") ? ip.slice(1, -1) : ip;
  const zoneStripped = normalized.split("%")[0] ?? normalized;
  const [leftRaw, rightRaw] = zoneStripped.split("::");
  const expandPart = (part: string | undefined): Array<number> => {
    if (!part) return [];
    const groups: Array<number> = [];
    for (const token of part.split(":")) {
      if (token.includes(".")) {
        const ipv4 = parseIpv4Bytes(token);
        groups.push(((ipv4[0] ?? 0) << 8) | (ipv4[1] ?? 0));
        groups.push(((ipv4[2] ?? 0) << 8) | (ipv4[3] ?? 0));
      } else {
        groups.push(Number.parseInt(token, 16));
      }
    }
    return groups;
  };
  const left = expandPart(leftRaw);
  const right = rightRaw !== undefined ? expandPart(rightRaw) : [];
  const missing = rightRaw !== undefined ? Math.max(0, 8 - left.length - right.length) : 0;
  const full = [...left, ...Array<number>(missing).fill(0), ...right];
  const out = Buffer.alloc(16);
  for (let i = 0; i < 8; i += 1) {
    out.writeUInt16BE(full[i] ?? 0, i * 2);
  }
  return out;
}

function encodeSanExtension(sans: ReadonlyArray<string>): Buffer {
  const generalNames = sans.map((rawEntry) => {
    const entry = rawEntry.replace(/^\[(.*)\]$/, "$1");
    const ipVersion = NodeNet.isIP(entry);
    if (ipVersion === 4) {
      return derTag(0x87, parseIpv4Bytes(entry));
    }
    if (ipVersion === 6) {
      return derTag(0x87, parseIpv6Bytes(entry));
    }
    return derTag(0x82, Buffer.from(entry, "ascii"));
  });
  return derExtension(OID_SUBJECT_ALT_NAME, false, derSequence(generalNames));
}

function computeKeyId(publicKey: NodeCrypto.KeyObject): Buffer {
  const spki = publicKey.export({ type: "spki", format: "der" });
  return NodeCrypto.createHash("sha256").update(spki).digest().subarray(0, 20);
}

function generateSerialNumber(): { readonly bytes: Buffer; readonly hex: string } {
  const bytes = NodeCrypto.randomBytes(16);
  // Keep positive and ensure non-zero MSB so DER length is stable.
  bytes[0] = ((bytes[0] ?? 0) & 0x7f) | 0x01;
  return { bytes, hex: bytes.toString("hex").toUpperCase() };
}

function derToPem(label: string, der: Buffer): string {
  const b64 = der.toString("base64");
  const lines: Array<string> = [];
  for (let i = 0; i < b64.length; i += 64) {
    lines.push(b64.slice(i, i + 64));
  }
  return `-----BEGIN ${label}-----\n${lines.join("\n")}\n-----END ${label}-----\n`;
}

function normalizeCertSerial(serial: string): string {
  return serial
    .replace(/[^0-9a-fA-F]/g, "")
    .replace(/^0+/, "")
    .toUpperCase();
}

function normalizeCertFingerprint(fingerprint: string): string {
  return fingerprint.replace(/[^0-9a-fA-F]/g, "").toUpperCase();
}

function signX509Certificate(input: {
  readonly subjectCommonName: string;
  readonly issuerCommonName: string;
  readonly subjectPublicKey: NodeCrypto.KeyObject;
  readonly issuerPrivateKey: NodeCrypto.KeyObject;
  readonly issuerPublicKey: NodeCrypto.KeyObject;
  readonly notBefore: Date;
  readonly notAfter: Date;
  readonly isCa: boolean;
  readonly extendedKeyUsages?: ReadonlyArray<string>;
  readonly sans?: ReadonlyArray<string>;
}): {
  readonly pem: string;
  readonly serialNumber: string;
  readonly fingerprint256: string;
  readonly x509: NodeCrypto.X509Certificate;
} {
  const serial = generateSerialNumber();
  const sigAlg = derSequence([derOid(OID_ECDSA_WITH_SHA256)]);
  const subjectKeyId = computeKeyId(input.subjectPublicKey);
  const authorityKeyId = computeKeyId(input.issuerPublicKey);
  const spkiDer = input.subjectPublicKey.export({ type: "spki", format: "der" });

  const extensions: Array<Buffer> = [
    derExtension(
      OID_BASIC_CONSTRAINTS,
      true,
      input.isCa ? derSequence([derBoolean(true), derInteger(0)]) : derSequence([]),
    ),
    derExtension(
      OID_KEY_USAGE,
      true,
      input.isCa
        ? derBitString(Buffer.from([0x06]), 1) // keyCertSign (bit 5) | cRLSign (bit 6)
        : derBitString(Buffer.from([0x80]), 7), // digitalSignature (bit 0)
    ),
    derExtension(OID_SUBJECT_KEY_ID, false, derOctetString(subjectKeyId)),
    derExtension(OID_AUTHORITY_KEY_ID, false, derSequence([derTag(0x80, authorityKeyId)])),
  ];

  if (input.extendedKeyUsages && input.extendedKeyUsages.length > 0) {
    extensions.push(
      derExtension(
        OID_EXT_KEY_USAGE,
        false,
        derSequence(input.extendedKeyUsages.map((oid) => derOid(oid))),
      ),
    );
  }

  if (input.sans && input.sans.length > 0) {
    extensions.push(encodeSanExtension(input.sans));
  }

  const tbsDer = derSequence([
    derExplicit(0, derInteger(2)), // v3
    derIntegerBytes(serial.bytes),
    sigAlg,
    derName([
      [OID_ORGANIZATION, "F4code Local"],
      [OID_COMMON_NAME, input.issuerCommonName],
    ]),
    derSequence([derTime(input.notBefore), derTime(input.notAfter)]),
    derName([
      [OID_ORGANIZATION, "F4code Local"],
      [OID_COMMON_NAME, input.subjectCommonName],
    ]),
    spkiDer,
    derExplicit(3, derSequence(extensions)),
  ]);

  const signature = NodeCrypto.sign("sha256", tbsDer, {
    key: input.issuerPrivateKey,
    dsaEncoding: "der",
  });
  const certDer = derSequence([tbsDer, sigAlg, derBitString(signature, 0)]);
  const pem = derToPem("CERTIFICATE", certDer);
  const x509 = new NodeCrypto.X509Certificate(pem);
  return {
    pem,
    serialNumber: normalizeCertSerial(x509.serialNumber),
    fingerprint256: x509.fingerprint256,
    x509,
  };
}

function generateEcKeyPair(): {
  readonly privateKey: NodeCrypto.KeyObject;
  readonly publicKey: NodeCrypto.KeyObject;
  readonly privateKeyPem: string;
} {
  const { privateKey, publicKey } = NodeCrypto.generateKeyPairSync("ec", {
    namedCurve: "P-256",
  });
  const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
  return { privateKey, publicKey, privateKeyPem };
}

const VALID_DNS_SAN =
  /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

function isValidSanEntry(entry: string): boolean {
  if (entry.length === 0 || entry.length > 253) return false;
  if (NodeNet.isIP(entry) !== 0) return true;
  return VALID_DNS_SAN.test(entry);
}

const collectDefaultServerSans = Effect.fn("MtlsPki.collectDefaultServerSans")(function* (
  extraSans?: ReadonlyArray<string>,
) {
  const sans = new Set<string>(["localhost", "127.0.0.1", "::1"]);
  const hostname = NodeOS.hostname().trim();
  if (isValidSanEntry(hostname)) {
    sans.add(hostname);
  }
  const interfaces = NodeOS.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue;
      if (entry.family === "IPv4" && !entry.address.startsWith("169.254.")) {
        sans.add(entry.address);
      }
    }
  }
  for (const raw of extraSans ?? []) {
    const trimmed = raw.trim().replace(/^\[(.*)\]$/, "$1");
    if (trimmed.length === 0 || trimmed === "0.0.0.0" || trimmed === "::") {
      continue;
    }
    if (!isValidSanEntry(trimmed)) {
      return yield* new MtlsPkiError({
        operation: "validate-san",
        detail: `Invalid SAN entry "${raw}"; expected an IP address or RFC 1123 DNS hostname.`,
      });
    }
    sans.add(trimmed);
  }
  return [...sans].toSorted();
});

function parseCertificateSans(x509: NodeCrypto.X509Certificate): ReadonlyArray<string> {
  const raw = x509.subjectAltName;
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .map((entry) => entry.replace(/^(DNS|IP Address):/i, "").trim())
    .filter((entry) => entry.length > 0);
}

function canonicalSanKey(rawEntry: string): string {
  const entry = rawEntry.trim().replace(/^\[(.*)\]$/, "$1");
  const ipVersion = NodeNet.isIP(entry);
  if (ipVersion === 6) {
    return `ip6:${parseIpv6Bytes(entry).toString("hex")}`;
  }
  if (ipVersion === 4) {
    return `ip4:${entry}`;
  }
  return `dns:${entry.toLowerCase()}`;
}

function readRegistrySync(registryPath: string): MtlsRegistryFile {
  if (!NodeFS.existsSync(registryPath)) {
    return { version: 1, clients: [] };
  }
  const raw = NodeFS.readFileSync(registryPath, "utf8").trim();
  if (raw.length === 0) return { version: 1, clients: [] };
  return decodeRegistryJson(raw);
}

const writeFileWithMode = (filePath: string, contents: string, mode: number) =>
  writeFileStringAtomically({
    filePath,
    contents,
  }).pipe(
    Effect.tap(() =>
      Effect.sync(() => {
        try {
          NodeFS.chmodSync(filePath, mode);
        } catch {
          // Ignore chmod errors on filesystems without POSIX modes.
        }
      }),
    ),
  );

const writeSecretFile = (filePath: string, contents: string) =>
  writeFileWithMode(filePath, contents, 0o600);

function tryReadReusableServerCert(input: {
  readonly serverCertPath: string;
  readonly serverKeyPath: string;
  readonly caX509: NodeCrypto.X509Certificate;
  readonly desiredSans: ReadonlyArray<string>;
  readonly nowMs: number;
}): {
  readonly certPem: string;
  readonly keyPem: string;
  readonly x509: NodeCrypto.X509Certificate;
} | null {
  if (!NodeFS.existsSync(input.serverCertPath) || !NodeFS.existsSync(input.serverKeyPath)) {
    return null;
  }
  try {
    const existingCertPem = NodeFS.readFileSync(input.serverCertPath, "utf8");
    const existingKeyPem = NodeFS.readFileSync(input.serverKeyPath, "utf8");
    const existingX509 = new NodeCrypto.X509Certificate(existingCertPem);
    const validToMs = Date.parse(existingX509.validTo);
    const existingSans = new Set(parseCertificateSans(existingX509).map(canonicalSanKey));
    const coversSans = input.desiredSans.every((san) => existingSans.has(canonicalSanKey(san)));
    const signedByCa = existingX509.verify(input.caX509.publicKey);
    if (signedByCa && coversSans && validToMs - input.nowMs > SERVER_RENEWAL_LEAD_MS) {
      return { certPem: existingCertPem, keyPem: existingKeyPem, x509: existingX509 };
    }
    return null;
  } catch {
    return null;
  }
}

const ensureMtlsDirectories = (paths: MtlsPaths) =>
  Effect.try({
    try: () => {
      NodeFS.mkdirSync(paths.dir, { recursive: true, mode: 0o700 });
      NodeFS.mkdirSync(paths.clientsDir, { recursive: true, mode: 0o700 });
      try {
        NodeFS.chmodSync(paths.dir, 0o700);
        NodeFS.chmodSync(paths.clientsDir, 0o700);
      } catch {
        // Ignore chmod errors on platforms/filesystems without POSIX modes.
      }
    },
    catch: (cause) =>
      new MtlsPkiError({
        operation: "init-dirs",
        detail: `Could not create mTLS directory ${paths.dir}.`,
        cause,
      }),
  });

/**
 * Ensure a local CA and server certificate exist under `mtlsDir`, rotating the
 * server cert if it is near expiry, not signed by the current CA, or missing
 * any requested SANs.
 */
export const ensureLocalMtlsPki = Effect.fn("MtlsPki.ensureLocalMtlsPki")(function* (input: {
  readonly mtlsDir: string;
  readonly environmentId?: string;
  readonly extraSans?: ReadonlyArray<string>;
  readonly forceRegenerate?: boolean;
}) {
  const paths = resolveMtlsPaths(input.mtlsDir);
  yield* ensureMtlsDirectories(paths);

  const nowDt = yield* DateTime.now;
  const nowMs = DateTime.toEpochMillis(nowDt);
  // Backdate notBefore by 5 minutes to tolerate minor LAN clock skew.
  const notBefore = DateTime.toDateUtc(DateTime.makeUnsafe(nowMs - 5 * 60 * 1000));
  const envTag = input.environmentId ? input.environmentId.slice(0, 8) : "local";
  const caCommonName = `F4code Local CA (${envTag})`;

  let caCertPem: string;
  let caKeyPem: string;
  let caX509: NodeCrypto.X509Certificate;
  let caPrivateKey: NodeCrypto.KeyObject;

  const hasExistingCa =
    !input.forceRegenerate &&
    NodeFS.existsSync(paths.caCertPath) &&
    NodeFS.existsSync(paths.caKeyPath);

  if (hasExistingCa) {
    caCertPem = NodeFS.readFileSync(paths.caCertPath, "utf8");
    caKeyPem = NodeFS.readFileSync(paths.caKeyPath, "utf8");
    caX509 = new NodeCrypto.X509Certificate(caCertPem);
    caPrivateKey = NodeCrypto.createPrivateKey(caKeyPem);
  } else {
    const caKeys = generateEcKeyPair();
    const caNotAfter = DateTime.toDateUtc(
      DateTime.makeUnsafe(nowMs + DEFAULT_CA_TTL_DAYS * 24 * 60 * 60 * 1000),
    );
    const signedCa = signX509Certificate({
      subjectCommonName: caCommonName,
      issuerCommonName: caCommonName,
      subjectPublicKey: caKeys.publicKey,
      issuerPrivateKey: caKeys.privateKey,
      issuerPublicKey: caKeys.publicKey,
      notBefore,
      notAfter: caNotAfter,
      isCa: true,
    });
    caCertPem = signedCa.pem;
    caKeyPem = caKeys.privateKeyPem;
    caX509 = signedCa.x509;
    caPrivateKey = caKeys.privateKey;
    yield* writeFileWithMode(paths.caCertPath, caCertPem, 0o644).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "write-ca-cert",
            detail: `Could not write ${paths.caCertPath}.`,
            cause,
          }),
      ),
    );
    yield* writeSecretFile(paths.caKeyPath, caKeyPem).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "write-ca-key",
            detail: `Could not write ${paths.caKeyPath}.`,
            cause,
          }),
      ),
    );
  }

  const desiredSans = yield* collectDefaultServerSans(input.extraSans);
  const reusableServer = input.forceRegenerate
    ? null
    : tryReadReusableServerCert({
        serverCertPath: paths.serverCertPath,
        serverKeyPath: paths.serverKeyPath,
        caX509,
        desiredSans,
        nowMs,
      });

  let serverCertPem = reusableServer?.certPem;
  let serverKeyPem = reusableServer?.keyPem;
  let serverX509 = reusableServer?.x509;

  if (serverCertPem === undefined || serverKeyPem === undefined || serverX509 === undefined) {
    const serverKeys = generateEcKeyPair();
    const serverNotAfter = DateTime.toDateUtc(
      DateTime.makeUnsafe(nowMs + DEFAULT_SERVER_TTL_DAYS * 24 * 60 * 60 * 1000),
    );
    const issuerCnMatch = /CN=([^\n]+)/.exec(caX509.subject);
    const issuerCn = issuerCnMatch?.[1]?.trim() || caCommonName;
    const signedServer = signX509Certificate({
      subjectCommonName: "F4code Local Server",
      issuerCommonName: issuerCn,
      subjectPublicKey: serverKeys.publicKey,
      issuerPrivateKey: caPrivateKey,
      issuerPublicKey: caX509.publicKey,
      notBefore,
      notAfter: serverNotAfter,
      isCa: false,
      extendedKeyUsages: [OID_SERVER_AUTH],
      sans: desiredSans,
    });
    serverCertPem = signedServer.pem;
    serverKeyPem = serverKeys.privateKeyPem;
    serverX509 = signedServer.x509;
    yield* writeFileWithMode(paths.serverCertPath, serverCertPem, 0o644).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "write-server-cert",
            detail: `Could not write ${paths.serverCertPath}.`,
            cause,
          }),
      ),
    );
    yield* writeSecretFile(paths.serverKeyPath, serverKeyPem).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "write-server-key",
            detail: `Could not write ${paths.serverKeyPath}.`,
            cause,
          }),
      ),
    );
  }

  return {
    caCertPem,
    caFingerprint256: caX509.fingerprint256,
    serverCertPem,
    serverKeyPem,
    serverFingerprint256: serverX509.fingerprint256,
    serverExpiresAt: DateTime.formatIso(DateTime.makeUnsafe(Date.parse(serverX509.validTo))),
    sans: parseCertificateSans(serverX509),
    paths,
  } satisfies MtlsServerMaterials;
});

/**
 * Issue a new mTLS client certificate signed by the local CA and record it in
 * `<mtlsDir>/clients.json`.
 */
export const issueMtlsClientCertificate = Effect.fn("MtlsPki.issueMtlsClientCertificate")(
  function* (input: {
    readonly mtlsDir: string;
    readonly label: string;
    readonly ttlMs?: number;
    readonly outDir?: string;
    readonly environmentId?: string;
  }) {
    const materials = yield* ensureLocalMtlsPki({
      mtlsDir: input.mtlsDir,
      ...(input.environmentId === undefined ? {} : { environmentId: input.environmentId }),
    });
    const paths = materials.paths;
    const caX509 = new NodeCrypto.X509Certificate(materials.caCertPem);
    const caPrivateKey = NodeCrypto.createPrivateKey(NodeFS.readFileSync(paths.caKeyPath, "utf8"));

    const nowDt = yield* DateTime.now;
    const nowMs = DateTime.toEpochMillis(nowDt);
    const notBefore = DateTime.toDateUtc(DateTime.makeUnsafe(nowMs - 5 * 60 * 1000));
    const ttlMs = input.ttlMs ?? DEFAULT_CLIENT_TTL_DAYS * 24 * 60 * 60 * 1000;
    const notAfterDt = DateTime.makeUnsafe(nowMs + ttlMs);
    const notAfter = DateTime.toDateUtc(notAfterDt);

    const clientId = `mtls-${NodeCrypto.randomBytes(6).toString("hex")}`;
    const label = input.label.trim() || clientId;
    const clientKeys = generateEcKeyPair();
    const issuerCnMatch = /CN=([^\n]+)/.exec(caX509.subject);
    const issuerCn = issuerCnMatch?.[1]?.trim() || "F4code Local CA";

    const signedClient = signX509Certificate({
      subjectCommonName: label,
      issuerCommonName: issuerCn,
      subjectPublicKey: clientKeys.publicKey,
      issuerPrivateKey: caPrivateKey,
      issuerPublicKey: caX509.publicKey,
      notBefore,
      notAfter,
      isCa: false,
      extendedKeyUsages: [OID_CLIENT_AUTH],
    });

    const record: MtlsClientRecord = {
      id: clientId,
      label,
      serialNumber: signedClient.serialNumber,
      fingerprint256: signedClient.fingerprint256,
      createdAt: DateTime.formatIso(nowDt),
      expiresAt: DateTime.formatIso(notAfterDt),
    };

    const targetDir = input.outDir ? NodePath.resolve(input.outDir) : paths.clientsDir;
    yield* Effect.try({
      try: () => {
        NodeFS.mkdirSync(targetDir, { recursive: true, mode: 0o700 });
      },
      catch: (cause) =>
        new MtlsPkiError({
          operation: "create-client-out-dir",
          detail: `Could not create directory ${targetDir}.`,
          cause,
        }),
    });

    const certPath = NodePath.join(targetDir, `${clientId}.cert.pem`);
    const keyPath = NodePath.join(targetDir, `${clientId}.key.pem`);
    const caCertPath = input.outDir ? NodePath.join(targetDir, "ca-cert.pem") : paths.caCertPath;

    yield* writeFileWithMode(certPath, signedClient.pem, 0o644).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "write-client-cert",
            detail: `Could not write ${certPath}.`,
            cause,
          }),
      ),
    );
    yield* writeSecretFile(keyPath, clientKeys.privateKeyPem).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "write-client-key",
            detail: `Could not write ${keyPath}.`,
            cause,
          }),
      ),
    );
    if (input.outDir) {
      yield* writeFileWithMode(caCertPath, materials.caCertPem, 0o644).pipe(
        Effect.mapError(
          (cause) =>
            new MtlsPkiError({
              operation: "copy-ca-cert",
              detail: `Could not write ${caCertPath}.`,
              cause,
            }),
        ),
      );
    }

    const registry = readRegistrySync(paths.registryPath);
    const updated: MtlsRegistryFile = {
      version: 1,
      clients: [...registry.clients, record],
    };
    yield* writeSecretFile(paths.registryPath, `${encodeRegistryJson(updated)}\n`).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "write-registry",
            detail: `Could not update ${paths.registryPath}.`,
            cause,
          }),
      ),
    );

    return {
      record,
      certPem: signedClient.pem,
      keyPem: clientKeys.privateKeyPem,
      caCertPem: materials.caCertPem,
      certPath,
      keyPath,
      caCertPath,
    } satisfies IssuedMtlsClientBundle;
  },
);

export const listMtlsClientCertificates = (mtlsDir: string): ReadonlyArray<MtlsClientRecord> => {
  const paths = resolveMtlsPaths(mtlsDir);
  return readRegistrySync(paths.registryPath).clients;
};

/**
 * Revoke an issued client certificate by id, serial number, or SHA-256 fingerprint.
 * Returns the revoked record, or `null` if no matching unrevoked client exists.
 */
export const revokeMtlsClientCertificate = Effect.fn("MtlsPki.revokeMtlsClientCertificate")(
  function* (input: { readonly mtlsDir: string; readonly identifier: string }) {
    const paths = resolveMtlsPaths(input.mtlsDir);
    const registry = readRegistrySync(paths.registryPath);
    const needle = input.identifier.trim();
    const needleSerial = normalizeCertSerial(needle);
    const needleFingerprint = normalizeCertFingerprint(needle);

    let revokedRecord: MtlsClientRecord | null = null;
    const nowIso = DateTime.formatIso(yield* DateTime.now);
    const updatedClients: Array<MtlsClientRecord> = [];
    for (const client of registry.clients) {
      if (client.revokedAt === undefined && revokedRecord === null) {
        const matches =
          client.id === needle ||
          (needleSerial.length > 0 && normalizeCertSerial(client.serialNumber) === needleSerial) ||
          (needleFingerprint.length > 0 &&
            normalizeCertFingerprint(client.fingerprint256) === needleFingerprint);
        if (matches) {
          revokedRecord = { ...client, revokedAt: nowIso };
          updatedClients.push(revokedRecord);
          continue;
        }
      }
      updatedClients.push(client);
    }

    if (revokedRecord === null) return null;

    yield* writeSecretFile(
      paths.registryPath,
      `${encodeRegistryJson({ version: 1, clients: updatedClients })}\n`,
    ).pipe(
      Effect.mapError(
        (cause) =>
          new MtlsPkiError({
            operation: "revoke-client",
            detail: `Could not update ${paths.registryPath}.`,
            cause,
          }),
      ),
    );

    return revokedRecord;
  },
);

/**
 * Check whether a peer certificate (by serial number or SHA-256 fingerprint) has
 * been revoked in `<mtlsDir>/clients.json`. Reads directly from disk so revocations
 * made via CLI take effect immediately on the running server.
 */
export function isMtlsClientRevoked(
  mtlsDir: string,
  peer: {
    readonly serialNumber?: string | undefined;
    readonly fingerprint256?: string | undefined;
  },
): boolean {
  const paths = resolveMtlsPaths(mtlsDir);
  if (!NodeFS.existsSync(paths.registryPath)) {
    return false;
  }
  let registry: MtlsRegistryFile;
  try {
    registry = readRegistrySync(paths.registryPath);
  } catch {
    // Fail closed if an existing revocation registry cannot be read or parsed.
    return true;
  }
  const peerSerial = peer.serialNumber ? normalizeCertSerial(peer.serialNumber) : "";
  const peerFingerprint = peer.fingerprint256 ? normalizeCertFingerprint(peer.fingerprint256) : "";
  return registry.clients.some((client) => {
    if (client.revokedAt === undefined) return false;
    return (
      (peerSerial.length > 0 && normalizeCertSerial(client.serialNumber) === peerSerial) ||
      (peerFingerprint.length > 0 &&
        normalizeCertFingerprint(client.fingerprint256) === peerFingerprint)
    );
  });
}

/**
 * Issue a short-lived ephemeral client cert in memory (without writing to disk or
 * cluttering `clients.json`) for local CLI commands talking to the running mTLS server.
 */
export function issueEphemeralLocalCliClientCert(mtlsDir: string): {
  readonly caCertPem: string;
  readonly certPem: string;
  readonly keyPem: string;
} | null {
  const paths = resolveMtlsPaths(mtlsDir);
  if (!NodeFS.existsSync(paths.caCertPath) || !NodeFS.existsSync(paths.caKeyPath)) {
    return null;
  }
  const caCertPem = NodeFS.readFileSync(paths.caCertPath, "utf8");
  const caKeyPem = NodeFS.readFileSync(paths.caKeyPath, "utf8");
  const caX509 = new NodeCrypto.X509Certificate(caCertPem);
  const caPrivateKey = NodeCrypto.createPrivateKey(caKeyPem);
  const clientKeys = generateEcKeyPair();
  const nowMs = DateTime.toEpochMillis(DateTime.nowUnsafe());
  const issuerCnMatch = /CN=([^\n]+)/.exec(caX509.subject);
  const issuerCn = issuerCnMatch?.[1]?.trim() || "F4code Local CA";
  const signed = signX509Certificate({
    subjectCommonName: "F4code Local CLI",
    issuerCommonName: issuerCn,
    subjectPublicKey: clientKeys.publicKey,
    issuerPrivateKey: caPrivateKey,
    issuerPublicKey: caX509.publicKey,
    notBefore: DateTime.toDateUtc(DateTime.makeUnsafe(nowMs - 5 * 60 * 1000)),
    notAfter: DateTime.toDateUtc(DateTime.makeUnsafe(nowMs + 10 * 60 * 1000)),
    isCa: false,
    extendedKeyUsages: [OID_CLIENT_AUTH],
  });
  return {
    caCertPem,
    certPem: signed.pem,
    keyPem: clientKeys.privateKeyPem,
  };
}
