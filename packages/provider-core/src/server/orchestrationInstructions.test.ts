import { assert, describe, it } from "@effect/vitest";

import {
  F4_CODE_DEVICE_TOOL_INSTRUCTIONS,
  F4_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH,
  F4_CODE_ORCHESTRATION_INSTRUCTIONS,
  f4AcpPromptWithInstructions,
  f4OrchestrationPrompt,
  f4OrchestrationSystemPrompt,
} from "./orchestrationInstructions.ts";

describe("F4 device instructions", () => {
  it("route device work through device_open and give Claude the line that loads the tools", () => {
    for (const intent of ["`device_list`", "`device_open`", "`agent-device`", "ssh", "`hostId`"]) {
      assert.include(F4_CODE_DEVICE_TOOL_INSTRUCTIONS, intent);
    }
    assert.notInclude(F4_CODE_DEVICE_TOOL_INSTRUCTIONS, "ToolSearch");
    const loadLine =
      " Load them with ToolSearch `select:mcp__f4code__device_list,mcp__f4code__device_open,mcp__f4code__device_screenshot,mcp__f4code__device_close`.";
    assert.include(F4_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH, loadLine);
    assert.equal(
      F4_CODE_DEVICE_TOOL_INSTRUCTIONS_WITH_TOOL_SEARCH.replace(loadLine, ""),
      F4_CODE_DEVICE_TOOL_INSTRUCTIONS,
    );
  });

  it("open the app before the returned command's snapshots, screenshots and input", () => {
    assert.include(
      F4_CODE_DEVICE_TOOL_INSTRUCTIONS,
      "its snapshots, screenshots and input need `open <app>` first,",
    );
  });

  it("keep the failure rule from taking over or closing a session another thread holds", () => {
    // agent-device's DEVICE_IN_USE advice is to rerun with the owner's --session or close it first.
    assert.include(
      F4_CODE_DEVICE_TOOL_INSTRUCTIONS,
      "follow its advice once, but never reuse or close another session; if it still fails,",
    );
  });

  it("reach OpenCode and Cursor only when the session holds device access", () => {
    assert.include(f4OrchestrationSystemPrompt(true, true), F4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(f4OrchestrationSystemPrompt(true, false), "## F4code devices");
    assert.isUndefined(f4OrchestrationSystemPrompt(false, true));

    const firstRun = (hasDeviceTools: boolean) =>
      f4OrchestrationPrompt({
        prompt: "Check the login screen.",
        hasF4Mcp: true,
        hasDeviceTools,
        orchestrationDelivered: false,
        deviceInstructionsDelivered: false,
      });
    assert.include(firstRun(true), F4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(firstRun(false), "## F4code devices");

    const laterRun = (deviceInstructionsDelivered: boolean) =>
      f4OrchestrationPrompt({
        prompt: "Check the login screen.",
        hasF4Mcp: true,
        hasDeviceTools: true,
        orchestrationDelivered: true,
        deviceInstructionsDelivered,
      });
    assert.include(laterRun(false), F4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.notInclude(laterRun(false), F4_CODE_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(laterRun(true), "Check the login screen.");

    // A provider's own guidance reaches a conversation that already had the rest.
    const providerRun = (providerInstructionsDelivered: boolean) =>
      f4OrchestrationPrompt({
        prompt: "Check the login screen.",
        hasF4Mcp: true,
        hasDeviceTools: false,
        orchestrationDelivered: true,
        deviceInstructionsDelivered: false,
        providerInstructions: "Mark awaited shells.",
        providerInstructionsDelivered,
      });
    assert.include(providerRun(false), "Mark awaited shells.");
    assert.notInclude(providerRun(false), F4_CODE_ORCHESTRATION_INSTRUCTIONS.trim());
    assert.equal(providerRun(true), "Check the login screen.");
  });

  it("never advertises omitted preview or device tools in lean prompt injection", () => {
    const prompt = f4OrchestrationPrompt({
      prompt: "Build the page.",
      hasF4Mcp: true,
      hasDeviceTools: false,
      leanTools: true,
      orchestrationDelivered: false,
      deviceInstructionsDelivered: false,
    });
    assert.notInclude(prompt, "### Visuals and preview");
    assert.notInclude(prompt, "## F4code browser");
    assert.notInclude(prompt, "## F4code devices");
    assert.include(prompt, "`f4_thread_launch`");
    assert.include(prompt, "Build the page.");
  });

  it("reach ACP agents again when device access changes mid-thread", () => {
    const state = { interactionMode: "default", hasF4Mcp: true, hasDeviceTools: false } as const;
    const withDevices = f4AcpPromptWithInstructions({
      prompt: "Check the login screen.",
      state: { ...state, hasDeviceTools: true },
      previousState: state,
    });
    assert.include(withDevices, F4_CODE_DEVICE_TOOL_INSTRUCTIONS);
    assert.equal(
      f4AcpPromptWithInstructions({ prompt: "Again.", state, previousState: state }),
      "Again.",
    );
    assert.notInclude(f4AcpPromptWithInstructions({ prompt: "Hi.", state }), "## F4code devices");
  });
});
