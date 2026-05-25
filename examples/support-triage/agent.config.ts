import { defineAgent } from "@platform/sdk";
import { z } from "zod";

export default defineAgent({
  name: "support-triage",
  description: "Classifies an inbound support message and drafts a reply.",
  input: z.object({
    message: z.string(),
    userId: z.string().optional(),
  }),
  output: z.object({
    reply: z.string(),
    category: z.enum(["billing", "bug", "other"]),
  }),
  evals: "./evals",
  // Surface selector: expose this agent on all four doorways. Try ["mcp", "cli"] to scope it.
  distribute: ["http", "mcp", "cli", "playground"],
  public: true,
  handler: async (input, ctx) => {
    const { text } = await ctx.llm.generate({
      system: "You are a support triage agent. Classify and draft a short reply.",
      prompt: input.message,
      maxTokens: 200,
    });
    const category = /refund|charge|invoice|billing/i.test(input.message)
      ? "billing"
      : /error|crash|bug|broken/i.test(input.message)
        ? "bug"
        : "other";
    return { reply: text, category };
  },
});
