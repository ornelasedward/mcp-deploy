import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

export interface CloneOptions {
  cloneUrl: string;
  commitSha: string;
  workDir: string;
  /** Optional token for private repos (`x-access-token:TOKEN`). */
  gitToken?: string;
}

/** Shallow clone and checkout an exact commit into workDir. */
export async function cloneAtCommit(opts: CloneOptions): Promise<void> {
  await mkdir(opts.workDir, { recursive: true });
  let url = opts.cloneUrl;
  if (opts.gitToken) {
    url = url.replace(
      "https://",
      `https://x-access-token:${opts.gitToken}@`,
    );
  }

  await exec("git", ["init"], { cwd: opts.workDir });
  await exec("git", ["remote", "add", "origin", url], { cwd: opts.workDir });
  await exec("git", ["fetch", "origin", opts.commitSha, "--depth", "1"], {
    cwd: opts.workDir,
  });
  await exec("git", ["checkout", "FETCH_HEAD"], { cwd: opts.workDir });
}
