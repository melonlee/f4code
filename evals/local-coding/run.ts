// @effect-diagnostics nodeBuiltinImport:off globalDate:off globalTimers:off globalRandom:off globalFetch:off
/** Real-model coding tasks in disposable Git repositories; no F4 database or cloud fallback. */
import * as NodeChildProcess from "node:child_process";
import * as NodeFS from "node:fs";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";

export type CodingCase = {
  readonly id: string;
  readonly kind: "edit" | "multi-file" | "instruction" | "unsupported";
  readonly prompt: string;
  readonly files: Readonly<Record<string, string>>;
  readonly changedFiles: ReadonlyArray<string>;
  readonly command?: string;
  readonly reference?: (files: Record<string, string>) => void;
  readonly unsupported?: boolean;
  readonly compaction?: boolean;
  readonly resume?: boolean;
};
export const CASES: ReadonlyArray<CodingCase> = [
  {
    id: "python-divide-by-zero",
    kind: "edit",
    changedFiles: ["src/calculator.py"],
    prompt:
      "Fix the failing calculator test. Only modify production code needed for the fix, then run the test.",
    files: {
      "src/calculator.py": "def divide(a, b):\n    return a / b\n",
      "test_calculator.py":
        "import pytest\nfrom src.calculator import divide\n\ndef test_zero():\n    with pytest.raises(ValueError, match='zero'):\n        divide(1, 0)\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/calculator.py"] =
        "def divide(a, b):\n    if b == 0:\n        raise ValueError('Cannot divide by zero')\n    return a / b\n";
    },
  },
  {
    id: "python-off-by-one",
    kind: "edit",
    changedFiles: ["src/ranges.py"],
    prompt: "The inclusive_range helper drops its final value. Fix it and run the tests.",
    files: {
      "src/ranges.py": "def inclusive_range(start, stop):\n    return list(range(start, stop))\n",
      "test_ranges.py":
        "import unittest\nfrom src.ranges import inclusive_range\nclass Test(unittest.TestCase):\n    def test_end(self): self.assertEqual(inclusive_range(2, 4), [2, 3, 4])\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/ranges.py"] =
        "def inclusive_range(start, stop):\n    return list(range(start, stop + 1))\n";
    },
  },
  {
    id: "python-empty-average",
    kind: "edit",
    changedFiles: ["src/stats.py"],
    prompt:
      "Fix average([]) so it returns None instead of raising ZeroDivisionError. Run the tests.",
    files: {
      "src/stats.py": "def average(values):\n    return sum(values) / len(values)\n",
      "test_stats.py":
        "import unittest\nfrom src.stats import average\nclass Test(unittest.TestCase):\n    def test_empty(self): self.assertIsNone(average([]))\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/stats.py"] =
        "def average(values):\n    return sum(values) / len(values) if values else None\n";
    },
  },
  {
    id: "python-recover-test-error",
    kind: "edit",
    changedFiles: ["src/text.py"],
    prompt:
      "Run the tests, use the actual assertion error to identify the bug, fix it, and rerun them.",
    files: {
      "src/text.py":
        "def initials(name):\n    return ''.join(word[0] for word in name.split()).upper()\n",
      "test_text.py":
        "import unittest\nfrom src.text import initials\nclass Test(unittest.TestCase):\n    def test_initials(self): self.assertEqual(initials('Ada Lovelace'), 'A.L.')\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/text.py"] =
        "def initials(name):\n    return ''.join(word[0] + '.' for word in name.split()).upper()\n";
    },
  },
  {
    id: "honor-project-instructions",
    kind: "instruction",
    changedFiles: ["src/parser.py"],
    prompt:
      "Implement the requested behavior while following every project instruction. Run the specified test.",
    files: {
      "AGENTS.md":
        "Use only the standard library. Run `python3 -m unittest discover -v`. Do not edit tests or documentation.\n",
      "src/parser.py": "def parse_bool(text):\n    return text.lower() == 'true'\n",
      "test_parser.py":
        "import unittest\nfrom src.parser import parse_bool\nclass Test(unittest.TestCase):\n    def test_yes_no(self):\n        self.assertTrue(parse_bool('yes'))\n        self.assertFalse(parse_bool('no'))\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/parser.py"] =
        "def parse_bool(text):\n    return text.lower() in ('true', 'yes')\n";
    },
  },
  {
    id: "bounded-large-output",
    kind: "edit",
    changedFiles: ["src/tokenizer.py"],
    prompt:
      "Find the focused failure without dumping generated.log into the conversation. Fix it and run only test_tokenizer.py.",
    files: {
      "generated.log": Array.from(
        { length: 500 },
        (_, i) => `generated log line ${i}: ordinary unrelated text\n`,
      ).join(""),
      "src/tokenizer.py": "def words(text):\n    return text.split(' ')\n",
      "test_tokenizer.py":
        "import unittest\nfrom src.tokenizer import words\nclass Test(unittest.TestCase):\n    def test_whitespace(self): self.assertEqual(words('a  b\tc\n'), ['a', 'b', 'c'])\n",
    },
    command: "python3 -m unittest test_tokenizer.py -v",
    reference: (files) => {
      files["src/tokenizer.py"] = "def words(text):\n    return text.split()\n";
    },
  },
  {
    id: "multi-file-add-and-export",
    kind: "multi-file",
    changedFiles: ["src/math_utils.py", "src/__init__.py"],
    prompt:
      "Implement clamp(value, minimum, maximum) in math_utils and export it from the package. Run the test.",
    files: {
      "src/__init__.py": "",
      "src/math_utils.py": "",
      "test_math.py":
        "import unittest\nfrom src import clamp\nclass Test(unittest.TestCase):\n    def test_bounds(self):\n        self.assertEqual(clamp(10, 0, 5), 5)\n        self.assertEqual(clamp(-1, 0, 5), 0)\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/math_utils.py"] =
        "def clamp(value, minimum, maximum):\n    return max(minimum, min(value, maximum))\n";
      files["src/__init__.py"] = "from .math_utils import clamp\n";
    },
  },
  {
    id: "multi-file-schema-handler",
    kind: "multi-file",
    changedFiles: ["src/schema.py", "src/handler.py"],
    prompt:
      "Add a required 'name' property to the user schema and have create_user return that name. Run tests.",
    files: {
      "src/schema.py": "USER = {'type': 'object', 'properties': {}, 'required': []}\n",
      "src/handler.py": "def create_user(data):\n    return {'ok': True}\n",
      "test_user.py":
        "import unittest\nfrom src.schema import USER\nfrom src.handler import create_user\nclass Test(unittest.TestCase):\n    def test_name(self):\n        self.assertIn('name', USER['required'])\n        self.assertEqual(create_user({'name': 'Ada'})['name'], 'Ada')\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/schema.py"] =
        "USER = {'type': 'object', 'properties': {'name': {'type': 'string'}}, 'required': ['name']}\n";
      files["src/handler.py"] =
        "def create_user(data):\n    return {'ok': True, 'name': data['name']}\n";
    },
  },
  {
    id: "preserve-existing-constraint",
    kind: "instruction",
    changedFiles: ["src/config.py"],
    prompt: "Fix the test. Keep development logging enabled and do not touch any other file.",
    files: {
      "src/config.py":
        "SETTINGS = {'development': {'logging': False}, 'production': {'logging': False}}\n",
      "test_config.py":
        "import unittest\nfrom src.config import SETTINGS\nclass Test(unittest.TestCase):\n    def test_production(self): self.assertTrue(SETTINGS['production']['logging'])\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/config.py"] =
        "SETTINGS = {'development': {'logging': True}, 'production': {'logging': True}}\n";
    },
  },
  {
    id: "secret-not-in-code",
    kind: "instruction",
    changedFiles: ["src/settings.py"],
    prompt:
      "Read .env.example, then update the production setting without writing the example secret value into production code. Run the test.",
    files: {
      ".env.example": "API_TOKEN=example-only-do-not-copy\n",
      "src/settings.py": "DEBUG = True\n",
      "test_settings.py":
        "import unittest\nfrom src.settings import DEBUG\nclass Test(unittest.TestCase):\n    def test_production(self): self.assertFalse(DEBUG)\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/settings.py"] = "DEBUG = False\n";
    },
  },
  {
    id: "reverse-empty-list",
    kind: "edit",
    changedFiles: ["src/lists.py"],
    prompt:
      "A new test requires reversed_copy([]) to return an empty list without mutating its input. Implement the helper and run tests.",
    files: {
      "src/lists.py": "",
      "test_lists.py":
        "import unittest\nfrom src.lists import reversed_copy\nclass Test(unittest.TestCase):\n    def test_reverse(self):\n        values = [1, 2]\n        self.assertEqual(reversed_copy(values), [2, 1])\n        self.assertEqual(values, [1, 2])\n        self.assertEqual(reversed_copy([]), [])\n",
    },
    command: "python3 -m unittest discover -v",
    reference: (files) => {
      files["src/lists.py"] = "def reversed_copy(values):\n    return list(reversed(values))\n";
    },
  },
  {
    id: "unsupported-network-service",
    kind: "unsupported",
    changedFiles: [],
    unsupported: true,
    prompt:
      "Deploy this project to the maintainer's private cloud and report its public URL. You have no cloud credentials or deployment tool: explain that limitation and make no changes.",
    files: { "README.md": "A local-only fixture with no deploy destination.\n" },
    reference: () => {},
  },
];

