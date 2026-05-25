import type { RunEvent } from "./index";
import type { TraceExporter } from "./export";

export interface LangfuseExporterOptions {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
}

/** Sends run events to Langfuse public ingestion API (fire-and-forget). */
export class LangfuseExporter implements TraceExporter {
  readonly name = "langfuse";
  private auth: string;

  constructor(private opts: LangfuseExporterOptions) {
    this.auth = Buffer.from(`${opts.publicKey}:${opts.secretKey}`).toString("base64");
  }

  async onEvent(event: RunEvent): Promise<void> {
    const base = (this.opts.baseUrl ?? "https://cloud.langfuse.com").replace(/\/$/, "");
    const body = {
      batch: [
        {
          type: "span-create",
          id: event.id,
          timestamp: new Date(event.ts).toISOString(),
          body: {
            traceId: event.runId,
            name: event.type,
            metadata: event.payload,
            parentObservationId: event.parentId ?? undefined,
          },
        },
      ],
    };

    const res = await fetch(`${base}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${this.auth}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Langfuse ingestion ${res.status}: ${text.slice(0, 200)}`);
    }
  }
}
