import { z } from "zod";

/**
 * The four distribution surfaces an agent can expose. Evals are NOT a surface —
 * they are a quality gate that always runs. This is the user-selectable layer.
 */
export const SURFACES = ["http", "mcp", "cli", "playground"] as const;
export type Surface = (typeof SURFACES)[number];

/** Where a run originated. Recorded on every run so traffic can be split & billed per surface. */
export type RunSource = Surface | "eval";

/** Usage returned by every gateway call; the gateway is the ONLY path to model providers. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  model: string;
}

export interface GenerateOptions {
  model?: string;
  system?: string;
  prompt?: string;
  messages?: { role: "user" | "assistant" | "system"; content: string }[];
  maxTokens?: number;
  temperature?: number;
}

export interface GenerateResult {
  text: string;
  usage: LlmUsage;
}

/** Cost-tracked, budget-enforced, traced model access. Implemented by @platform/gateway. */
export interface GatewayClient {
  generate(opts: GenerateOptions): Promise<GenerateResult>;
}

/** Span emitter; every emit becomes an append-only run_event powering trace replay. */
export interface TraceEmitter {
  span<T>(type: string, payload: Record<string, unknown>, fn: () => Promise<T>): Promise<T>;
  event(type: string, payload: Record<string, unknown>): void;
}

/** Durable per-run state for suspend/resume across sandbox teardown. */
export interface Memory {
  get<T = unknown>(key: string): Promise<T | undefined>;
  set<T = unknown>(key: string, value: T): Promise<void>;
}

/** Sandboxed tool execution surface handed to the agent. */
export interface ToolHost {
  call<T = unknown>(name: string, args: Record<string, unknown>): Promise<T>;
}

/** Read project/org secrets (values never written to trace). */
export interface SecretReader {
  get(name: string): Promise<string | undefined>;
}

/** Human-in-the-loop waits (Inngest async runs only). */
export interface RunStep {
  waitForEvent<T = unknown>(name: string, opts?: { timeoutMs?: number }): Promise<T>;
}

/** Everything the agent handler receives. Built per-run by the dispatcher. */
export interface Ctx {
  runId: string;
  llm: GatewayClient;
  trace: TraceEmitter;
  memory: Memory;
  tools: ToolHost;
  signal: AbortSignal;
  /** Encrypted project secrets (optional). */
  secrets?: SecretReader;
  /** Suspend until `POST .../runs/:id/resume` (async/Inngest runs). */
  step?: RunStep;
}

export interface AgentManifest<I = unknown, O = unknown> {
  name: string;
  description?: string;
  input: z.ZodType<I>;
  output: z.ZodType<O>;
  /** Relative path to a directory of eval cases (run on every deploy/PR). */
  evals?: string;
  /** SURFACE SELECTOR. Omit for all four. */
  distribute?: Surface[];
  /** When true, `/a/{slug}` playground is shareable without auth (rate-limited). */
  public?: boolean;
  handler: (input: I, ctx: Ctx) => Promise<O>;
}

/** A manifest with defaults normalized (distribute resolved). */
export type ResolvedAgent<I = unknown, O = unknown> = AgentManifest<I, O> & {
  distribute: Surface[];
  slug: string;
};

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/**
 * The linchpin contract. Everything (HTTP, MCP, CLI, playground, evals) is derived
 * from the object returned here.
 */
export function defineAgent<I, O>(manifest: AgentManifest<I, O>): ResolvedAgent<I, O> {
  const distribute = manifest.distribute ?? [...SURFACES];
  return { ...manifest, distribute, slug: slugify(manifest.name) };
}

export class BudgetExceededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BudgetExceededError";
  }
}