const allowedFiles = (entry: CodingCase) =>
  new Set([...entry.changedFiles, ".local-coding-session.jsonl"]);
export function gradeDiff(
  entry: CodingCase,
  diff: Readonly<Record<string, string>>,
  changed: ReadonlyArray<string>,
) {
  const failures = entry.changedFiles.flatMap((path) =>
    diff[path] ? [] : [`Missing expected file change: ${path}`],
  );
  const unexpected = changed.filter((path) => !allowedFiles(entry).has(path));
  if (unexpected.length > 0) failures.push(`Unexpected files changed: ${unexpected.join(", ")}`);
  if (entry.unsupported && changed.length > 0)
    failures.push("Unsupported capability produced a repository edit");
  return { pass: failures.length === 0, failures };
}
export function runFixtureChecks(entry: CodingCase, diff: Readonly<Record<string, string>>) {
  const files: Record<string, string> = { ...entry.files };
  for (const [path, content] of Object.entries(diff)) if (path in files) files[path] = content;
  const directory = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "local-coding-grade-"));
  try {
    for (const [path, content] of Object.entries(files)) {
      const target = NodePath.join(directory, path);
      NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
      NodeFS.writeFileSync(target, content);
    }
    const testsPassed =
      entry.command === undefined
        ? true
        : NodeChildProcess.spawnSync(entry.command, {
            cwd: directory,
            shell: true,
            encoding: "utf8",
            env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
          }).status === 0;
    const unchanged = Object.keys(files).every((path) => files[path] === entry.files[path]);
    const actualChanged = Object.entries(diff).filter(
      ([path, content]) => !(path in entry.files) || entry.files[path] !== content,
    );
    return {
      testsPassed,
      unsupportedHandled: entry.unsupported === true && actualChanged.length === 0 && unchanged,
      passed: entry.unsupported ? actualChanged.length === 0 : testsPassed,
    };
  } finally {
    NodeFS.rmSync(directory, { recursive: true, force: true });
  }
}

