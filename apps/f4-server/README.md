# F4 Server

Self-hosted, zero-Clerk, zero-tracker control plane & discovery relay for **F4code**. Replaces F4 Connect's hosted Cloudflare/Clerk/PlanetScale stack with a single Node + SQLite process you own (run it on your MacBook, DGX Spark, or any WireGuard/VPS host).

## Quick Start

```bash
node apps/f4-server/src/bin.ts
```

Environment variables:

- `F4_SERVER_HOST` — bind address (default `127.0.0.1`; set `0.0.0.0` or your WireGuard IP for remote access)
- `F4_SERVER_PORT` — port (default `8787`)
- `F4_SERVER_DATA_DIR` — state & SQLite directory (default `~/.f4-server`)
- `F4_SERVER_TOKEN` — bearer token (auto-generated into `~/.f4-server/admin-token` with `0600` permissions if omitted)

## Endpoints

- `GET /health` — liveness & online environment count
- `GET /v1/environments` — list registered environments and their LAN/WireGuard/HTTPS + MCP URLs
- `POST /v1/environments/register` — register or heartbeat an F4code environment
- `DELETE /v1/environments/:id` — unlink an environment
- `POST /v1/environments/:id/pairing` — create a single-use 5-minute pairing code
- `POST /v1/pairing/redeem` — atomically redeem a pairing code for target endpoints & E2EE fingerprint
- `GET /v1/mcp/endpoints` — list online MCP URLs across registered environments
