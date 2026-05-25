import { createHash, randomBytes } from "node:crypto";

export type OrgRole = "owner" | "member" | "viewer";

const KEY_PREFIX = "agd_live_";

export function generateApiKey(): { key: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const key = `${KEY_PREFIX}${secret}`;
  const prefix = key.slice(0, 16);
  return { key, prefix, hash: hashApiKey(key) };
}

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

export function isOrgApiKey(token: string): boolean {
  return token.startsWith(KEY_PREFIX);
}

/** RBAC: can deploy and manage keys */
export function canDeploy(role: OrgRole): boolean {
  return role === "owner" || role === "member";
}

export function canManageKeys(role: OrgRole): boolean {
  return role === "owner";
}

export function canRun(role: OrgRole): boolean {
  return role === "owner" || role === "member" || role === "viewer";
}