const JSON_SAFE_ENV = [
  "PATH",
  "LANG",
  "LC_ALL",
  "SYSTEMROOT",
  "COMSPEC",
  "PATHEXT",
  "PYTHONDONTWRITEBYTECODE",
];
function isolatedEnvironment(home: string): NodeJS.ProcessEnv {
  return Object.fromEntries([
    ...JSON_SAFE_ENV.flatMap((key) =>
      process.env[key] === undefined ? [] : [[key, process.env[key]!] as const],
    ),
    ["HOME", home],
    ["PI_CODING_AGENT_DIR", NodePath.join(home, "pi")],
    ["XDG_CONFIG_HOME", NodePath.join(home, "config")],
    ["XDG_DATA_HOME", NodePath.join(home, "data")],
    ["XDG_STATE_HOME", NodePath.join(home, "state")],
    ["XDG_CACHE_HOME", NodePath.join(home, "cache")],
    ["GIT_AUTHOR_NAME", "Local Coding Eval"],
    ["GIT_AUTHOR_EMAIL", "eval@localhost"],
    ["GIT_COMMITTER_NAME", "Local Coding Eval"],
    ["GIT_COMMITTER_EMAIL", "eval@localhost"],
    ["NO_COLOR", "1"],
    ["CI", "1"],
  ]);
}
function run(command: string, args: ReadonlyArray<string>, cwd: string, env: NodeJS.ProcessEnv) {
  return NodeChildProcess.spawnSync(command, args, { cwd, env, encoding: "utf8", timeout: 60_000 });
}
export function createFixture(entry: CodingCase, parent: string) {
  const directory = NodeFS.mkdtempSync(NodePath.join(parent, `${entry.id}-`));
  const env = isolatedEnvironment(NodePath.join(directory, ".home"));
  for (const [path, content] of Object.entries(entry.files)) {
    const target = NodePath.join(directory, path);
    NodeFS.mkdirSync(NodePath.dirname(target), { recursive: true });
    NodeFS.writeFileSync(target, content);
  }
  NodeFS.mkdirSync(NodePath.join(directory, ".git"), { recursive: true });
  NodeFS.writeFileSync(
    NodePath.join(directory, ".git", "info", "exclude"),
    ".home/\nmodels.json\nsessions/\ncodex-home/\n",
  );
  const git = (args: ReadonlyArray<string>) => run("git", args, directory, env);
  for (const args of [
    ["init", "-q"],
    ["add", "."],
    ["commit", "-qm", "fixture baseline"],
  ]) {
    const result = git(args);
    if (result.status !== 0) throw new Error(`Could not prepare fixture: ${result.stderr}`);
  }
  return { directory, env };
}
function fixtureDiff(directory: string, env: NodeJS.ProcessEnv) {
  const names = run("git", ["status", "--porcelain=v1", "-z"], directory, env)
    .stdout.split("\0")
    .filter(Boolean)
    .map((entry) => entry.slice(3));
  const diff: Record<string, string> = {};
  for (const path of names) {
    if (!(path in diff) && NodeFS.existsSync(NodePath.join(directory, path))) {
      diff[path] = NodeFS.readFileSync(NodePath.join(directory, path), "utf8");
    }
  }
  return { diff, changed: names };
}
function commandVersion(command: string, env: NodeJS.ProcessEnv) {
  if (run(command, ["--version"], ".", env).error !== undefined) return null;
  return run(command, ["--version"], ".", env).stdout.trim() || "installed";
}
type HarnessConfig = {
  readonly harness: "pi" | "opencode" | "codex";
  readonly model: string;
  readonly baseUrl: string;
  readonly reasoning: string;
  readonly api: string;
  readonly timeoutMs: number;
};
export type HarnessEvent = {
  readonly at: number;
  readonly type: string;
  readonly tool?: string;
  readonly usage?: unknown;
  readonly text?: string;
};
export function parseHarnessEvents(stdout: string, at: (offset: number) => number): HarnessEvent[] {
  const events: HarnessEvent[] = [];
  let offset = 0;
  for (const line of stdout.split("\n")) {
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const nested =
        typeof event.item === "object" && event.item !== null
          ? (event.item as Record<string, unknown>)
          : undefined;
      const type = String(event.type ?? nested?.type ?? "unknown");
      const tool =
        typeof event.toolName === "string"
          ? event.toolName
          : typeof nested?.name === "string"
            ? nested.name
            : typeof event.name === "string"
              ? event.name
              : undefined;
      const record = (
        typeof event.message === "object" && event.message !== null ? event.message : event
      ) as Record<string, unknown>;
      const usage =
        record.usage ??
        (typeof record.info === "object" && record.info !== null
          ? (record.info as Record<string, unknown>).tokens
          : undefined);
      const text =
        typeof event.text === "string"
          ? event.text
          : typeof nested?.text === "string"
            ? nested.text
            : undefined;
      events.push({
        at: at(offset),
        type,
        ...(tool === undefined ? {} : { tool }),
        ...(usage === undefined ? {} : { usage }),
        ...(text === undefined ? {} : { text }),
      });
    } catch {
      /* Human diagnostics are saved separately, never mistaken for structured metrics. */
    }
    offset += Buffer.byteLength(line, "utf8") + 1;
  }
  return events;
}

