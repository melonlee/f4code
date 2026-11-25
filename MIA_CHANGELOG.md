# MIA changelog

What this fork ([MiaAI-Lab/f4code](https://github.com/MiaAI-Lab/f4code), branch `main`)
changes on top of upstream [T3 Code](https://github.com/pingdotgg/t3code). It is based on upstream
`b90e554e0` (2026-11-06). Newest first. Every change to the client–server protocol is additive, so
the official T3 Code mobile app keeps working against this fork's server.

## 2026-11-25: Rebrand to F4code, down to the identifiers

- **Name and wordmark**: M3 Code is now **F4code** everywhere — UI copy, window titles, i18n (all
  eight locales), docs, marketing copy, installer and artifact names. The `M3`/`T3` wordmark is
  replaced by a geometric **F4** mark drawn as vector paths in the same box as the old glyph, so
  Icon Composer scales and the Android export keep their existing framing.
- **New icon art, per channel**: production, development (blueprint grid), and nightly (violet sky,
  soft clouds) were regenerated from that mark — 1024px app icons, web favicons at 16/32/180/192/512,
  multi-size `.ico` containers, the Icon Composer layer SVGs under `assets/*/app-icon.icon/Assets`,
  the Android adaptive/splash/notification assets, and the README banners.
- **Internal identifiers renamed too**, unlike the 2026-11-24 pass: package scope `@t3tools/*` →
  `@f4code/*`, `T3CODE_*` → `F4CODE_*`, `T3_*` → `F4_*`, data directory `~/.t3` → `~/.f4`, deep links
  `t3code://` → `f4code://`, app identifiers `com.t3tools.*` → `com.f4code.*`, CLI binary `t3` → `f4`,
  directories (`apps/m3-server` → `apps/f4-server`, `apps/mobile/modules/t3-*` → `f4-*`), the
  Kotlin/Swift class names, and `pnpm-lock.yaml`.
- **Domains**: `t3.codes` / `app.t3.codes` → `f4code.dev` / `app.f4code.dev` placeholders. Nothing is
  hosted there yet; point the relay and update checks somewhere real before shipping a build.
- **Deliberately untouched**: upstream attribution (`pingdotgg/t3code` links, the MIT `LICENSE` with
  its original copyright, `third-party-licenses/`, `TRADEMARK.md` verbatim), vendored trees
  (`**/Vendor/`, `native/libghostty-vt`, `.repos/`, `patches/*.patch`) because their contents are not
  ours to rewrite, and base64/hash payloads that merely contain `t3`-looking bytes.

## 2026-11-24: Antigravity CLI update/path fixes, direct MCP wizard, and self-hosted M3 Server

- **Antigravity CLI settings & one-click update**: allowed custom `binaryPath` overrides to point at
  any executable wrapper/name, added `antigravity` alongside `agy` in PATH fallback discovery, and
  wired `ProviderMaintenanceRunner.updateProvider` for `antigravity` directly to
  `AntigravityInstallation.start` so one-click updates in Settings work.
- **Direct MCP wizard ("Use M3 Code in another app (MCP)")**: removed the hard `T3 Connect`
  block in `UseInAnotherAppDialog.tsx` and added `directMcpUrl` support to `resolveMcpGate` so
  local, LAN, and WireGuard environments open the MCP setup wizard directly without Clerk/T3 Connect.
- **Self-hosted M3 Server (`apps/m3-server`)**: added a standalone, zero-Clerk, zero-tracker Node +
  `node:sqlite` control-plane/discovery server (`npm run start:m3-server` / `node apps/m3-server/src/bin.ts`)
  supporting environment registration, online status, single-use pairing codes, and MCP endpoint
  discovery.

## 2026-11-24: Open PRs merged (#4, #5, #6, #7, #8, #9) and the fallout of #3

- **Merged**: #9 (inference gateway retry, usage meter and typecheck fixes), #6 (Antigravity
  scraper removal), #7 (WireGuard / mesh endpoints), #8 (SQLite cache and mmap, V8 cache, macOS glass
  fast path; the loopback WebSocket compression change was left out), #4 (Oh My Pi provider) and #5
  (LLM Gateway text generator).
- **Lockfile**: #3 left Clerk overrides in `pnpm-lock.yaml` and #4 added a workspace package with no
  entry, so `--frozen-lockfile` installs failed. The lockfile is regenerated.
- **Tests removed with the fetches they covered**: #3 dropped the usage price-table and model
  manifest fetches but kept their tests. The fetch-behavior tests are gone and the usage tests seed
  the local rates cache instead. Without a cached price table, usage cost figures stay empty.
- **`upstream-http` failures now have advice text** in `InferenceDiagnostics`; the case was missing.

## 2026-11-24: E2EE follow-ups after the first live run

- **The host now has an identity key.** `ServerE2eeIdentity.layer` was never provided in
  `server.ts`, so E2EE was inert in the real app (no fingerprint row, no key in pairing links).
- **Record writes are serialized**, and the frame splitter now wraps the E2EE socket, so large
  frames are still split before encryption.
- **Switches show without T3 Connect**: they moved out of the T3 Connect row into
  **Sharing & access → This machine**.
- **Pairing links carry the key only while E2EE is on**, since a pin makes the client demand it.
- **E2EE can be turned off from the UI**, with a warning that devices paired while it was on must
  pair again.
- **Script-import hardening** (shipped inside the E2EE commit): the t3.json import menu shows each
  script's command and its `setup` / `on settle` badges before you import it.
- **Guide**: README section and `docs/user/encrypted-remote-control.md`.
- **PR #3 merged**: Clerk, Expo OTA and the background upstream fetches are gone; the merge also
  fixed the desktop startup layer, a mobile type, and a relay test it had left failing.

## 2026-11-24: End-to-end encrypted remote control (transport guard + app-layer E2EE)

Two complementary protections for remote control, both opt-in and additive (the official T3 Code
mobile app keeps pairing and working; defaults are `remoteTransportPolicy: "any"` and
`e2eeMode: "off"`).

**Transport-level guard & visibility.**

- New server setting `remoteTransportPolicy` (`any` | `private-e2ee-only`). `private-e2ee-only`
  refuses remote WebSocket upgrades and authenticated HTTP requests classified as tunnel
  (Cloudflare/T3 Connect: `cf-connecting-ip`, `cf-ray`), plain-LAN, or proxied-from-public,
  answering only loopback (which includes SSH port-forwards) and Tailscale
  (100.64.0.0/10 + `fd7a:115c:a1e0::/48`). Rejection is `403` with code
  `REMOTE_TRANSPORT_NOT_ALLOWED` before authentication. Tunnels are also refused at the source:
  T3 Connect tunnel start/recovery fails with `CloudLinkTransportPolicyError` while the policy is
  on.
- The policy can always be turned back off from a connected session (the running WebSocket is not
  killed) or via `settings.json`, so a host cannot lock itself out.
- Connection security badge: web, desktop, and mobile environment rows now show how the active
  session is protected - `Local`, `E2EE (Tailscale / SSH)`, `E2EE` (app layer), `TLS only`, or
  `Unencrypted` (`packages/client-runtime/src/connection/presentation.ts`).

**Application-layer E2EE for the WebSocket RPC channel** (`packages/shared/src/socketE2ee.ts`).

- The server owns a long-lived Ed25519 identity keypair (stored in `ServerSecretStore` as
  `e2ee-identity-seed-v1`; delete that secret and restart to rotate - pinned clients then refuse
  the old key). `ServerConfig.transportSecurity` advertises the policy, mode, public key
  (base64url), and a `XXXX-XXXX-XXXX-XXXX` fingerprint.
- Clients pin the key from the pairing link's new `pk` hash parameter (embedded by `t3 pair`, the
  startup pairing URL, and the web pairing-URL builders) into the saved connection profile. On
  connect they append `?e2ee=1` and run an authenticated ephemeral X25519 handshake: the server
  signs the transcript with its identity key, the client verifies the signature AND the pin, then
  both derive XChaCha20-Poly1305 record keys with HKDF-SHA256. Every later frame is a binary
  record `[version][counter][ciphertext+tag]` with a strict monotonic counter - tampering, replay,
  reordering, plaintext injection, wrong pinned key (`E2EE_IDENTITY_MISMATCH`), and
  cross-environment transcripts all fail the socket. Fresh ephemerals per reconnect give forward
  secrecy. XChaCha20-Poly1305 (Effect's vendored, audited `@noble/ciphers` implementation) was
  chosen over AES-256-GCM because it runs on every surface, including mobile runtimes without
  `crypto.subtle`.
- New setting `e2eeMode` (`off` | `prefer` | `require`; default `off`). `prefer`: clients that pin
  get E2EE, everything else keeps working (official mobile app compatible). `require`: remote
  clients without `?e2ee=1` are refused with `403` code `E2EE_REQUIRED` (loopback excepted). A
  client asking for E2EE the server cannot offer gets `403` code `E2EE_NOT_SUPPORTED` - never a
  silent plaintext fallback. Settings UI (Connections): a "Private transports only" switch and an
  "End-to-end encryption" switch showing the verified fingerprint; turning the encryption off from
  the UI is intentionally blocked (pinned clients would break) - set `e2eeMode: "off"` in the
  host's `settings.json` instead.
- Known gaps: attachment/file HTTP endpoints are not covered by the app-layer tunnel (they remain
  protected by the transport); the web/mobile "require" mode selection and a rotate-key button are
  deferred - rotation today = delete `e2ee-identity-seed-v1` + restart.

## 2026-11-24: Remove Clerk, Expo OTA, and background upstream phone-home fetches

- **Removed all `@clerk/*` packages and integrations**: deleted `@clerk/backend`, `@clerk/clerk-js`, `@clerk/electron`, `@clerk/electron-passkeys`, `@clerk/expo`, `@clerk/expo-native-components`, `@clerk/react`, and `@clerk/shared` from `pnpm-workspace.yaml` and all app `package.json` files, removed `DesktopClerk`, `ClerkTokenStore`, web/mobile Clerk auth shells, `apps/mobile/clerk-theme.json`, `patches/@clerk__expo-native-components@0.4.4.patch`, desktop CSP allowlists for Clerk/Cloudflare challenges, and `.env.example` Clerk/relay defaults.
- **Removed Expo EAS OTA updates**: disabled `updates` and stripped `https://u.expo.dev/...` and upstream `eas.projectId` / `owner` from `apps/mobile/app.config.ts`.
- **Removed background upstream catalog & pricing fetches**: `ModelManifest` now serves only the bundled manifest (no fetch to `raw.githubusercontent.com/pingdotgg/t3code`), and `UsageService` loads only locally cached rates (no fetch to `raw.githubusercontent.com/BerriAI/litellm` or `api.github.com`).
- **Orphaned telemetry i18n strings & dead references**: removed 10 unused OTLP/trace-diagnostics translation keys across all 10 web locales, 3 unused crash-report translation keys across all 10 mobile locales, dead `OtlpEndpointCheck.test.ts` shard weight, dead `RpcInstrumentation.ts` doc link, and stale client-analytics test comment.

## 2026-11-24: Fix pre-existing inference gateway, retry, and typecheck bugs

Fixed runtime and typecheck bugs on `main`:

- `apps/server/src/inference/inferenceUsage.ts`: fixed `ReferenceError: sawContent is not defined`
  in top-level `readBody()` and properly parsed non-streaming response bodies across OpenAI
  chat/completions, Responses, and Anthropic Messages so valid non-streaming replies are no longer
  misclassified as empty and spuriously retried.
- `apps/server/src/inference/InferenceGateway.ts`: fixed retry target mutation of readonly
  `plan.success` (insert retry immediately on a mutable copy without bogus `index` property),
  reset the usage meter before retrying, use a fresh `requestId` for the failed pre-retry log row
  to avoid `inference_requests.request_id` primary-key collisions, and pass the watchdog stop
  reason to `finish("failed", "watchdog", reason)` so mid-stream watchdog stops record
  `watchdog-*` instead of `unknown`.
- `apps/server/src/inference/InferenceRetry.ts`: guarded `rejectedField` against non-object
  request bodies (`null`, arrays, primitives) instead of throwing `TypeError` on `in`.
- `apps/server/src/mcp/advertisedJsonSchema.test.ts` & `apps/mobile/src/Stack.tsx`: fixed
  pre-existing typecheck errors (`workspaceStrategy` schema narrowing and extra argument to
  0-arg `settingsPage()`).

## 2026-11-24: Remove Antigravity undocumented internal API usage scraper

- **Antigravity ToS compliance**: removed OS keyring / Windows Credential Manager OAuth token extraction, spoofed `antigravity/hub/2.24.0 (aidev_client; ...)` User-Agent, and undocumented `daily-cloudcode-pa.googleapis.com/v1internal:*` / `cloudcode-pa.googleapis.com/v1internal:*` quota calls from `apps/server/src/provider/antigravityUsageLimits.ts` and `apps/server/src/usage/cliproxyApi.ts`. The official `agy acp` agent driver remains intact.

## 2026-11-24: Direct WireGuard / mesh network exposure without Tailscale

- **Tailscale-free mesh endpoints**: `DesktopServerExposure` now detects active WireGuard and direct mesh/VPN interfaces (`wg*`, `utun*`, `tun*`, `tap*`, `nebula*`, `zt*`) in network-accessible mode and advertises them as first-class `Direct mesh (<iface>)` pairing/connection endpoints alongside the LAN address, without requiring Tailscale or T3 Connect.

## 2026-11-24: macOS & desktop performance and fluidity optimizations

- **SQLite unified-memory tuning**: configured `PRAGMA cache_size = -64000` (64 MiB page cache) and `PRAGMA mmap_size = 268435456` (256 MiB memory-mapped reads) in `apps/server/src/persistence/Sqlite.ts` to eliminate repeated `pread` syscalls during thread switches and search.
- **WebSocket compression stays on for every bind**: PR #8 turned it off on loopback binds, but Tailscale Serve and tunnels connect to loopback, so remote traffic would have lost compression. That part was left out.
- **Electron renderer V8 bytecode cache**: enabled `v8CacheOptions: "bypassHeatCheck"` on the main `BrowserWindow` in `apps/desktop/src/window/DesktopWindow.ts` for faster cold starts.
- **Zero-readback opaque & reduced-transparency CSS fast path**: set `data-glass-opaque="true"` at 100% glass opacity and honored `@media (prefers-reduced-transparency: reduce)` in `apps/web/src/index.css` to strip `backdrop-filter` completely instead of keeping `blur(0px) saturate(...)` compositor readback layers on macOS Retina.

## 2026-11-24: Add Oh My Pi (OMP) provider

- **New `@t3tools/provider-omp` package**: first-class OMP (`omp --mode rpc`) provider reusing `@t3tools/provider-pi`'s JSONL RPC adapter and status/text-generation/usage engine with OMP defaults (`driver: "omp"`, `binaryPath: "omp"`, `~/.omp/agent/sessions` usage transcripts, `DO_NOT_TRACK=1`, zero trackers).
- **Auto-detection & multi-surface wiring**: auto-enables `omp` when `omp` is on `PATH`, added to `packages/contracts`, `packages/client-runtime`, `apps/server`, `apps/web`, and `apps/mobile` (model picker, local model setup, custom model editor, and usage dashboard).

## 2026-11-24: LLM Gateway text generator

**Settings → Providers → Text generators → Add generator** lists **LLM Gateway** next to
OpenRouter: enter an [LLM Gateway](https://llmgateway.io) key to use any model it serves for thread
titles, commit messages, pull request text, branch names and voice cleanup. It is the existing
OpenAI-compatible generator with the base URL filled in (`https://api.llmgateway.io/v1`) and its
own icon. Nothing changes on the server or in the protocol.

## 2026-11-24: Updated M3 box icon

Compressed the updated `m3-code-box.png` at full resolution (1254×1254, 1.04 MB → 20.6 KB,
palette PNG) and regenerated all derived production icons across desktop, web, and mobile
(1024px Linux/macOS/iOS app icons, web favicons, apple-touch 180, PWA 192/512, `favicon.ico`,
Windows `.ico`, Android splash & monochrome mark, and the local desktop entry icon).

## 2026-11-24: Telemetry cleanup audit & typecheck fixes

Follow-up audit after removing telemetry and rebranding to M3 Code:

- Mobile: removed the leftover `expo-observe` import and `Observe.reportError` call from
  `RenderErrorBoundary.tsx`.
- Dependencies: removed `@alchemy.run/axiom` from `pnpm-workspace.yaml` and refreshed
  `pnpm-lock.yaml` so `expo-observe`, `@alchemy.run/axiom`, and `@distilled.cloud/axiom` are
  completely purged.
- Web & scripts: removed dead `VITE_RELAY_OTLP_TRACES_*` defines from Vite config/types and dead
  `T3CODE_TELEMETRY_ENABLED` / `T3_TASK_CACHE_TELEMETRY` env vars from dev-runner and smoke
  scripts.
- Server & docs: removed the unreachable `observability` check from managed-policy validation,
  cleaned up stale analytics/OTLP comments, and removed the obsolete `/feedback` section from
  `docs/user/providers-codex.md`.
- Typecheck: fixed missing `observability` compat fixture in `packages/client-runtime` session
  tests and provided `FileSystem | Path` context to `readBundledRemoteRuntime` in
  `apps/desktop/src/main.ts`.

## 2026-11-24: M3 Code rebrand, wordmark, icons & README

- **Renamed the app to M3 Code**: every user-visible name — window titles, splash, menus, About,
  PWA manifest, installer and artifact names (`M3-Code-*`), CLI messages, capture-helper errors,
  and docs — now says **M3 Code**. "T3 Connect" and "T3 Chat" keep their names (upstream-operated
  services). Functional identifiers are unchanged on purpose so nothing breaks: the `t3` CLI and
  npm package, `T3CODE_*` environment variables, `~/.t3` data directory, `t3code://` deep links,
  `com.t3tools.*` app identifiers, Electron profile (`t3code-v2`), legacy Windows migration names,
  and official T3 Code mobile app pairing.
- **M3 wordmark (web & mobile)**: replaced `T3Wordmark` with `M3Wordmark` in the sidebar,
  standalone pages, timeline icons, and mobile widgets; renamed sidebar aria-labels and mobile
  widget app-name strings.
- **Flat M3 monogram icons & banner**: replaced the ornate box art with a flat black tile and
  white M3 monogram, redrew the wide banner (`m3-code.png`, compressed to 72 KB at 1672×941),
  and regenerated all desktop, web, and mobile derived icon assets.
- **README & handoff**: added the wide M3 Code banner and zero-telemetry notice to `README.md`,
  updated the README title to `# M3 Code`, and added `handoff.md`.

## 2026-11-24: Local Linux build override

- Added `T3CODE_DESKTOP_GLIBC_CEILING` in `scripts/linux-glibc.ts` so local Linux desktop builds
  on newer toolchains can override the Ubuntu 24.04 glibc 2.39 release ceiling while keeping
  release builds pinned.

## 2026-11-24: Removed all telemetry

Every telemetry, analytics, tracing, and identity-collection pipeline is deleted from the code —
not disabled, removed. Nothing reports back to the fork maintainers, and no environment flag can
turn anything back on.

- Product analytics: the PostHog pipeline, `ingest.t3.codes`, the `T3CODE_TELEMETRY_ENABLED`
  opt-in, and every analytics call site (turn, provider, MCP tool, delegated-task, auth-flow
  events).
- Identity collection: the `Identify` module that read `~/.codex/auth.json` and `~/.claude.json`,
  install IDs, `distinct_id`, device identifiers, and client connection fingerprint parameters.
- Error and crash reporting: mobile crash reports (`expo-observe` → Axiom), the mobile source-map
  upload pipeline, and the crash-report setting.
- OpenTelemetry: server, desktop, web, and mobile OTLP exporters, the relay client tracer, and the
  diagnostics UI for trace spans, OTLP endpoints, and `T3CODE_OTEL_SDK_DISABLED` /
  `T3CODE_OTLP_*` switches.
- Relay tracing: relay connection spans, the relay's Axiom datasets and monitors, and mobile
  telemetry ingest on the relay.
- Task-cache telemetry: run summaries, the savings database, and the savings dashboard. The
  remote build cache itself keeps working.
- The managed-policy `telemetry` switch and the privacy-policy, FAQ, and settings text that
  described opting out; user docs now list the network calls that remain instead.
- Release channel env var renamed to `T3CODE_RELEASE_CHANNEL`.
- Compatibility: the server config still carries an `observability` object, because clients
  built from upstream contracts require the key (the official mobile app fails to decode the
  config without it). The object is inert — every signal off, and the server sends nothing.

## 2026-11-20: local-model reliability

### Added

- Upstream T3 Code changes are merged into this fork.
- Offline coding tests and sample projects to evaluate local models consistently.
- Clearer diagnostics for timeouts, cancellations, repetitive loops, and invalid responses.
- Reasoning-token tracking and actionable failure advice to the usage dashboard.
- Non-streaming replies (at most 1 MiB) receive at most one empty-reply retry and one retry that removes an explicitly rejected optional setting.
- A dated local-model improvement plan with measurable prerequisites for model benchmarks.

### Fixed

- Tool actions, cancelled requests, and network failures are not retried.
- The watchdog now reliably stops repetitive responses, including when repetition is detected in the final chunk.
- Worktree tools require the base Git reference only for the worktree strategy, where it is needed.
- Lean orchestration omits browser and device instructions only when their tools are unavailable; lean tool handling matches the lean MCP catalog.

### Improved

- Pi compaction preserves errors and unfinished work. Its instructions tell the model not to copy secrets; this is not a secret filter.
- Model-quality benchmarks have not been run because no local inference server was reachable.

## 2026-11-08: NoName

### Changed

- **Local agents switch on where they are found.** When a T3 server starts, it turns on Pi or
  OpenCode if the command is on its PATH, and NoName if a NoName server answers on port 8890, so
  they appear in the model picker without a trip to Settings. An agent configured on that machine
  before, including one turned off, is left as it is.

### Added

- **NoName provider.** T3 Code runs the NoName agent harness the way it runs Pi: add **NoName** in
  Settings → Providers (it reads `http://127.0.0.1:8890` unless **Server URL** says otherwise) and
  pick it in the model picker. Each thread is one NoName conversation in agent mode in the
  thread's folder. A small bridge (`t3 noname-acp`) speaks ACP to T3 Code and NoName's own HTTP
  API to NoName, so replies, reasoning, tool calls with diffs, plans, approvals (Allow once or
  Deny; NoName's lasting "Always allow" is not offered) and `ask_user` questions appear as they
  do for other agents. **Stop** waits until NoName confirms the turn ended. The model picker lists
  **NoName default** and every model of NoName's switched-on providers. Not yet: T3 tools inside
  NoName, rollback, and background writing.

## 2026-11-07, night: remote machines

### Added

- **SSH machines run this fork's server.** Machines added over SSH used to download upstream's
  release server, which has no inference servers, so **Add server** did nothing there. The desktop
  app now carries its own server for linux-x64 and linux-arm64 (DGX Spark) under a fork version
  (`0.1.7-mia.<commit time>.g<hash>`), uploads the right one over the existing SSH login when a
  machine lacks it, and the machine installs that upload instead of downloading. A new version
  replaces the server the app launched there the next time it connects. Build the archives with
  `scripts/mia-build-remote-runtime.sh [arm64-host]` before `vp run dist:desktop:linux`.
- **Add project dialog.** One window in two steps: pick a machine (this computer, connected
  machines, or a host from `~/.ssh/config`, which connects it), then click through its folders or
  type a path and press **Add project**. It opens from the **New project** button next to **New
  thread** in the sidebar and from **Ctrl+K → Add project**; the New thread list holds projects only. Cloning and empty projects moved to
  **Ctrl+K → Clone repository** and the dialog's **Clone or create new…**.
- **Add a server from another machine.** Settings → Inference on one machine lists the servers
  registered on your other connected machines with **Add here**, prefilled with the address this
  machine would use (`localhost` becomes the other machine's name). Keys are entered again.
- Settings → Inference says when a machine's server has no inference servers, instead of an
  **Add server** button that does nothing.

### Changed

- `T3CODE_CLI_SYSTEM_LIBATOMIC=1` builds a server archive without bundling libatomic, for hosts
  that have it installed (no patchelf needed).

## 2026-11-07, evening: local-model polish

### Added

- **Images for local models.** **Check images** on **Settings → Inference** asks a model to name
  the colour of four random test images (64 answer tokens each, 2 minutes at most, through the
  normal request queue) and marks it **Reads images** or **Text only**. A busy server or reasoning
  that runs out of room counts as "could not tell", never as text-only. Results are kept per server
  address and model across restarts, and the button returns a day later in case the weights changed.
- **Vision reported by the engine.** llama.cpp (`/props`), LM Studio (`/api/v0/models`) and Ollama
  (`/api/show`) say whether a model reads images, so those models are marked without a check.
- **Images reach the model.** Pi and OpenCode declare image input for a linked model unless it is
  known to read text only. Attaching an image to an unchecked model starts the check on its own, and
  the message box warns when a model will not see the image.
- **Runaway-reply watchdog.** T3's gateway stops a streamed local reply that repeats the same text
  (a 64–1024 character unit at least 8 times over 4 KB, seen twice), reasons for 128 KB without an
  answer or tool call, or sends nothing for 5 minutes before its first token (including a server
  that holds back its headers) or 2 minutes after. The harness gets the protocol's error event, the
  server's slot is freed, an immediate retry of the same run is refused for a minute, and the thread
  shows why with **Continue** and **Choose model**. Opt out per server with `watchdog.enabled: false`.
- **No longer served.** When a ready server stops listing the model a thread or the default uses,
  the message box says so and offers what it serves now.
- **Use a local model.** One step from first run, the model picker, the command palette or
  **Settings → Inference**: finds model servers on this machine (well-known ports and listening
  sockets, no keys sent), links an agent (Pi, then OpenCode, then Codex) and makes the model the
  default for new threads. Running it again reuses what it set up.
- **Repair a server.** When a server stops answering, **Find server** looks on its machine for where
  it moved and moves it there, keeping its name, key and linked agents; **Change address** edits it
  by hand. A thread whose agent depends on it says so above the message box.
- **The picker says where a model runs.** A local model shows its machine and server.
- **Sidebar thread cards** read title first, with one quiet line for a short project name, the
  branch when it is not the default, the pull request and the diff. Provider icons show only when
  threads use more than one.
- **Settled** collapses to one line, opens to the five most recent threads, and shows
  **Un-settle** on hover.

### Changed

- **Local models only** is strict: background writing never goes to the cloud, even before any
  local model is set up.
- A Codex instance linked to a server waits for it instead of falling back to the OpenAI login, and
  a removed or not-ready server is not a reason to use the cloud. Only turning the server off is.

### Reverted

- The settings restructure (nine destinations, a Models page, plain renames such as "Computers"
  and "Model servers") and the rename of **Settled** to "Done". Settings and thread states keep
  T3 Code's own pages and names so they match the mobile app. Local-model features live on
  **Settings → Inference**.

### Fixed (from Codex and GLM reviews)

- A streamed refusal counted as a tool call and switched off the reasoning limit.
- An idle tick landing as a reply ended could record a stop that never happened.
- Two image checks finishing together could save their results out of order.

## 2026-11-07, afternoon: appearance

- **Dark** is two-tone: gray sidebar and panels over a near-black main area. The original true-black
  dark is kept as **OLED**.
- The README covers only what this fork adds, with screenshots, and credits upstream.

## 2026-11-07, morning: local inference at the core

### Round 6: mobile and evals

- The mobile app shows Settings → Inference, Local compute and a thread's last request, read-only.
- `evals/mcp-tool-use` runs a local model through Pi, Codex and OpenCode side by side (`--harness`).
- Merged tool schemas say which fields each variant requires.

### Round 5: cache health

- Settings → Inference shows a TensorFold server's prompt cache health.
- A fallback server takes requests only while its server is down.

### Round 4: health and attribution

- Each server shows probe freshness, whether it reports cached tokens, and recent failures.
- Shared OpenCode gateway requests are counted per thread.
- Linked Pi compacts long threads from the server's prompt cache.
- Relinking a server applies to new sessions; running ones keep their route.
- Managed Codex gets a model catalog for the served models; an idle shared OpenCode restarts when its
  route changes.

### Round 3: fallback and more harnesses

- A server can name a fallback server; requests record cache observations, the parent run, the
  fallback origin and a static-prefix fingerprint.
- OpenCode and (experimentally) Codex use a linked server through T3's gateway; Responses namespace
  tools are flattened for servers that accept only plain function tools.
- Usage opens on Tokens when local inference is set up, and local runs are never priced as cloud
  spend.
- Relay connection traces are opt-in.

### Round 2: inference servers and the gateway

- **Settings → Inference** registers model servers, probes their models, context windows and load,
  and keeps API keys in the secret store.
- Provider instances link to a server and count as local while it is enabled; handoff budgets use
  the served context window.
- T3's inference gateway queues requests per server (chat before background writing), records
  tokens, queue wait, time to first token and decode speed (never the text), and shows a waiting
  thread its place in the queue.
- **Usage → Local compute** and the thread details' **Last request**.
- Linked Pi gets a managed `t3-<server>` provider and a lean T3 tool set (about 40% fewer prompt
  tokens with the same eval results on GLM).

### Round 1: local first

- Provider instances can be marked local; local instances come first and new threads default to them.
- Background writing (titles, commit messages, PR text, branch names, voice cleanup) prefers local
  models, with **Text generation fallback** defaulting to **Local models only**.
- Codex text generation keeps local launch arguments; handoffs fit small local context windows.
- Product analytics are opt-in.

## 2026-11-25 — Catch-up merge of upstream t3code

- Merged `upstream/main` (~890 commits). Kept telemetry, Clerk and upstream's agent-feedback feature removed.
- Upstream's 12 new migrations are registered as IDs 126-138 (131 left as a gap) and their files renumbered to match, because this fork already uses 103-125.
- Docs use upstream's numbered filenames; fork-only docs are listed in `docs/README.md`.
- Added `scripts/check-fork-invariants.sh` and `scripts/check-fork-protected.sh` (list in `scripts/fork-protected.txt`), and `.github/workflows/upstream-sync.yml` for nightly syncs.
