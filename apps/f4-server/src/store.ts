import * as NodeCrypto from "node:crypto";
import * as NodeFs from "node:fs";
import * as NodePath from "node:path";
import { DatabaseSync } from "node:sqlite";

export interface F4EnvironmentRecord {
  readonly id: string;
  readonly label: string;
  readonly endpoints: ReadonlyArray<string>;
  readonly mcpUrl: string | null;
  readonly e2eeFingerprint: string | null;
  readonly platform: string | null;
  readonly version: string | null;
  readonly lastSeenAt: number;
  readonly createdAt: number;
}

export interface F4EnvironmentPublic extends F4EnvironmentRecord {
  readonly online: boolean;
}

export interface F4PairingCodeRecord {
  readonly code: string;
  readonly environmentId: string;
  readonly scopes: ReadonlyArray<string>;
  readonly expiresAt: number;
  readonly createdAt: number;
}

export interface RegisterEnvironmentInput {
  readonly id: string;
  readonly label: string;
  readonly endpoints: ReadonlyArray<string>;
  readonly mcpUrl?: string | null;
  readonly e2eeFingerprint?: string | null;
  readonly platform?: string | null;
  readonly version?: string | null;
}

const DEFAULT_ONLINE_TTL_MS = 90_000;
const DEFAULT_PAIRING_TTL_MS = 5 * 60_000;

export class F4ServerStore {
  readonly #db: DatabaseSync;
  readonly #onlineTtlMs: number;

  constructor(dbPath: string, options?: { readonly onlineTtlMs?: number }) {
    if (dbPath !== ":memory:") {
      NodeFs.mkdirSync(NodePath.dirname(dbPath), { recursive: true });
    }
    this.#db = new DatabaseSync(dbPath);
    this.#onlineTtlMs = options?.onlineTtlMs ?? DEFAULT_ONLINE_TTL_MS;
    this.#db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = NORMAL;
      PRAGMA busy_timeout = 5000;

      CREATE TABLE IF NOT EXISTS f4_environments (
        id TEXT PRIMARY KEY,
        label TEXT NOT NULL,
        endpoints_json TEXT NOT NULL,
        mcp_url TEXT,
        e2ee_fingerprint TEXT,
        platform TEXT,
        version TEXT,
        last_seen_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS f4_pairing_codes (
        code TEXT PRIMARY KEY,
        environment_id TEXT NOT NULL,
        scopes_json TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_f4_pairing_expires ON f4_pairing_codes(expires_at);
    `);
  }

  close(): void {
    this.#db.close();
  }

  registerEnvironment(input: RegisterEnvironmentInput, now = Date.now()): F4EnvironmentPublic {
    const existing = this.#db
      .prepare("SELECT created_at FROM f4_environments WHERE id = ?")
      .get(input.id) as { created_at: number } | undefined;
    const createdAt = existing?.created_at ?? now;
    const endpointsJson = JSON.stringify([...new Set(input.endpoints)]);
    this.#db
      .prepare(
        `INSERT INTO f4_environments (
          id, label, endpoints_json, mcp_url, e2ee_fingerprint, platform, version, last_seen_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          label = excluded.label,
          endpoints_json = excluded.endpoints_json,
          mcp_url = excluded.mcp_url,
          e2ee_fingerprint = excluded.e2ee_fingerprint,
          platform = excluded.platform,
          version = excluded.version,
          last_seen_at = excluded.last_seen_at`,
      )
      .run(
        input.id,
        input.label,
        endpointsJson,
        input.mcpUrl ?? null,
        input.e2eeFingerprint ?? null,
        input.platform ?? null,
        input.version ?? null,
        now,
        createdAt,
      );
    return this.getEnvironment(input.id, now)!;
  }

  getEnvironment(id: string, now = Date.now()): F4EnvironmentPublic | null {
    const row = this.#db
      .prepare("SELECT * FROM f4_environments WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? this.#rowToEnv(row, now) : null;
  }

  listEnvironments(now = Date.now()): ReadonlyArray<F4EnvironmentPublic> {
    const rows = this.#db
      .prepare("SELECT * FROM f4_environments ORDER BY last_seen_at DESC")
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => this.#rowToEnv(row, now));
  }

  deleteEnvironment(id: string): boolean {
    this.#db.prepare("DELETE FROM f4_pairing_codes WHERE environment_id = ?").run(id);
    const result = this.#db.prepare("DELETE FROM f4_environments WHERE id = ?").run(id);
    return Number(result.changes) > 0;
  }

  createPairingCode(
    environmentId: string,
    scopes: ReadonlyArray<string> = ["mcp"],
    options?: { readonly ttlMs?: number; readonly now?: number },
  ): F4PairingCodeRecord | null {
    const now = options?.now ?? Date.now();
    this.pruneExpiredPairings(now);
    const env = this.getEnvironment(environmentId, now);
    if (!env) return null;
    const raw = NodeCrypto.randomBytes(6).toString("hex").toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}`;
    const expiresAt = now + (options?.ttlMs ?? DEFAULT_PAIRING_TTL_MS);
    this.#db
      .prepare(
        `INSERT INTO f4_pairing_codes (code, environment_id, scopes_json, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(code, environmentId, JSON.stringify([...scopes]), expiresAt, now);
    return { code, environmentId, scopes: [...scopes], expiresAt, createdAt: now };
  }

  redeemPairingCode(
    code: string,
    now = Date.now(),
  ): { readonly environment: F4EnvironmentPublic; readonly scopes: ReadonlyArray<string> } | null {
    this.pruneExpiredPairings(now);
    const normalized = code.trim().toUpperCase();
    const row = this.#db
      .prepare("SELECT * FROM f4_pairing_codes WHERE code = ? AND expires_at > ?")
      .get(normalized, now) as Record<string, unknown> | undefined;
    if (!row) return null;
    const deleted = this.#db
      .prepare("DELETE FROM f4_pairing_codes WHERE code = ?")
      .run(normalized);
    if (Number(deleted.changes) === 0) return null;
    const environment = this.getEnvironment(String(row.environment_id), now);
    if (!environment) return null;
    const scopes = JSON.parse(String(row.scopes_json)) as ReadonlyArray<string>;
    return { environment, scopes };
  }

  pruneExpiredPairings(now = Date.now()): void {
    this.#db.prepare("DELETE FROM f4_pairing_codes WHERE expires_at <= ?").run(now);
  }

  #rowToEnv(row: Record<string, unknown>, now: number): F4EnvironmentPublic {
    const lastSeenAt = Number(row.last_seen_at);
    return {
      id: String(row.id),
      label: String(row.label),
      endpoints: JSON.parse(String(row.endpoints_json)) as ReadonlyArray<string>,
      mcpUrl: row.mcp_url === null ? null : String(row.mcp_url),
      e2eeFingerprint: row.e2ee_fingerprint === null ? null : String(row.e2ee_fingerprint),
      platform: row.platform === null ? null : String(row.platform),
      version: row.version === null ? null : String(row.version),
      lastSeenAt,
      createdAt: Number(row.created_at),
      online: now - lastSeenAt <= this.#onlineTtlMs,
    };
  }
}
