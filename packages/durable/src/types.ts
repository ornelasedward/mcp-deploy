export interface StepApi {
  run<T>(name: string, fn: () => Promise<T>): Promise<T>;
  waitForEvent<T = unknown>(name: string, opts?: { timeoutMs?: number }): Promise<T>;
}

export interface WorkflowOptions {
  workflow: string;
  id: string;
}

export interface DurableEngine {
  execute<T>(opts: WorkflowOptions, fn: (step: StepApi) => Promise<T>): Promise<T>;
}
