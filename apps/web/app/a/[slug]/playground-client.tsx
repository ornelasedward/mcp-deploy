"use client";

import { useEffect, useState } from "react";
import { ConnectPanel } from "../../../components/connect-panel";
import { TraceTimeline } from "../../../components/trace-timeline";
import { clientApiHeaders, clientApiUrl } from "../../../lib/client-api";
import { consumeSse } from "../../../lib/sse-client";

export default function PlaygroundClient({
  slug,
  prNumber,
  isPublic,
}: {
  slug: string;
  prNumber?: number;
  isPublic?: boolean;
}) {
  const [connect, setConnect] = useState<{
    surfaces?: string[];
    snippets?: Record<string, string>;
  } | null>(null);
  const [message, setMessage] = useState("I was charged twice for my invoice");
  const [out, setOut] = useState<Record<string, unknown> | null>(null);
  const [liveText, setLiveText] = useState("");
  const [trace, setTrace] = useState<
    { type: string; payload: Record<string, unknown>; durationMs?: number }[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [useStream, setUseStream] = useState(true);

  useEffect(() => {
    if (isPublic) return;
    const q = prNumber != null ? `?pr=${prNumber}` : "";
    fetch(clientApiUrl(`/v1/agents/${slug}/connect${q}`), {
      headers: clientApiHeaders(),
    })
      .then((r) => r.json())
      .then(setConnect)
      .catch(() => {});
  }, [slug, prNumber, isPublic]);

  async function runStream() {
    const url = isPublic
      ? clientApiUrl(`/v1/public/agents/${slug}/run/stream`)
      : clientApiUrl(`/v1/agents/${slug}/run/stream`);
    const headers = isPublic
      ? { "content-type": "application/json" }
      : clientApiHeaders();

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { message } }),
    });
    if (!res.ok) throw new Error(`stream failed: ${res.status}`);

    await consumeSse(res, (event, data) => {
      if (event === "token") {
        const text = (data as { text?: string }).text ?? "";
        setLiveText((prev) => prev + text);
      }
      if (event === "trace") {
        const e = data as { type: string; payload: Record<string, unknown>; durationMs?: number };
        setTrace((prev) => [...prev, e]);
      }
      if (event === "done") {
        setOut(data as Record<string, unknown>);
      }
      if (event === "error") {
        setOut({ error: (data as { message?: string }).message ?? "error" });
      }
    });
  }

  async function runClassic() {
    const r = await fetch(clientApiUrl(`/v1/agents/${slug}/run`), {
      method: "POST",
      headers: clientApiHeaders(),
      body: JSON.stringify({ input: { message } }),
    });
    const body = await r.json();
    setOut(body);
    if (body.runId) {
      const tr = await fetch(clientApiUrl(`/v1/agents/${slug}/runs/${body.runId}/trace`), {
        headers: clientApiHeaders(),
      });
      const traceBody = await tr.json();
      setTrace(traceBody.events ?? []);
    }
  }

  async function run() {
    setLoading(true);
    setTrace([]);
    setLiveText("");
    setOut(null);
    try {
      if (isPublic || useStream) {
        await runStream();
      } else {
        await runClassic();
      }
    } catch (err) {
      setOut({ error: String(err) });
    } finally {
      setLoading(false);
    }
  }

  return (
    <main>
      <h1>{slug}</h1>
      <p style={{ color: "#666" }}>
        {isPublic && (
          <span style={{ background: "#ecfdf5", color: "#166534", padding: "2px 8px", borderRadius: 4, marginRight: 8 }}>
            Public
          </span>
        )}
        {prNumber != null ? `Preview deploy · PR #${prNumber}` : "Playground"} ·{" "}
        {isPublic ? "no auth required" : "HTTP surface"}
      </p>
      {isPublic && (
        <p style={{ fontSize: 13, color: "#666" }}>
          Share this link: <code>{typeof window !== "undefined" ? window.location.href : `/a/${slug}`}</code>
        </p>
      )}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={4}
        style={{ width: "100%", marginTop: 8 }}
      />
      <div style={{ marginTop: 8, display: "flex", gap: 12, alignItems: "center" }}>
        <button onClick={run} disabled={loading}>
          {loading ? "Running…" : "Run agent"}
        </button>
        {!isPublic && (
          <label style={{ fontSize: 13 }}>
            <input
              type="checkbox"
              checked={useStream}
              onChange={(e) => setUseStream(e.target.checked)}
            />{" "}
            Live SSE stream
          </label>
        )}
      </div>

      {liveText && (
        <section style={{ marginTop: 24 }}>
          <h3>Live output</h3>
          <pre style={{ background: "#f4f4f5", padding: 12, whiteSpace: "pre-wrap" }}>{liveText}</pre>
        </section>
      )}

      {out && (
        <section style={{ marginTop: 24 }}>
          <h3>Result</h3>
          <pre style={{ background: "#f4f4f5", padding: 12, overflow: "auto" }}>
            {JSON.stringify(out, null, 2)}
          </pre>
        </section>
      )}

      {trace.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3>Trace replay</h3>
          <TraceTimeline events={trace} />
        </section>
      )}

      {connect && <ConnectPanel surfaces={connect.surfaces} snippets={connect.snippets} />}
    </main>
  );
}
