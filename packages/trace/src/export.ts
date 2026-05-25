import type { RunEvent, TraceStore } from "./index";

/** Optional backend that receives append-only run events (Langfuse, OTel, etc.). */
export interface TraceExporter {
  readonly name: string;
  onEvent(event: RunEvent): Promise<void>;
}

/** Wraps a TraceStore and fan-outs each event to exporters (failures are logged, never thrown). */
export class ExportingTraceStore implements TraceStore {
  constructor(
    private inner: TraceStore,
    private exporters: TraceExporter[] = [],
  ) {}

  async beginRun(record: Parameters<NonNullable<TraceStore["beginRun"]>>[0]): Promise<void> {
    await this.inner.beginRun?.(record);
  }

  async append(event: RunEvent): Promise<void> {
    await this.inner.append(event);
    for (const exporter of this.exporters) {
      void exporter.onEvent(event).catch((err) => {
        console.warn(`[trace-export:${exporter.name}]`, err);
      });
    }
  }

  async list(runId: string) {
    return this.inner.list(runId);
  }

  async getRun(runId: string) {
    return this.inner.getRun?.(runId) ?? null;
  }

  async updateRunStatus(
    runId: string,
    status: Parameters<NonNullable<TraceStore["updateRunStatus"]>>[1],
    extra?: Parameters<NonNullable<TraceStore["updateRunStatus"]>>[2],
  ): Promise<void> {
    await this.inner.updateRunStatus?.(runId, status, extra);
  }

  async completeRun(payload: Parameters<NonNullable<TraceStore["completeRun"]>>[0]): Promise<void> {
    await this.inner.completeRun?.(payload);
  }
}
