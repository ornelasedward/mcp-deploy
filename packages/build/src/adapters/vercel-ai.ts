import { detectFrameworkInfo } from "@platform/detect";
import type { FrameworkAdapter } from "./types";

export const vercelAiAdapter: FrameworkAdapter = {
  framework: "vercel-ai",

  async plan(repoDir: string) {
    const info = await detectFrameworkInfo(repoDir);
    if (info.framework !== "vercel-ai" || !info.entryPath) return null;
    const name = repoDir.split(/[/\\]/).pop() ?? "ai-agent";
    return {
      framework: "vercel-ai",
      slug: name,
      name,
      description: `Vercel AI SDK (imported from ${info.entryPath})`,
      entryPath: info.entryPath,
    };
  },
};
