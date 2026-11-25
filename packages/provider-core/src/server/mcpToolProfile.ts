/** Which of F4's MCP tools a session advertises. Tool text is the same in every profile. */
export const MCP_TOOL_PROFILES = ["full", "lean"] as const;
export type McpToolProfile = (typeof MCP_TOOL_PROFILES)[number];

/**
 * Tools a lean session advertises: orchestration, threads, projects, worktrees, secrets and
 * scheduling, which the always-on instructions name. Device, preview, HTML, pull request,
 * attachment, environment-preference, queue and Claude-only tools are left out, not deferred.
 * An allowlist, so a new tool stays out of lean until someone weighs its schema cost here.
 */
export const LEAN_MCP_TOOL_NAMES: ReadonlyArray<string> = [
  "orchestrator_capabilities",
  "delegate_task",
  "task_status",
  "task_cancel",
  "request_secret",
  "schedule_task",
  "list_scheduled_tasks",
  "delete_scheduled_task",
  "create_threads",
  "f4_thread_launch",
  "f4_thread_list",
  "f4_thread_read",
  "f4_thread_update",
  "f4_thread_send",
  "f4_thread_wait",
  "f4_thread_interrupt",
  "f4_thread_search",
  "f4_thread_configure",
  "f4_thread_organize",
  "f4_pending_request",
  "f4_environment_links",
  "f4_environment_link",
  "f4_environment_unlink",
  "f4_project_list",
  "f4_project_read",
  "f4_project_create",
  "f4_project_update",
  "f4_project_delete",
  "f4_project_clone",
  "f4_worktree_handoff",
  "f4_worktree_status",
  "f4_worktree_list",
];

const LEAN = new Set(LEAN_MCP_TOOL_NAMES);

export const isMcpToolInProfile = (name: string, profile: McpToolProfile) =>
  profile === "full" || LEAN.has(name);

export const toolsForMcpProfile = <T extends { readonly name: string }>(
  tools: ReadonlyArray<T>,
  profile: McpToolProfile,
) => tools.filter((tool) => isMcpToolInProfile(tool.name, profile));

/** UTF-8 bytes of the fields a model sees for a profile's tools; protocol metadata is excluded. */
export const mcpToolListJsonBytes = (
  tools: ReadonlyArray<{
    readonly name: string;
    readonly description?: string | undefined;
    readonly inputSchema?: unknown;
  }>,
  profile: McpToolProfile,
) =>
  new TextEncoder().encode(
    JSON.stringify(
      toolsForMcpProfile(tools, profile).map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
      })),
    ),
  ).length;
