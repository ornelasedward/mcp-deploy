import {
  BudgetExceededError, type GatewayClient, type GenerateOptions, type GenerateResult,
  type LlmUsage, type TraceEmitter,
} from "@platform/sdk";

export interface Budget {
  perRunCapUsd: number;
  monthlyCapUsd: number;
  hardStop: boolean;
}

/** Tracks monthly spend and enforces org cap before each LLM call. */
export interface MonthlySpendTracker {
  getMonthlySpendUsd(orgId: string): Promise<number>;
  addSpend(orgId: string, costUsd: number): Promise<void>;
}

export interface RunBudgetScope {
  runId: string;
  orgId: string;
  budget: Budget;
  trace: TraceEmitter;
  /** Called after every model call so usage can be persisted (usage_events). */
  onUsage?: (usage: LlmUsage) => void | Promise<void>;
}

/** The ONLY path to model providers. Every client is scoped to a single run and enforces caps. */
export interface Gateway {
  forRun(scope: RunBudgetScope): GatewayClient;
}

// Minimal price table (USD per 1M tokens). Extend as needed.
const PRICES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "gpt-4o": { in: 2.5, out: 10 },
  "local-mock": { in: 0, out: 0 },
};

function price(model: string, inTok: number, outTok: number): number {
  const p = PRICES[model] ?? { in: 1, out: 3 };
  return (inTok * p.in + outTok * p.out) / 1_000_000;
}

function checkMonthlyCap(
  scope: RunBudgetScope,
  tracker: MonthlySpendTracker | undefined,
  monthlySpent: number,
  projectedCost: number,
) {
  if (!scope.budget.hardStop) return;
  const cap = scope.budget.monthlyCapUsd;
  if (monthlySpent >= cap) {
    throw new BudgetExceededError(
      `Org ${scope.orgId} hit monthly cap $${cap} (spent $${monthlySpent.toFixed(4)})`,
    );
  }
  if (monthlySpent + projectedCost > cap) {
    throw new BudgetExceededError(
      `Org ${scope.orgId} would exceed monthly cap $${cap}`,
    );
  }
}

abstract class BaseGateway implements Gateway {
  constructor(protected monthlyTracker?: MonthlySpendTracker) {}

  forRun(scope: RunBudgetScope): GatewayClient {
    let spent = 0;
    const self = this;
    const tracker = this.monthlyTracker;
    return {
      async generate(opts: GenerateOptions): Promise<GenerateResult> {
        return scope.trace.span("llm_call", { model: opts.model ?? self.defaultModel }, async () => {
          const monthlySpent = tracker ? await tracker.getMonthlySpendUsd(scope.orgId) : 0;
          if (scope.budget.hardStop && spent >= scope.budget.perRunCapUsd) {
            throw new BudgetExceededError(
              `Run ${scope.runId} hit per-run cap $${scope.budget.perRunCapUsd}`,
            );
          }
          checkMonthlyCap(scope, tracker, monthlySpent, 0);

          const result = await self.complete(opts);
          spent += result.usage.costUsd;
          await scope.onUsage?.(result.usage);
          await tracker?.addSpend(scope.orgId, result.usage.costUsd);

          if (scope.budget.hardStop && spent > scope.budget.perRunCapUsd) {
            throw new BudgetExceededError(
              `Run ${scope.runId} exceeded per-run cap (spent $${spent.toFixed(4)})`,
            );
          }
          const afterMonthly = monthlySpent + result.usage.costUsd;
          checkMonthlyCap(scope, tracker, afterMonthly, 0);

          scope.trace.event("llm.token", { model: result.usage.model, text: result.text });
          return result;
        });
      },
    };
  }
  abstract defaultModel: string;
  protected abstract complete(opts: GenerateOptions): Promise<GenerateResult>;
}

/** Deterministic, offline. Runs with NO provider account. */
export class LocalGateway extends BaseGateway {
  defaultModel = "local-mock";
  protected async complete(opts: GenerateOptions): Promise<GenerateResult> {
    const prompt = opts.prompt ?? opts.messages?.map((m) => m.content).join("\n") ?? "";
    const text = `[local-mock reply] ${prompt.slice(0, 200)}`;
    const inputTokens = Math.ceil(prompt.length / 4);
    const outputTokens = Math.ceil(text.length / 4);
    return {
      text,
      usage: { inputTokens, outputTokens, model: this.defaultModel, costUsd: 0 },
    };
  }
}

/** Real provider via Vercel AI SDK. Imported lazily so the local path needs no extra deps. */
export class LiveGateway extends BaseGateway {
  constructor(
    monthlyTracker?: MonthlySpendTracker,
    public defaultModel = "claude-sonnet-4-6",
  ) {
    super(monthlyTracker);
  }
  protected async complete(opts: GenerateOptions): Promise<GenerateResult> {
    const model = opts.model ?? this.defaultModel;
    const { generateText } = await import("ai");
    const { anthropic } = await import("@ai-sdk/anthropic");
    const res = await generateText({
      model: anthropic(model),
      system: opts.system,
      prompt: opts.prompt,
      messages: opts.messages as any,
      maxTokens: opts.maxTokens,
      temperature: opts.temperature,
    });
    const inputTokens = res.usage?.inputTokens ?? (res.usage as { promptTokens?: number })?.promptTokens ?? 0;
    const outputTokens = res.usage?.outputTokens ?? (res.usage as { completionTokens?: number })?.completionTokens ?? 0;
    const usage: LlmUsage = {
      inputTokens,
      outputTokens,
      model,
      costUsd: price(model, inputTokens, outputTokens),
    };
    return { text: res.text, usage };
  }
}

export function createGateway(
  mode: "local" | "live",
  monthlyTracker?: MonthlySpendTracker,
): Gateway {
  return mode === "live"
    ? new LiveGateway(monthlyTracker)
    : new LocalGateway(monthlyTracker);
}
