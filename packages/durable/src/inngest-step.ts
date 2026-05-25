import type { DurableEngine, StepApi, WorkflowOptions } from "./types";

/** Minimal Inngest step surface (keeps @platform/durable free of handler generics). */
export interface InngestStepLike {
  run<T>(id: string, fn: () => Promise<T>): Promise<T>;
  waitForEvent<T>(
    id: string,
    opts: { event: string; timeout: string; if?: string; match?: string },
  ): Promise<T | null>;
}

/** Binds Inngest checkpointing + HITL waits to the dispatcher's StepApi. */
export function createInngestStepEngine(step: InngestStepLike, runId: string): DurableEngine {
  return {
    async execute<T>(opts: WorkflowOptions, fn: (stepApi: StepApi) => Promise<T>): Promise<T> {
      const stepApi: StepApi = {
        run: (name, f) => step.run(`${opts.workflow}:${opts.id}:${name}`, f),
        waitForEvent: async (name, wopts) => {
          const timeoutMs = wopts?.timeoutMs ?? 86_400_000;
          const seconds = Math.max(1, Math.ceil(timeoutMs / 1000));
          const received = await step.waitForEvent<{ data: { payload?: unknown } }>(
            `${opts.workflow}:${opts.id}:wait:${name}`,
            {
              event: "agent/resume",
              timeout: `${seconds}s`,
              if: `async.data.runId == '${runId}' && async.data.eventName == '${name}'`,
            },
          );
          if (!received) {
            throw new Error(`waitForEvent timed out: ${name}`);
          }
          return received.data?.payload as unknown;
        },
      };
      return fn(stepApi);
    },
  };
}
