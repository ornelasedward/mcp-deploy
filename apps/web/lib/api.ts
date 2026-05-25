const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "http://localhost:8787";
const DEV_ORG = process.env.NEXT_PUBLIC_DEV_ORG_ID ?? "org_dev";

export function apiBase() {
  return API_BASE.replace(/\/$/, "");
}

export function devOrgId() {
  return DEV_ORG;
}

export async function apiHeaders(extra?: HeadersInit): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(extra as Record<string, string>),
  };

  if (process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY) {
    try {
      const { auth } = await import("@clerk/nextjs/server");
      const { getToken } = await auth();
      const token = await getToken();
      if (token) headers.authorization = `Bearer ${token}`;
    } catch {
      // client-only fallback
    }
  } else {
    headers["x-org-id"] = DEV_ORG;
    headers["x-user-id"] = "dev-user";
  }

  if (!headers["x-org-id"]) headers["x-org-id"] = DEV_ORG;
  return headers;
}

export async function apiFetch(path: string, init?: RequestInit) {
  const headers = await apiHeaders(init?.headers);
  return fetch(`${apiBase()}${path}`, { ...init, headers: { ...headers, ...(init?.headers as object) } });
}
