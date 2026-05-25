import { LocalEngine } from "./local";
import { InngestEngine } from "./inngest-engine";

export * from "./types";
export * from "./local";
export { inngest, type AgentRunEvent, type AgentResumeEvent } from "./inngest";
export { createInngestStepEngine, type InngestStepLike } from "./inngest-step";
export { enqueueBackground } from "./background";

export function createDurableEngine(
  mode: "local" | "inngest",
  _opts?: { db?: boolean },
): DurableEngine {
  return mode === "inngest" ? new InngestEngine() : new LocalEngine();
}
