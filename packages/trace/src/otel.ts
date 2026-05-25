import type { RunEvent } from "./index";
import type { TraceExporter } from "./export";

export interface OtelExporterOptions {
  endpoint: string;
  serviceName?: string;
}

/**
 * Minimal OTLP-friendly JSON exporter (one span per run_event).
 * Works with collectors that accept `application/json` on `/v1/traces`.
 */
export class OtelExporter implements TraceExporter {
  readonly name = "otel";
  constructor(private opts: OtelExporterOptions) {}

  async onEvent(event: RunEvent): Promise<void> {
    const url = this.opts.endpoint.replace(/\/$/, "");
    const target = url.endsWith("/v1/traces") ? url : `${url}/v1/traces`;

    const span = {
      traceId: event.runId,
      spanId: event.id.replace(/-/g, "").slice(0, 16),
      name: event.type,
      startTimeUnixNano: String(event.ts * 1_000_000),
      endTimeUnixNano: String((event.ts + (event.durationMs ?? 0)) * 1_000_000),
      attributes: [
        { key: "run_id", value: { stringValue: event.runId } },
        { key: "service.name", value: { stringValue: this.opts.serviceName ?? "agentd" } },
        {
          key: "payload",
          value: { stringValue: JSON.stringify(event.payload).slice(0, 4000) },
        },
      ],
    };

    const res = await fetch(target, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ resourceSpans: [{ scopeSpans: [{ spans: [span] }] }] }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`OTel export ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
