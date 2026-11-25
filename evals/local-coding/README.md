# Local coding eval

Runs Pi, OpenCode, or Codex against an explicitly selected local inference endpoint and grades the resulting Git diff and tests. Each sample has a fresh temporary repository, HOME, provider configuration, and session state. No user database is opened and no cloud fallback is configured.

```bash
pnpm local-coding --out runs/baseline --model served-model-id \
  --base-url http://localhost:8000/v1 --harness pi --samples 3
```

Options: `--case comma-separated-ids`, `--reasoning low|...|off`, `--timeout milliseconds`, `--api chat|responses` for Codex. Pi uses the local server's chat-completions protocol. OpenCode needs to be installed and its configuration uses the local endpoint only. Pi's configured models come from the isolated `EVAL_MODELS_JSON` path and are never written into the user's Pi configuration.

The twelve deterministic fixtures cover focused bug fixes, tests, refactors, documentation, multi-file edits, and an explain-first request. They are real edits, not simulations of a model. Test fixtures use Python only; no package manager or network is needed to grade them. An unsupported-capability fixture verifies that no unauthorized edits occur. Compaction and resume fields are present for later real-model measurements; they are not claimed to execute compaction or restart a session by this runner yet.

## Baseline — 20 November 2026

No served local-model endpoint was available to query on this machine. `localhost:8000/health` is an application endpoint, not an inference metadata service. Pi 1.5.2 and Codex CLI 0.169.0 are installed; OpenCode is not available on PATH. Consequently no real-model samples, token totals, or compaction/resume success rates have been recorded. Do not read this as a zero score: model-side measurement is blocked until a server is running and its served model ID and OpenAI-compatible base URL are supplied.

Start an isolated local server, then run at least three samples per configuration. Results are appended per run to `results.ndjson`; `summary.json` records the Git revision, harness version, model, case and sample counts. These records contain a bounded reply excerpt used for unsupported-capability grading, not raw private prompt/response/header logs.
