"use client";

import { useState } from "react";
import { apiBase, clientApiHeaders, devOrgId } from "../lib/api-client";

export function BillingActions({
  canUpgrade,
  showPortal,
}: {
  canUpgrade: boolean;
  showPortal: boolean;
}) {
  const [loading, setLoading] = useState(false);
  const orgId = devOrgId();

  async function post(path: string) {
    setLoading(true);
    try {
      const headers = clientApiHeaders();
      const res = await fetch(`${apiBase()}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? res.statusText);
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      {canUpgrade && (
        <button
          type="button"
          disabled={loading}
          onClick={() => post(`/v1/orgs/${orgId}/billing/checkout`)}
          className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50"
        >
          {loading ? "Redirecting…" : "Upgrade to Pro"}
        </button>
      )}
      {showPortal && (
        <button
          type="button"
          disabled={loading}
          onClick={() => post(`/v1/orgs/${orgId}/billing/portal`)}
          className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 disabled:opacity-50"
        >
          Manage subscription
        </button>
      )}
    </div>
  );
}
