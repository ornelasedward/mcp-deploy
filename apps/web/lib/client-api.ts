const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787";
const DEV_ORG = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? "org_dev";

export function clientApiHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...extra,
  };
  const apiKey = process.env.NEXT_PUBLIC_API_KEY;
  if (apiKey) {
    headers.authorization = `Bearer ${apiKey}`;
  } else {
    headers["x-org-id"] = DEV_ORG;
    headers["x-user-id"] = "dev-user";
  }
  if (!headers["x-org-id"]) headers["x-org-id"] = DEV_ORG;
  return headers;
}

export function clientApiUrl(path: string) {
  return `${API_BASE.replace(/\/$/, "")}${path}`;
}
