import { Hono } from "hono";
import type { DashboardStore } from "@platform/db";
import type { Platform } from "@platform/core";
import {
  IpRateLimiter,
  clientIp,
  isEnabled,
  listDirectoryAgents,
  publicBudget,
  resolvePublicAgent,
  sseResponse,
  streamAgentRun,
} from "@platform/core";
import { buildMcpServerCard } from "@platform/mcp";

export function publicRoutes(
  platform: Platform,
  dashboard: DashboardStore | undefined,
  rateLimiter: IpRateLimiter,
) {
  const app = new Hono();

  app.get("/v1/public/directory", async (c) => {
    const webBase = platform.config.WEB_BASE_URL;
    const apiBase = platform.config.PLATFORM_BASE_URL;

    if (dashboard) {
      const rows = await dashboard.listPublicDirectoryAgents(webBase);
      return c.json({
        agents: rows.map((r) => ({
          slug: r.slug,
          name: r.name,
          orgId: r.orgId,
          projectId: r.projectId,
          playgroundUrl: r.playgroundUrl,
          mcpUrl: `${apiBase.replace(/\/$/, "")}/mcp/${r.slug}`,
        })),
      });
    }

    const listed = listDirectoryAgents(platform.registry);
    return c.json({
      agents: listed.map(({ agent, orgId }) => ({
        slug: agent.slug,
        name: agent.name,
        description: agent.description,
        orgId,
        playgroundUrl: `${webBase.replace(/\/$/, "")}/a/${agent.slug}`,
        mcpUrl: `${apiBase.replace(/\/$/, "")}/mcp/${agent.slug}`,
      })),
    });
  });

  app.get("/v1/public/agents/:slug/mcp", async (c) => {
    const slug = c.req.param("slug");
    const resolved = await resolvePublicAgent(platform.registry, slug, dashboard);
    if (!resolved || !resolved.agent.public || !isEnabled(resolved.agent, "mcp")) {
      return c.json({ error: "not found" }, 404);
    }
    const card = buildMcpServerCard(
      resolved.agent,
      platform.config.PLATFORM_BASE_URL,
      platform.config.WEB_BASE_URL,
    );
    return c.json({ public: true, ...card });
  });

  app.get("/v1/public/agents/:slug", async (c) => {
    const slug = c.req.param("slug");
    const resolved = await resolvePublicAgent(platform.registry, slug, dashboard);
    if (!resolved || !isEnabled(resolved.agent, "playground")) {
      return c.json({ error: "not found" }, 404);
    }
    return c.json({
      slug: resolved.agent.slug,
      name: resolved.agent.name,
      description: resolved.agent.description,
      public: true,
      surfaces: resolved.agent.distribute,
      playgroundUrl: `${platform.config.WEB_BASE_URL.replace(/\/$/, "")}/a/${slug}`,
    });
  });

  app.post("/v1/public/agents/:slug/run/stream", async (c) => {
    const slug = c.req.param("slug");
    const ip = clientIp(c.req.raw);
    const limited = rateLimiter.check(ip);
    if (!limited.ok) {
      return c.json({ error: "rate limit exceeded", retryAfterSec: limited.retryAfterSec }, 429);
    }

    const resolved = await resolvePublicAgent(platform.registry, slug, dashboard);
    if (!resolved || !resolved.agent.public || !isEnabled(resolved.agent, "playground")) {
      return c.json({ error: "not found" }, 404);
    }

    const body = await c.req.json<{ input: unknown }>();
    const budget = publicBudget(platform.config);

    return sseResponse(async (send) => {
      send("run.start", { slug, public: true });
      await streamAgentRun({
        dispatch: platform.dispatch,
        trace: platform.trace,
        agent: resolved.agent,
        input: body.input,
        orgId: resolved.orgId,
        source: "playground",
        budget,
        onEvent: (event, data) => send(event, data),
      });
    });
  });

  return app;
}
