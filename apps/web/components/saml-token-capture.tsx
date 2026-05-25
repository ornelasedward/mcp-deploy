"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/** Persist SAML ACS redirect token for API calls (enterprise BYOC). */
export function SamlTokenCapture() {
  const params = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = params.get("saml_token");
    if (!token) return;
    sessionStorage.setItem("agentd_saml_token", token);
    const url = new URL(window.location.href);
    url.searchParams.delete("saml_token");
    router.replace(url.pathname + url.search);
  }, [params, router]);

  return null;
}
