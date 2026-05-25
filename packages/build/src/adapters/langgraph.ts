import { detectFrameworkInfo } from "@platform/detect";
import type { FrameworkAdapter } from "./types";
import type { AdaptPlan } from "./types";

export const langGraphAdapter: FrameworkAdapter = {
  framework: "langgraph",

  async plan(repoDir: string): Promise<AdaptPlan | null> {
    const info = await detectFrameworkInfo(repoDir);
    if (info.framework !== "langgraph" || !info.entryPath) return null;
    const name = repoDir.split(/[/\\]/).pop() ?? "langgraph-agent";
    return {
      framework: "langgraph",
      slug: name,
      name,
      description: `LangGraph agent (imported from ${info.entryPath})`,
      entryPath: info.entryPath,
      entryExport: info.entryExport ?? "graph",
    };
  },
};
