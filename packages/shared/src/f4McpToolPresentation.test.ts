import { describe, expect, it } from "vite-plus/test";

import {
  F4_MCP_TOOL_NAMES,
  resolveF4McpSummaryAction,
  resolveF4McpToolDefinition,
  resolveF4McpToolPresentation,
} from "./f4McpToolPresentation.ts";

describe("resolveF4McpToolPresentation", () => {
  it("recognizes every F4 tool across provider prefixes and completion suffixes", () => {
    for (const tool of F4_MCP_TOOL_NAMES) {
      const presentation = resolveF4McpToolPresentation(tool);
      for (const prefix of [
        "mcp__f4code__",
        "mcp__f4_code__",
        "mcp__f4code__",
        "F4-code.",
        "f4code.",
        "f4code-direct.",
        "mcp__f4_code_direct__",
        "f4_code/",
        "f4code:",
        "mcp_f4code_",
        "F4code ",
        "f4code · ",
      ]) {
        expect(resolveF4McpToolPresentation(`${prefix}${tool} completed`), tool).toEqual(
          presentation,
        );
      }
      expect(resolveF4McpToolPresentation(`mcp__another-server__${tool}`), tool).toBeNull();
    }
  });

  it("matches OpenCode 2's per-thread server names, whose thread ids hold underscores", () => {
    expect(
      resolveF4McpToolPresentation("f4code-thread_opencode2-adapter_delegate_task")?.displayName,
    ).toBe("Delegate a child task");
    expect(resolveF4McpToolPresentation("f4code-thread_opencode2-adapter_not_a_tool")).toBeNull();
  });
});

describe("resolveF4McpToolDefinition", () => {
  it("labels an action tool call as the action it ran", () => {
    expect(
      resolveF4McpToolDefinition("mcp__f4code__preview_act", { action: "type" })?.labels,
    ).toEqual(resolveF4McpToolDefinition("preview_type")?.labels);
    expect(resolveF4McpToolDefinition("f4_thread_transfer", { action: "fork" })?.displayName).toBe(
      resolveF4McpToolDefinition("f4_thread_fork")?.displayName,
    );
    expect(resolveF4McpToolDefinition("preview_act", { action: "unknown" })?.labels[2]).toBe(
      "Used",
    );
  });
});

describe("resolveF4McpSummaryAction", () => {
  it("summarizes an action tool by the action each call ran", () => {
    expect(resolveF4McpSummaryAction("mcp__f4code__f4_queue", { action: "list" })).toBe(
      "queue-list",
    );
    expect(resolveF4McpSummaryAction("f4_queue", { action: "edit" })).toBe("queue-edit");
    expect(resolveF4McpSummaryAction("f4_thread_transfer", { action: "status" })).toBe(
      "thread-transfers",
    );
    expect(resolveF4McpSummaryAction("f4_thread_configure", {})).toBe("thread-configuration");
    expect(resolveF4McpSummaryAction("schedule_task", { scheduledTaskId: "task-1" })).toBe(
      "schedule-update",
    );
    expect(resolveF4McpSummaryAction("delegate_task", { task: "x" })).toBe("delegate");
  });
});
