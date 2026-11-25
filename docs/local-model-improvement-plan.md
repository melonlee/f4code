# Local-model improvement plan

## Goal

Make F4code a more reliable, economical interface for local coding agents by improving **task success per context token and GPU-second**, rather than adding another inference backend.

The fork already has local-server discovery, strict local-only routing, per-server queuing, prompt-cache diagnostics, watchdogs, fallback, vision probes, and Pi/OpenCode/Codex integration. This plan extends those strengths with better measurements, protocol recovery, model-specific defaults, prompt economy, and compaction.

This is a staged implementation plan, not one large change. Each phase should land independently and establish a baseline before the next changes behavior.

## Existing evidence

The current MCP/tool-use eval reports (`evals/mcp-tool-use/README.md`):

| Harness  | Pass rate | Tokens/sample | Visible issue                                     |
| -------- | --------: | ------------: | ------------------------------------------------- |
| Pi lean  |       67% |          ~46k | Best token economy, but limited scenario coverage |
| Codex    |       78% |          ~91k | Full tool catalog and comparatively large prompts |
| OpenCode |       66% |          ~70k | Invalid schemas, empty replies, and extra calls   |

These results are directional, not a universal model ranking. The fixtures simulate shell behavior and do not exercise real editing, actual compaction, or resume. Measurements must capture **time to first useful action**, not just time to first stream event: reasoning tokens can delay the first visible token.

## Principles

- Establish task-level measurements before tuning prompts or retries.
- Keep model-specific knowledge in provider/inference boundaries, not orchestration handlers.
- Recover only from failures where replay cannot repeat tool execution or user-visible work.
- Preserve a stable tool/prompt prefix for prefix caching.
- Never silently send a local-only request to a cloud provider.
- Expose capabilities honestly when a lean profile disables a feature.
- Keep web/desktop/mobile contracts compatible; prefer additive fields over breaking schema changes.

## Phase 0 — Freeze the baseline and choose fixtures

### Work

1. Select two or three representative local models across sizes/families that the maintainer already runs.
2. Record model, quantization, server/version, protocol, harness, context size, GPU/hardware, sampling defaults, and F4code revision.
3. Freeze the existing MCP/tool-use result as the compatibility baseline.
4. Define result directories and a repeatable command for the new coding eval; use an isolated copy of real configuration rather than the live F4 database.
5. Record the baseline before implementing recovery or profile changes.

### Exit criteria

- Every baseline result identifies the exact model/server/harness configuration and revision.
- Identical fixtures are runnable through Pi, OpenCode, and Codex.
- Results are reproducible without paid cloud providers or access to live user state.

## Phase 1 — Add a real coding-task eval

Add `evals/local-coding/` with disposable fixture repositories and a result schema shared across harnesses.

### Initial fixtures

Use 10–20 deterministic cases, adding more only when they expose distinct behavior:

- Find and fix one bug; pass the focused test without unrelated edits.
- Search a repository and honor project instructions before editing.
- Recover from a failing test using its actual error.
- Read/search large output safely without repeatedly fetching the same content.
- Make a small coordinated multi-file change.
- Preserve exact requirements and pending work after real compaction.
- Resume after restart without repeating committed tool work.
- Decline or explain an unsupported capability rather than inventing a tool call.

Run each baseline configuration at least three times where variance matters; report individual runs as well as aggregates. Do not hide failed runs by retrying until one passes.

### Metrics

- Correct final diff and tests passing.
- Successful completion versus stalled/cancelled/watchdog-stopped run.
- Model calls, tool calls, invalid calls, repeated attempts, and empty replies.
- Prompt/completion/reasoning tokens, cache hits when available, and wall time.
- Time to first useful tool/edit action.
- Success and retained requirements before/after compaction and resume.

### Touchpoints

- New `evals/local-coding/` harness, fixtures, README, and result schema.
- Existing `evals/mcp-tool-use/harness-metrics.ts` concepts where reuse avoids duplication.
- Existing eval reporting conventions; compare before/after on the same fixtures.

### Exit criteria