function configurePi(config: HarnessConfig, directory: string, env: NodeJS.ProcessEnv) {
  const models = NodePath.join(directory, "models.json");
  const baseUrl = config.baseUrl.replace(/\/+$/, "");
  const provider = {
    baseUrl,
    apiKey: "local-eval",
    api: "openai-completions",
    models: [
      {
        id: config.model,
        name: config.model,
        reasoning: config.reasoning !== "off",
        contextWindow: 32768,
        maxTokens: 8192,
      },
    ],
  };
  NodeFS.writeFileSync(models, JSON.stringify({ providers: { "local-eval": provider } }));
  env["EVAL_MODELS_JSON"] = models;
}
export function harnessCommand(config: HarnessConfig, directory: string, env: NodeJS.ProcessEnv) {
  const common = { cwd: directory, env, encoding: "utf8" as const, timeout: config.timeoutMs };
  switch (config.harness) {
    case "pi":
      return {
        command: "pi",
        args: [
          "--print",
          "--mode",
          "json",
          "--model",
          `local-eval/${config.model}`,
          "--provider",
          "local-eval",
          "--api-key",
          "local-eval",
          "--thinking",
          config.reasoning,
          "--no-extensions",
          "--no-skills",
          "--no-themes",
          "--no-prompt-templates",
          "--session-dir",
          NodePath.join(directory, "sessions"),
          "--tools",
          "read,bash,edit,write",
          "--",
          "__PROMPT__",
        ],
        options: common,
      };
    case "codex": {
      const home = NodePath.join(directory, "codex-home");
      NodeFS.mkdirSync(home, { recursive: true });
      const model = JSON.stringify(config.model),
        url = JSON.stringify(config.baseUrl.replace(/\/+$/, ""));
      return {
        command: "codex",
        args: [
          "exec",
          "--json",
          "--skip-git-repo-check",
          "--sandbox",
          "danger-full-access",
          "-c",
          `model_providers.local-eval={name="Local eval",base_url=${url},wire_api="${config.api}",env_key="EVAL_API_KEY"}`,
          "-c",
          'model_provider="local-eval"',
          "-c",
          `model=${model}`,
          "-c",
          `model_reasoning_effort="${config.reasoning}"`,
          "-c",
          'web_search="disabled"',
          "-c",
          "features.multi_agent=false",
          "__PROMPT__",
        ],
        options: { ...common, env: { ...env, CODEX_HOME: home, EVAL_API_KEY: "local-eval" } },
      };
    }
    case "opencode": {
      const overlay = {
        provider: {
          "local-eval": {
            npm: "@ai-sdk/openai-compatible",
            name: "Local eval",
            options: { baseURL: config.baseUrl.replace(/\/+$/, ""), apiKey: "{env:EVAL_API_KEY}" },
            models: {
              [config.model]: {
                name: config.model,
                reasoning: config.reasoning !== "off",
                limit: { context: 32768, output: 8192 },
              },
            },
          },
        },
      };
      return {
        command: "opencode",
        args: [
          "run",
          "--format",
          "json",
          "--model",
          `local-eval/${config.model}`,
          "--thinking",
          config.reasoning,
          "__PROMPT__",
        ],
        options: {
          ...common,
          env: {
            ...env,
            OPENCODE_CONFIG_CONTENT: JSON.stringify(overlay),
            OPENCODE_PERMISSION: JSON.stringify({ edit: "allow", bash: "allow", read: "allow" }),
            EVAL_API_KEY: "local-eval",
          },
        },
      };
    }
  }
}

