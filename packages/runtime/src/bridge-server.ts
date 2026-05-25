import { createServer, type Server } from "node:http";
import type { BridgeRegistry } from "./bridge-registry";
import { handleBridgeRequest } from "./bridge-registry";

export interface BridgeServer {
  port: number;
  close: () => Promise<void>;
}

/** In-process HTTP server for sandbox → platform ctx RPC (mock E2B / local dev). */
export function startBridgeServer(
  registry: BridgeRegistry,
  secret: string,
  port = 0,
): Promise<BridgeServer> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer(async (nodeReq, nodeRes) => {
      const host = nodeReq.headers.host ?? "127.0.0.1";
      const url = `http://${host}${nodeReq.url ?? "/"}`;
      const chunks: Buffer[] = [];
      nodeReq.on("data", (c) => chunks.push(c));
      nodeReq.on("end", async () => {
        const body = Buffer.concat(chunks);
        const headers = new Headers();
        for (const [k, v] of Object.entries(nodeReq.headers)) {
          if (v) headers.set(k, Array.isArray(v) ? v.join(", ") : v);
        }
        const init: RequestInit = {
          method: nodeReq.method,
          headers,
        };
        if (body.length && nodeReq.method !== "GET" && nodeReq.method !== "HEAD") {
          init.body = body;
        }
        const req = new Request(url, init);
        const res = await handleBridgeRequest(registry, secret, req);
        nodeRes.statusCode = res.status;
        res.headers.forEach((value, key) => nodeRes.setHeader(key, value));
        const buf = Buffer.from(await res.arrayBuffer());
        nodeRes.end(buf);
      });
    });

    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const resolvedPort = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: resolvedPort,
        close: () =>
          new Promise((res, rej) => server.close((err) => (err ? rej(err) : res()))),
      });
    });
  });
}