- The harness creates a fresh repository per run and inspects the resulting diff/tests, not just model prose.
- A known-bad fixture result fails while the corresponding repaired result passes.
- All three harnesses produce comparable metrics, with unsupported fields explicitly absent rather than fabricated.
- Baseline results are recorded in `evals/local-coding/README.md` with scenario count and repeated-run count.

### Tradeoff

Real-agent evals take GPU time. Keep the default gate small and deterministic, and reserve longer multi-model matrices for manual/local release testing.

## Phase 2 — Sanitized failure diagnosis

### Work

1. Add a bounded failure-category/status field to inference request metadata.
2. Classify transport, cancellation, upstream HTTP errors, context overflow, unsupported request fields, tool format/schema rejection, empty completed replies, idle/repetition/excessive reasoning, and watchdog termination.
3. Preserve protocol and HTTP status where safe; do not persist prompts, completions, tool arguments, or private headers.
4. Expose a readable diagnosis and suggested next action in thread/server diagnostics.
5. Add completion/reasoning token fields when supplied by the server and retain existing cache metrics.
6. Add per-model aggregates alongside per-server aggregates without sending large event payloads over the websocket.

### Likely touchpoints

- `apps/server/src/inference/InferenceGateway.ts`
- `apps/server/src/inference/inferenceUsage.ts`
- `apps/server/src/inference/InferenceAdmission.ts`
- `apps/server/src/persistence/InferenceRequests.ts`
- `packages/contracts/src/inference.ts`
- Existing web local-server diagnostics; shared client-runtime contracts for desktop/mobile.
- Localization via `vp run i18n:generate` and `vp run i18n:check` for new UI strings.

### Exit criteria

- Representative gateway/parser unit tests produce the intended bounded category for each failure class.
- Redaction tests show raw prompt/response/header data is absent from diagnostics.
- Older persisted records and clients tolerate missing additive fields.
- The user can distinguish a context problem from a dead server or malformed tool call in the existing UI.

### Tradeoff

Classification relies on imperfect upstream messages. Unknown responses must remain `unknown`, not be assigned a confident but incorrect repair.

## Phase 3 — Bounded, safe recovery

Implement only recovery demonstrated by Phase 1/2 failures. Start with empty completed replies and recognized optional-field incompatibility.

### Work

1. Retry an empty completed reply once with the identical logical request, only when no replayable output/tool work occurred.
2. Retry once without a specifically recognized unsupported optional field.
3. Invoke the provider's real compaction flow on context overflow; do not blindly truncate or replay the conversation.
4. Return a useful unsupported-capability diagnosis instead of repeated retries.
5. Verify advertised tool schemas and runtime decoding agree. In particular, test the `workspaceStrategy.baseRef` compatibility path.
6. Keep tool execution outside automatic retry, and keep outage fallback separate from overflow recovery.

### Touchpoints

- `apps/server/src/inference/InferenceGateway.ts`
- `apps/server/src/inference/inferenceUsage.ts`
- `packages/provider-pi/`, `packages/provider-opencode/`, and Codex adapters only where their protocol requires it.
- Focused tests beside each changed parser/adapter/gateway module.

### Exit criteria

- Tests fail on the previous behavior for one empty reply and one recognized unsupported field, then pass with exactly one bounded retry.
- Streaming partial content, tool calls, cancellation, and transport failures do not cause unsafe replay.
- Retry attempts and the final result remain visible in sanitized inference diagnostics.
- The coding/MCP eval reports no regression in success or unnecessary call count on the unchanged baseline configuration.

### Tradeoff

Every retry can double GPU work. Restrict retries to failures that demonstrably happened before consequential work; do not turn malformed prose into tool calls or silently weaken schemas.

## Phase 4 — Local model/harness profiles

**Paused awaiting a measurement prerequisite (20 November 2026).** The local inference probe remains unavailable. Do not add a generic profile whose reasoning, schema, compaction, or parallel-tool fields a harness ignores. Keep Pi's explicit `auto`/`full`/`lean` tool setting: automatic means lean only for a linked local inference server and full otherwise, so capability changes are visible without inventing unsupported defaults. Named `fast`/`balanced`/`capable`/`custom` recommendations require same-fixture comparisons on a running local model; no recommendation has been measured.

