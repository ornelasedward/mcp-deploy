import { LocalEngine } from "./local";
import { InngestEngine } from "./inngest-engine";

export * from "./types";
export * from "./local";
export { inngest, type AgentRunEvent } from "./inngest";

export function createDurableEngine(
  mode: "local" | "inngest",
  _opts?: { db?: boolean },
): DurableEngine {
  return mode === "inngest" ? new InngestEngine() : new LocalEngine();
}
