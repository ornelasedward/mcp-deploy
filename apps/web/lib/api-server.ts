import "server-only";
import { apiBase, devOrgId } from "./api-shared";

export { apiBase, devOrgId };

export async function apiHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(extra as Record<string, string>),
  };

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    const { auth } = await import("@clerk/nextjs/server");
    const { getToken } = await auth();
    const token = await getToken();
    if (token) headers.authorization = `Bearer ${token}`;
  } else {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY;
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["x-org-id"] = devOrgId();
    headers["x-user-id"] = "dev-user";
  }

  if (!headers["x-org-id"]) headers["x-org-id"] = devOrgId();
  return headers;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = await apiHeaders(init?.headers);
  return fetch(`${apiBase()}${path}`, {
    ...init,
    headers: { ...headers, ...(init?.headers as object) },
  });
}