### Work

1. Add an explicit local profile per server/model/harness, initially supporting `fast`, `balanced`, `capable`, and `custom`.
2. Include harness/tool mode, reasoning default, compaction reserve, parallel-tool support, schema strictness, and known protocol recovery options.
3. Derive suggestions only from discovered capabilities and measured results; leave an obvious user override.
4. Use conservative reasoning defaults for appropriate small models and a small generation budget for background title/PR prose generation.
5. Expose whether a default is automatic, recommended, or explicitly selected.

### Likely touchpoints

- `packages/contracts/src/inference.ts` for additive metadata.
- `apps/server/src/inference/InferenceServerRegistry.ts` for capability-derived defaults.
- `packages/provider-pi/src/server/adapter.ts`
- `packages/provider-opencode/src/server/gateway.ts`
- Codex local configuration and shared settings UI.

Avoid a prematurely generic abstraction if profile fields are meaningful to only one harness. A narrow per-harness config with shared UI terminology is preferable to ignored options.

### Exit criteria

- Profile choices round-trip through the persisted service contract and are reflected in the actual provider request.
- Unsupported settings are disabled or explained, never silently ignored.
- Each recommended profile has a recorded eval comparison against the same model's baseline.
- All new labels/messages are localized for web/mobile surfaces where displayed.

### Tradeoff

Model-name heuristics are fragile. Prefer explicit saved overrides and measured recommendations over trying to identify every derivative or quantization automatically.

## Phase 5 — Prompt and tool economy

**Bounded guard implemented; measurements paused awaiting local inference (20 November 2026).** `f4OrchestrationPrompt` now accepts an explicit lean-catalog flag and omits unavailable visual/browser/device instructions when selected. Its default remains full; no provider silently loses features. Pi's system-prompt bridge already selects lean by its supported tool setting, Codex retains full tools, and OpenCode's native profile is unchanged. The free MCP dry-run on Node 26 succeeded (model calls were not made); token/sample and cache-hit comparisons require a served model. Node 22 cannot import the existing secret grader because its regex uses inline modifiers.

### Work

1. Align runtime instructions with the advertised tool profile. Lean mode must not direct the model toward omitted tools.
2. Measure a local tool profile for Codex rather than always flattening the full F4 catalog.
3. Improve OpenCode tool/schema discoverability before the model guesses arguments; measure the existing MCP eval against the change.
4. Keep frequently reused instructions/tool definitions ordered and stable for prefix caching.
5. Inspect repeated historical/tool-result payloads before repeatedly revising the main system prompt.
6. Make disabled capabilities visible and allow a profile switch where the feature is needed.

### Likely touchpoints

- `packages/provider-core/src/server/mcpToolProfile.ts`
- `packages/provider-core/src/server/orchestrationInstructions.ts`
- `packages/provider-core/src/server/runtimeInstructions.ts`
- `apps/server/src/provider/CodexDeveloperInstructions.ts`
- `packages/provider-pi/src/server/mcpInjection.ts`
- Provider OpenCode catalog/schema presentation.

Before changing model-facing tool text or MCP schemas, follow `evals/README.md`, compare before/after using the named MCP eval, and run `vp run smoke:tool-schemas` when tool definitions change.

### Exit criteria

- The eval confirms lower prompt tokens/sample and no material drop in task success for the selected profile.
- Lean-mode instruction tests assert that unavailable tools are not referenced as available.
- Cache-hit behavior is recorded; dynamic tool reordering/loading is rejected if its savings are outweighed by cache losses or extra calls.
- Pi, OpenCode, and Codex each document their supported profile behavior, including deliberate non-support.

### Tradeoff

A lean profile removes real features. This should be an explicit tradeoff, not a silent global reduction in product capability.

## Phase 6 — Compaction quality and context visibility

**Bounded fixtures implemented; measurements paused awaiting local inference (20 November 2026).** Pi's deterministic managed-compaction fixture preserves recent turns, modified/read paths, exact errors and pending work, and checks that a fabricated secret in the tool-result prefix is not automatically included in its generated summary. Its instruction now explicitly excludes secret values; this is not a proof of arbitrary model compliance. The compaction reply must still stop without tool calls, so completed edits are not replayed. Pi's current context values come from provider/session reports, not an invented character heuristic, so they are not relabeled as estimates. Real success/cache comparisons and OpenCode hook suitability remain unmeasured.

