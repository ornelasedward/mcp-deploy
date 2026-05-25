"use client";

import { useState } from "react";
import { clientApiFetch } from "../lib/client-api";

export function HitlApprove({
  orgId,
  slug,
  runId,
  eventName = "approval",
}: {
  orgId: string;
  slug: string;
  runId: string;
  eventName?: string;
}) {
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function approve() {
    setStatus("sending");
    setMessage(null);
    try {
      const res = await clientApiFetch(
        `/v1/agents/${slug}/runs/${runId}/resume`,
        {
          method: "POST",
          body: JSON.stringify({ eventName, payload: { approved: true } }),
        },
      );
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? res.statusText);
      }
      setStatus("done");
      setMessage("Approval sent — refresh to see the completed run.");
    } catch (e) {
      setStatus("error");
      setMessage(String(e));
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        border: "1px solid #fbbf24",
        borderRadius: 8,
        background: "#fffbeb",
      }}
    >
      <p style={{ margin: "0 0 12px", fontSize: 14 }}>
        This run is <strong>suspended</strong>, waiting for <code>{eventName}</code>.
      </p>
      <button
        type="button"
        onClick={() => void approve()}
        disabled={status === "sending" || status === "done"}
        style={{
          padding: "8px 16px",
          borderRadius: 6,
          border: "none",
          background: "#16a34a",
          color: "#fff",
          cursor: status === "sending" ? "wait" : "pointer",
          fontWeight: 600,
        }}
      >
        {status === "sending" ? "Sending…" : status === "done" ? "Approved" : "Approve"}
      </button>
      {message && (
        <p style={{ marginTop: 10, fontSize: 13, color: status === "error" ? "#dc2626" : "#444" }}>
          {message}
        </p>
      )}
    </div>
  );
}
