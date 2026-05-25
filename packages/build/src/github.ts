import { createHmac, timingSafeEqual } from "node:crypto";

/** Verify GitHub webhook `X-Hub-Signature-256` (HMAC-SHA256). */
export function verifyGitHubSignature(
  rawBody: string | Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);
  const hmac = createHmac("sha256", secret).update(rawBody).digest("hex");
  try {
    return timingSafeEqual(Buffer.from(hmac, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export interface GitHubDeployEvent {
  event: "push" | "pull_request";
  repoFullName: string;
  cloneUrl: string;
  commitSha: string;
  defaultBranch: string;
  isPreview: boolean;
  prNumber?: number;
  /** Push to default branch (production deploy). */
  isProduction: boolean;
}

export function parseGitHubWebhook(
  event: string,
  payload: Record<string, unknown>,
): GitHubDeployEvent | null {
  const repo = payload.repository as {
    full_name?: string;
    clone_url?: string;
    default_branch?: string;
  } | undefined;
  if (!repo?.full_name || !repo.clone_url) return null;

  if (event === "push") {
    const ref = String(payload.ref ?? "");
    const defaultBranch = repo.default_branch ?? "main";
    const isDefaultBranch = ref === `refs/heads/${defaultBranch}`;
    const after = payload.after as string | undefined;
    if (!after || after === "0000000000000000000000000000000000000000") return null;
    return {
      event: "push",
      repoFullName: repo.full_name,
      cloneUrl: repo.clone_url,
      commitSha: after,
      defaultBranch,
      isPreview: false,
      isProduction: isDefaultBranch,
    };
  }

  if (event === "pull_request") {
    const pr = payload.pull_request as {
      number?: number;
      head?: { sha?: string };
      state?: string;
    } | undefined;
    const action = String(payload.action ?? "");
    if (!["opened", "synchronize", "reopened"].includes(action)) return null;
    if (!pr?.head?.sha) return null;
    return {
      event: "pull_request",
      repoFullName: repo.full_name,
      cloneUrl: repo.clone_url,
      commitSha: pr.head.sha,
      defaultBranch: repo.default_branch ?? "main",
      isPreview: true,
      prNumber: pr.number,
      isProduction: false,
    };
  }

  return null;
}