### Work

1. Extend real coding fixtures to check goal, constraints, modified files, exact errors, decisions, pending work, and secret handling after compaction.
2. Measure success and cache reuse before/after compaction.
3. Improve Pi summaries while retaining recent turns verbatim and preserving exact paths/errors.
4. Apply successful techniques to OpenCode only where its native hooks support them.
5. Show estimated remaining context including output reserve, clearly labelled as estimated when tokenization is approximate.

### Likely touchpoints

- `packages/provider-pi/src/server/cacheCompactionExtensionSource.ts`
- `packages/provider-core/src/server/handoffBudget.ts`
- `packages/provider-opencode/src/server/adapter.ts`
- Shared additive contracts and existing local diagnostics UI.

### Exit criteria

- Compaction fixtures assert preservation of user goals, exact paths/errors, pending work, and no resumed duplicate tool work.
- Secret fixtures do not leak prohibited content into generated summaries.
- Cache reuse and task success are compared against the pre-compaction baseline.
- Context UI distinguishes estimated from server-reported usage.

### Tradeoff

Aggressive summarization reduces tokens but loses details. Optimize for retained task correctness, not merely shorter summaries.

## Phase 7 — Scheduling and local UX polish

Do this only if measurements show queueing or discoverability is limiting actual use. **Not started (20 November 2026):** there is no real queue/latency measurement or discoverability study while inference is unavailable. Admission already permits queued cancellation and does not replay dispatched failures; no fairness or overflow-routing change is justified by those bounded synthetic tests alone.

### Optional work

- Fairness between interactive threads so one long loop cannot monopolize a server.
- Cancellation for work that is still queued.
- Optional idle-server overflow routing, separate from existing outage fallback and still local-only.
- A short **Test this model** probe beside **Check images**: tool-call smoke test and tiny edit fixture.
- Capability badges and comparison by actual task success, tokens/task, latency, and cache reuse on the user's hardware.
- Mobile write controls only after service methods exist; desktop should reuse shared web settings.

### Exit criteria

- Queue/cancellation tests prove fairness and no execution after queued cancellation.
- Optional overflow never selects a non-local endpoint and cannot repeat executing tool work.
- Smoke-test results identify precise limitations without modifying live user state.
- Web gets one integrated real-client pass; mobile gets one if its UI changes, and desktop uses the shared behavior.

## Non-goals

- Building an inference engine, model downloader, or quantization manager into F4code.
- Supporting every serving backend through a universal protocol translator.
- Adding default RAG/semantic memory before search and compaction are measured.
- Automatically falling back to cloud inference for local-only work.
- Parsing arbitrary prose as unintended tool calls.
- Adding autonomous subagents to compensate for weak single-agent behavior.
- Implementing speculative continuous batching; vLLM, SGLang, and llama.cpp own scheduling within their runtimes.

## Validation for every implementation slice

1. Add the smallest focused test that fails before a logic/protocol fix and passes afterward. Extend an existing test when one fits.
2. Run focused tests with `vp test run <files>` and `vp run typecheck`.
3. Before pushing, run `vp run check:changed`; do not substitute repo-wide checks.
4. For changed model-facing instructions/tool schemas, run the relevant eval comparison before/after as required by `evals/README.md`.
5. Check web, desktop, and mobile reachability; make explicit provider decisions, including unsupported features.
6. Keep event payloads bounded and do not expose private inference content.
7. Record the same-fixture eval comparison and unresolved failures in the relevant eval README or pull request, not as claims without evidence.

## Recommended first implementation slice

**Phase 0 + Phase 1, followed by Phase 2.** Establish a real editing baseline and sanitized diagnosis before recovery changes. Then implement Phase 3's one-shot empty-reply retry only for the failure cases observed in those results.

This sequence gives every later optimization a common measurement foundation and avoids improving proxy metrics while making real coding performance worse.
