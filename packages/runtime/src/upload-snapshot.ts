import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", ".artifacts"]);

export interface SandboxFiles {
  write(path: string, data: string | ArrayBuffer | Uint8Array): Promise<void>;
}

/** Copy artifact tree into an E2B sandbox (skips heavy dirs). */
export async function uploadSnapshotToSandbox(
  sandbox: SandboxFiles,
  snapshotRef: string,
  remoteRoot = "/agent",
): Promise<void> {
  async function walk(localDir: string, remoteDir: string) {
    const entries = await readdir(localDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith(".") && entry.name !== "agent.config.ts") continue;
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;

      const localPath = join(localDir, entry.name);
      const remotePath = `${remoteDir}/${entry.name}`;

      if (entry.isDirectory()) {
        await walk(localPath, remotePath);
      } else if (entry.isFile()) {
        const buf = await readFile(localPath);
        await sandbox.write(remotePath, buf);
      }
    }
  }

  await walk(snapshotRef, remoteRoot);
}

export function resolveAgentRoot(snapshotRef: string): string {
  return snapshotRef;
}
