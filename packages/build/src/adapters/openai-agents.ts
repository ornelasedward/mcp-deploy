import { detectFrameworkInfo } from "@platform/detect";
import type { FrameworkAdapter } from "./types";

export const openaiAgentsAdapter: FrameworkAdapter = {
  framework: "openai-agents",

  async plan(repoDir: string) {
    const info = await detectFrameworkInfo(repoDir);
    if (info.framework !== "openai-agents" || !info.entryPath) return null;
    const name = repoDir.split(/[/\\]/).pop() ?? "openai-agent";
    return {
      framework: "openai-agents",
      slug: name,
      name,
      description: `OpenAI Agents SDK (imported from ${info.entryPath})`,
      entryPath: info.entryPath,
      entryExport: info.entryExport ?? "agent",
    };
  },
};
