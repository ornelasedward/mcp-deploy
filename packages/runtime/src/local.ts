import type { Ctx, ResolvedAgent } from "@platform/sdk";
import type { ExecuteOptions } from "./types";

/** Dev runtime: in-process. No isolation — never use for untrusted third-party agents. */
export class LocalRuntime {
  async execute<I, O>({ agent, input, ctx }: ExecuteOptions<I, O>): Promise<O> {
    const parsed = agent.input.parse(input);
    const output = await agent.handler(parsed, ctx);
    return agent.output.parse(output);
  }
}
