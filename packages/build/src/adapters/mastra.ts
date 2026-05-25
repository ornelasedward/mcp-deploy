import { detectFrameworkInfo } from "@platform/detect";
import type { FrameworkAdapter } from "./types";

export const mastraAdapter: FrameworkAdapter = {
  framework: "mastra",

  async plan(repoDir: string) {
    const info = await detectFrameworkInfo(repoDir);
    if (info.framework !== "mastra" || !info.entryPath) return null;
    const name = repoDir.split(/[/\\]/).pop() ?? "mastra-agent";
    return {
      framework: "mastra",
      slug: name,
      name,
      description: `Mastra agent (imported from ${info.entryPath})`,
      entryPath: info.entryPath,
      entryExport: info.entryExport,
    };
  },
};
