import type { Ctx, GenerateOptions, GenerateResult, ToolHost } from "@platform/sdk";
import { isAllowedEgressUrl } from "./egress";

export interface BridgeSession {
  runId: string;
  orgId: string;
  ctx: Ctx;
  egressAllowlist: string[];
}

const sessions = new Map<string, BridgeSession>();

export class BridgeRegistry {
  register(session: BridgeSession) {
    sessions.set(session.runId, session);
  }

  unregister(runId: string) {
    sessions.delete(runId);
  }

  get(runId: string): BridgeSession | undefined {
    return sessions.get(runId);
  }
}

export function verifyBridgeToken(req: Request, secret: string): boolean {
  return req.headers.get("x-bridge-token") === secret;
}

export async function handleBridgeRequest(
  registry: BridgeRegistry,
  secret: string,
  req: Request,
): Promise<Response> {
  if (!verifyBridgeToken(req, secret)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const match = url.pathname.match(/^\/internal\/bridge\/([^/]+)(\/.*)?$/);
  if (!match) return Response.json({ error: "not found" }, { status: 404 });

  const runId = match[1]!;
  const subpath = match[2] ?? "";
  const session = registry.get(runId);
  if (!session) return Response.json({ error: "session not found" }, { status: 404 });

  const body = req.method === "GET" ? {} : await req.json().catch(() => ({}));

  try {
    if (subpath === "/llm/generate" && req.method === "POST") {
      const result = await session.ctx.llm.generate(body as GenerateOptions);
      return Response.json({ result });
    }

    if (subpath === "/trace/event" && req.method === "POST") {
      const { type, payload } = body as { type: string; payload: Record<string, unknown> };
      session.ctx.trace.event(type, payload);
      return Response.json({ ok: true });
    }

    if (subpath === "/tools/call" && req.method === "POST") {
      const { name, args, url } = body as {
        name: string;
        args: Record<string, unknown>;
        url?: string;
      };
      if (url && !isAllowedEgressUrl(url, session.egressAllowlist)) {
        return Response.json({ error: "egress denied", url }, { status: 403 });
      }
      const result = await session.ctx.tools.call(name, args);
      return Response.json({ result });
    }

    if (subpath === "/memory/get" && req.method === "POST") {
      const { key } = body as { key: string };
      const value = await session.ctx.memory.get(key);
      return Response.json({ value });
    }

    if (subpath === "/memory/set" && req.method === "POST") {
      const { key, value } = body as { key: string; value: unknown };
      await session.ctx.memory.set(key, value);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "unknown bridge path" }, { status: 404 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
