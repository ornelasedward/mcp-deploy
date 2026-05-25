import type { DurableEngine, StepApi, WorkflowOptions } from "./types";

/** Dev engine: runs steps inline, memoizes by id for idempotency, logs checkpoints. */
export class LocalEngine implements DurableEngine {
  private results = new Map<string, unknown>();
  async execute<T>(opts: WorkflowOptions, fn: (step: StepApi) => Promise<T>): Promise<T> {
    const cacheKey = `${opts.workflow}:${opts.id}`;
    if (this.results.has(cacheKey)) return this.results.get(cacheKey) as T;

    const step: StepApi = {
      async run<R>(name: string, f: () => Promise<R>): Promise<R> {
        let lastErr: unknown;
        for (let attempt = 1; attempt <= 3; attempt++) {
          try {
            return await f();
          } catch (err) {
            lastErr = err;
            await new Promise((r) => setTimeout(r, attempt * 50));
          }
        }
        throw lastErr;
      },
      async waitForEvent<R>(): Promise<R> {
        throw new Error("LocalEngine: waitForEvent (HITL) requires the Inngest engine");
      },
    };
    const result = await fn(step);
    this.results.set(cacheKey, result);
    return result;
  }
}
