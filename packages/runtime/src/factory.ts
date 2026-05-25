import { BridgeRegistry } from "./bridge-registry";
import { startBridgeServer, type BridgeServer } from "./bridge-server";
import { E2BRuntime } from "./e2b-runtime";
import { MockE2BRuntime } from "./mock-e2b";
import { LocalRuntime } from "./local";
import type { Runtime } from "./types";

export interface RuntimeFactoryOpts {
  mode: "local" | "e2b";
  apiKey?: string;
  mockE2b?: boolean;
  bridgeUrl?: string;
  bridgeSecret?: string;
  bridgeRegistry?: BridgeRegistry;
  e2bTemplateId?: string;
  egressAllowlist?: string[];
  repoRoot?: string;
}

export interface RuntimeBundle {
  runtime: Runtime;
  bridgeRegistry: BridgeRegistry;
  bridgeServer?: BridgeServer;
}

export async function createRuntimeBundle(opts: RuntimeFactoryOpts): Promise<RuntimeBundle> {
  const bridgeRegistry = opts.bridgeRegistry ?? new BridgeRegistry();
  const bridgeSecret = opts.bridgeSecret ?? "dev-bridge";
  let bridgeUrl = opts.bridgeUrl;
  let bridgeServer: BridgeServer | undefined;

  if (opts.mode === "e2b" && opts.mockE2b) {
    bridgeServer = await startBridgeServer(bridgeRegistry, bridgeSecret, 0);
    bridgeUrl = `http://127.0.0.1:${bridgeServer.port}`;
  }

  if (opts.mode === "local") {
    return { runtime: new LocalRuntime(), bridgeRegistry, bridgeServer };
  }

  if (opts.mockE2b) {
    if (!bridgeUrl) throw new Error("bridgeUrl required for E2B mock");
    return {
      runtime: new MockE2BRuntime({
        bridgeUrl,
        bridgeToken: bridgeSecret,
        repoRoot: opts.repoRoot,
      }),
      bridgeRegistry,
      bridgeServer,
    };
  }

  if (!opts.apiKey) throw new Error("E2B_API_KEY required for RUNTIME=e2b");
  if (!bridgeUrl) {
    throw new Error(
      "PLATFORM_BASE_URL must be reachable from E2B sandboxes for ctx bridge (public API URL)",
    );
  }

  return {
    runtime: new E2BRuntime({
      apiKey: opts.apiKey,
      bridgeUrl,
      bridgeToken: bridgeSecret,
      templateId: opts.e2bTemplateId,
    }),
    bridgeRegistry,
    bridgeServer,
  };
}
