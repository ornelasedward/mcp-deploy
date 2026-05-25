import { serve } from "inngest/hono";
import { inngest } from "@platform/durable";
import { buildPlatform, hydrateRegistry } from "@platform/core";

export const runAgentWorkflow = inngest.createFunction(
  { id: "agent-run", retries: 3, triggers: [{ event: "agent/run" }] },
  async ({ event, step }) => {
    const platform = await buildPlatform();
    await hydrateRegistry(platform.registry, {
      agentsDir: process.env.AGENTS_DIR,
      deploy: platform.deploy,
      defaultOrgId: platform.config.DEFAULT_ORG_ID,
    });

    const agent = platform.registry.get(event.data.slug, event.data.orgId);
    if (!agent) throw new Error(`Agent not found: ${event.data.slug}`);

    const budget = await platform.resolveBudget(event.data.orgId);
    return step.run("dispatch", () =>
      platform.dispatch({
        agent,
        input: event.data.input,
        source: event.data.source as "http",
        orgId: event.data.orgId,
        idempotencyKey: event.data.runId,
        budget,
      }),
    );
  },
);

export const inngestFunctions = [runAgentWorkflow];
export const inngestHandler = serve({ client: inngest, functions: inngestFunctions });