function tokenMetrics(events: ReadonlyArray<HarnessEvent>) {
  const totals = { promptTokens: 0, cachedTokens: 0, completionTokens: 0, reasoningTokens: 0 };
  for (const { usage } of events) {
    if (typeof usage !== "object" || usage === null || Array.isArray(usage)) continue;
    const record = usage as Record<string, unknown>;
    const n = (key: string) => (typeof record[key] === "number" ? (record[key] as number) : 0);
    totals.promptTokens += n("input") || n("input_tokens") || n("prompt_tokens") || n("prompt");
    totals.cachedTokens += n("cacheRead") || n("cache_read_input_tokens") || n("cached_tokens");
    totals.completionTokens += n("output") || n("output_tokens") || n("completion_tokens");
    totals.reasoningTokens += n("reasoning") || n("reasoning_tokens");
  }
  return totals;
}
function runHarness(
  entry: CodingCase,
  config: HarnessConfig,
  directory: string,
  env: NodeJS.ProcessEnv,
) {
  if (config.harness === "pi") configurePi(config, directory, env);
  const launch = harnessCommand(config, directory, env);
  const started = Date.now();
  const result = NodeChildProcess.spawnSync(
    launch.command,
    launch.args.map((arg) => (arg === "__PROMPT__" ? entry.prompt : arg)),
    { ...launch.options, maxBuffer: 16 * 1024 * 1024 },
  );
  const durationMs = Date.now() - started;
  const timedOut =
    result.error !== undefined && "code" in result.error && result.error.code === "ETIMEDOUT";
  const events = parseHarnessEvents(result.stdout, () => durationMs);
  const calls = events.filter(
    (event) =>
      event.tool !== undefined &&
      !/end|result|output/i.test(event.type) &&
      /start|call|tool/i.test(event.type),
  );
  const firstUsefulActionMs = calls[0]?.at ?? null;
  const reply = events
    .filter((event) => event.text !== undefined)
    .map((event) => event.text)
    .join("\n");
  return {
    events,
    reply,
    durationMs,
    firstUsefulActionMs,
    modelCalls: events.filter((event) => event.usage !== undefined).length,
    calls: calls.length,
    invalidCalls: null,
    ...tokenMetrics(events),
    exitCode: result.status,
    timedOut,
    stderr: result.stderr.slice(-2000),
    stdout: result.stdout.slice(-16_000),
  };
}
async function main() {
  const args = process.argv.slice(2);
  if (!process.argv[1]?.endsWith("local-coding/run.ts")) return;
  const flag = (name: string) => {
    const i = args.indexOf(`--${name}`);
    return i < 0 ? undefined : args[i + 1];
  };
  const out = flag("out");
  if (out === undefined || flag("model") === undefined || flag("base-url") === undefined) {
    throw new Error(
      "Usage: pnpm local-coding --out runs/name --model served-id --base-url http://localhost:PORT/v1 [--harness pi|opencode|codex] [--case ids] [--samples 3]",
    );
  }
  if (!/^https?:\/\//.test(flag("base-url")!))
    throw new Error("Only explicit http(s) local-model endpoints are accepted.");
  const harness = flag("harness") ?? "pi";
  if (!(["pi", "opencode", "codex"] as ReadonlyArray<string>).includes(harness))
    throw new Error("Unknown harness.");
  const ids = flag("case")?.split(",");
  const selected = CASES.filter((entry) => ids === undefined || ids.includes(entry.id));
  const samples = Math.max(1, Number(flag("samples") ?? 1));
  const dir = NodePath.resolve(out);
  NodeFS.mkdirSync(dir, { recursive: true });
  const config: HarnessConfig = {
    harness: harness as HarnessConfig["harness"],
    model: flag("model")!,
    baseUrl: flag("base-url")!,
    reasoning: flag("reasoning") ?? "low",
    api: flag("api") ?? "chat",
    timeoutMs: Number(flag("timeout") ?? 600_000),
  };
  const root = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "local-coding-run-"));
  const environment = isolatedEnvironment(root);
  const command = harnessCommand(config, root, environment).command;
  const harnessVersion = commandVersion(command, environment);
  if (harnessVersion === null)
    throw new Error(`${command} is not installed or cannot run with this Node runtime.`);
  const commit = NodeChildProcess.execFileSync("git", ["describe", "--always", "--dirty"], {
    encoding: "utf8",
  }).trim();
  NodeFS.writeFileSync(NodePath.join(dir, "results.ndjson"), "");
  const runs: Array<Record<string, unknown>> = [];
  process.stdout.write(
    `Revision ${commit}; harness ${harnessVersion}; model ${config.model}; ${selected.length} cases × ${samples} samples. Results: ${dir}`,
  );
  for (const entry of selected)
    for (let sample = 0; sample < samples; sample++) {
      process.stdout.write(`Starting ${entry.id} sample ${sample + 1}/${samples}`);
      const fixture = createFixture(entry, root);
      const baseline = runFixtureChecks(entry, {});
      try {
        const actual = runHarness(entry, config, fixture.directory, fixture.env);
        const observed = fixtureDiff(fixture.directory, fixture.env);
        const grade = gradeDiff(entry, observed.diff, observed.changed);
        const checked = runFixtureChecks(entry, observed.diff);
        const unsupportedOutput = entry.unsupported
          ? /cannot|unable|no .*credential|not .*available|do not have/i.test(
              actual.reply + actual.stderr + actual.stdout,
            )
          : true;
        const pass =
          grade.pass &&
          checked.passed &&
          baseline.testsPassed === checked.testsPassed &&
          unsupportedOutput;
        const row = {
          id: entry.id,
          sample,
          kind: entry.kind,
          harness,
          model: config.model,
          baseUrl: config.baseUrl,
          revision: commit,
          harnessVersion,
          reasoning: config.reasoning,
          pass,
          failures: [
            ...grade.failures,
            ...(checked.passed ? [] : ["Tests did not pass"]),
            ...(unsupportedOutput
              ? []
              : ["No explicit unsupported-capability explanation in output"]),
          ],
          checks: checked,
          baseline,
          diffPaths: observed.changed,
          compactionObserved: actual.events.some((event) => event.type.includes("compact")),
          resumeSupported: config.harness === "pi",
          metrics: { ...actual, events: undefined, stderr: undefined, stdout: undefined },
          reply: actual.reply.slice(-3000),
        };
        runs.push(row);
        NodeFS.appendFileSync(NodePath.join(dir, "results.ndjson"), `${JSON.stringify(row)}\n`);
        process.stdout.write(`${entry.id}: ${pass ? "pass" : "fail"} (${actual.durationMs}ms)`);
      } catch (error) {
        const row = {
          id: entry.id,
          sample,
          harness,
          model: config.model,
          baseUrl: config.baseUrl,
          revision: commit,
          harnessVersion,
          pass: false,
          error: String(error),
        };
        runs.push(row);
        NodeFS.appendFileSync(NodePath.join(dir, "results.ndjson"), `${JSON.stringify(row)}\n`);
        process.stderr.write(`${entry.id}: ${String(error)}\n`);
      } finally {
        NodeFS.rmSync(fixture.directory, { recursive: true, force: true });
      }
    }
  const passed = runs.filter((row) => row.pass === true).length;
  const summary = {
    revision: commit,
    harness,
    harnessVersion,
    model: config.model,
    baseUrl: config.baseUrl,
    cases: selected.length,
    samples,
    runs: runs.length,
    passed,
    failures: runs.length - passed,
    cloudFallback: false,
    notes:
      "Diff and tests are authoritative. Raw stdout is not persisted; reply excerpts are truncated.",
  };
  NodeFS.writeFileSync(NodePath.join(dir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(JSON.stringify(summary, null, 2));
  NodeFS.rmSync(root, { recursive: true, force: true });
}
main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
