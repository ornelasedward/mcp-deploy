import { access, readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const AGENT_CONFIG = "agent.config.ts";
const exists = (p: string) => access(p).then(() => true).catch(() => false);

/** Walk up to depth 4 looking for agent.config.ts. */
export async function findAgentRoot(searchRoot: string): Promise<string | null> {
  const root = resolve(searchRoot);
  if (await exists(join(root, ".agentd", AGENT_CONFIG))) {
    return join(root, ".agentd");
  }

  const queue = [{ dir: root, depth: 0 }];
  while (queue.length > 0) {
    const { dir, depth } = queue.shift()!;
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      if (entries.some((e) => e.isFile() && e.name === AGENT_CONFIG)) {
        return dir;
      }
      if (depth >= 4) continue;
      for (const e of entries) {
        if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") {
          queue.push({ dir: join(dir, e.name), depth: depth + 1 });
        }
      }
    } catch {
      // skip unreadable
    }
  }
  return null;
}
