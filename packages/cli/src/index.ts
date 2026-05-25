#!/usr/bin/env node
/** Developer deploy CLI: `platform deploy`. Detects the framework, then triggers a deploy. */
import { detectFrameworkInfo } from "@platform/detect";
import { planFrameworkImport } from "@platform/build";

const BASE = process.env.PLATFORM_BASE_URL ?? "http://localhost:8787";

async function deploy(dir: string) {
  const info = await detectFrameworkInfo(dir);
  const plan = await planFrameworkImport(dir);
  console.log(`detected framework: ${info.framework}`);
  if (plan && info.framework !== "convention") {
    console.log(`import adapter: ${plan.framework} → entry ${plan.entryPath}`);
  }
  const apiKey = process.env.PLATFORM_API_KEY ?? process.env.API_KEY ?? "dev";
  const res = await fetch(`${BASE}/v1/deploy`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ projectDir: dir, dir, framework: info.framework }),
  });
  const text = await res.text();
  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
    if (json.urls?.playground) console.log(`\n→ Playground: ${json.urls.playground}`);
  } catch {
    console.log(text);
  }
}

const [cmd, ...args] = process.argv.slice(2);
if (cmd === "deploy") void deploy(args[0] ?? process.cwd());
else console.error("usage: platform deploy [dir]");
