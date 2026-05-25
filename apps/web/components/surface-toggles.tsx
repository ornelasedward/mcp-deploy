"use client";

import { useState } from "react";
import { clientApiHeaders, clientApiUrl } from "../lib/client-api";

const SURFACES = ["http", "mcp", "cli", "playground"] as const;

export function SurfaceToggles({
  orgId,
  projectId,
  slug,
  initialSurfaces,
  initialPublic,
}: {
  orgId: string;
  projectId: string;
  slug: string;
  initialSurfaces: string[];
  initialPublic: boolean;
}) {
  const [surfaces, setSurfaces] = useState<string[]>(initialSurfaces);
  const [isPublic, setIsPublic] = useState(initialPublic);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(surface: string) {
    setSurfaces((prev) =>
      prev.includes(surface) ? prev.filter((s) => s !== surface) : [...prev, surface],
    );
  }

  async function save() {
    setSaving(true);
    setMsg(null);
    try {
      const r = await fetch(
        clientApiUrl(`/v1/orgs/${orgId}/projects/${projectId}/agents/${slug}`),
        {
          method: "PATCH",
          headers: clientApiHeaders(),
          body: JSON.stringify({
            distribute: surfaces,
            public: isPublic,
          }),
        },
      );
      if (!r.ok) {
        const err = await r.json().catch(() => ({}));
        setMsg((err as { error?: string }).error ?? "Save failed");
        return;
      }
      setMsg("Saved — registry updated without redeploy.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section style={{ marginTop: 28, border: "1px solid #e4e4e7", borderRadius: 8, padding: 16 }}>
      <h2>Surfaces</h2>
      <p style={{ fontSize: 13, color: "#666" }}>Toggle distribution surfaces (saved to DB + live registry).</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 12 }}>
        {SURFACES.map((s) => (
          <label key={s} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={surfaces.includes(s)}
              onChange={() => toggle(s)}
            />
            {s}
          </label>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 16, cursor: "pointer" }}>
        <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
        <span>
          <strong>Public playground</strong>
          <span style={{ color: "#666", marginLeft: 6, fontSize: 13 }}>
            — shareable link, anonymous runs (rate-limited)
          </span>
        </span>
      </label>
      <div style={{ marginTop: 16, display: "flex", gap: 12, alignItems: "center" }}>
        <button type="button" onClick={save} disabled={saving || surfaces.length === 0}>
          {saving ? "Saving…" : "Save surfaces"}
        </button>
        {msg && <span style={{ fontSize: 13, color: msg.includes("failed") ? "#dc2626" : "#16a34a" }}>{msg}</span>}
      </div>
    </section>
  );
}
