"use client";

import { apiBase, devOrgId } from "./api-shared";

export { apiBase, devOrgId };

/** Headers for browser-side API calls (no Clerk server imports). */
export function clientApiHeaders(extra?: HeadersInit): HeadersInit {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    ...(extra as Record<string, string>),
  };

  const saml = sessionStorage.getItem("agentd_saml_token");
  if (saml) {
    headers.authorization = `Bearer ${saml}`;
  } else {
    const apiKey = process.env.NEXT_PUBLIC_API_KEY;
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["x-org-id"] = devOrgId();
    headers["x-user-id"] = "dev-user";
  }

  return headers;
}
