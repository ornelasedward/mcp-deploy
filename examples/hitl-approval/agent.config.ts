import { defineAgent } from "@platform/sdk";
import { z } from "zod";

/** Demo agent that suspends until POST .../runs/:id/resume (async + Inngest). */
export default defineAgent({
  name: "hitl-approval",
  description: "Waits for human approval before completing",
  input: z.object({ action: z.string() }),
  output: z.object({ approved: z.boolean(), action: z.string() }),
  distribute: ["http"],
  handler: async (input, ctx) => {
    if (!ctx.step) {
      throw new Error("hitl-approval requires an async run (DURABLE=inngest, ?async=1)");
    }
    const payload = await ctx.step.waitForEvent<{ approved?: boolean }>("approval", {
      timeoutMs: 3_600_000,
    });
    const approved = Boolean(
      payload && typeof payload === "object" && "approved" in payload
        ? payload.approved
        : payload,
    );
    return { approved, action: input.action };
  },
});
