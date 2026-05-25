import type { Ctx, GenerateOptions, GenerateResult, GatewayClient, Memory, ToolHost, TraceEmitter } from "@platform/sdk";

function bridgeUrl(base: string, runId: string, path: string) {
  return `${base.replace(/\/$/, "")}/internal/bridge/${runId}${path}`;
}

async function post<T>(url: string, token: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-bridge-token": token,
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { error?: string; result?: T; value?: T; ok?: boolean };
  if (!res.ok) throw new Error(json.error ?? `bridge ${res.status}`);
  return (json.result ?? json.value) as T;
}

/** Ctx implementation that proxies all privileged calls back to the platform process. */
export function createBridgeCtx(runId: string, bridgeBase: string, bridgeToken: string): Ctx {
  const llm: GatewayClient = {
    generate(opts: GenerateOptions) {
      return post<GenerateResult>(
        bridgeUrl(bridgeBase, runId, "/llm/generate"),
        bridgeToken,
        opts,
      );
    },
  };

  const trace: TraceEmitter = {
    event(type, payload) {
      void post(bridgeUrl(bridgeBase, runId, "/trace/event"), bridgeToken, { type, payload });
    },
    async span(type, payload, fn) {
      const start = Date.now();
      try {
        const result = await fn();
        await post(bridgeUrl(bridgeBase, runId, "/trace/event"), bridgeToken, {
          type,
          payload,
          durationMs: Date.now() - start,
        });
        return result;
      } catch (err) {
        await post(bridgeUrl(bridgeBase, runId, "/trace/event"), bridgeToken, {
          type: `${type}.error`,
          payload: { ...payload, error: String(err) },
          durationMs: Date.now() - start,
        });
        throw err;
      }
    },
  };

  const memory: Memory = {
    get(key) {
      return post(bridgeUrl(bridgeBase, runId, "/memory/get"), bridgeToken, { key });
    },
    set(key, value) {
      return post(bridgeUrl(bridgeBase, runId, "/memory/set"), bridgeToken, { key, value }).then(
        () => undefined,
      );
    },
  };

  const tools: ToolHost = {
    call(name, args) {
      return post(bridgeUrl(bridgeBase, runId, "/tools/call"), bridgeToken, { name, args });
    },
  };

  return {
    runId,
    llm,
    trace,
    memory,
    tools,
    signal: AbortSignal.timeout(120_000),
  };
}
