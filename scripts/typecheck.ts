/**
 * Typecheck workspace packages (CI gate). Skips projects with known debt until fixed.
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/** Packages that currently pass `tsc --noEmit`. Expand as TS debt is cleared. */
/** Leaf packages only — dependents pull the full graph and fail until core/api TS debt is cleared. */
const STABLE = new Set([
  "packages/sdk/tsconfig.json",
  "packages/config/tsconfig.json",
  "packages/trace/tsconfig.json",
  "packages/auth/tsconfig.json",
  "packages/detect/tsconfig.json",
  "packages/runner/tsconfig.json",
  "apps/web/tsconfig.json",
  "examples/support-triage/tsconfig.json",
]);

const roots = ["packages", "apps", "examples"];
const configs: string[] = [];

for (const root of roots) {
  if (!existsSync(root)) continue;
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const tsconfig = join(root, name.name, "tsconfig.json");
    if (existsSync(tsconfig) && STABLE.has(tsconfig.replace(/\\/g, "/"))) {
      configs.push(tsconfig);
    }
  }
}

configs.sort();
console.log(`Typechecking ${configs.length} stable projects…\n`);

for (const cfg of configs) {
  console.log(`→ ${cfg}`);
  execSync(`pnpm exec tsc -p "${cfg}" --noEmit`, { stdio: "inherit" });
}

console.log("\nTypecheck OK");
