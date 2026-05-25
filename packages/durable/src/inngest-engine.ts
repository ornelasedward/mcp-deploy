import type { DurableEngine, StepApi, WorkflowOptions } from "./types";
import { LocalEngine } from "./local";

/**
 * Production: HTTP runs use LocalEngine for low-latency sync responses.
 * Long-running / async runs use POST .../run?async=1 → Inngest workflow.
 */
export class InngestEngine implements DurableEngine {
  private fallback = new LocalEngine();
  async execute<T>(opts: WorkflowOptions, fn: (step: StepApi) => Promise<T>): Promise<T> {
    return this.fallback.execute(opts, fn);
  }
}
