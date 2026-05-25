/**
 * Typecheck all workspace packages that define tsconfig.json (CI gate).
 */
import { execSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const roots = ["packages", "apps", "examples"];
const configs: string[] = [];

for (const root of roots) {
  if (!existsSync(root)) continue;
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const tsconfig = join(root, name.name, "tsconfig.json");
    if (existsSync(tsconfig)) configs.push(tsconfig);
  }
}

configs.sort();
console.log(`Typechecking ${configs.length} projects…\n`);

for (const cfg of configs) {
  console.log(`→ ${cfg}`);
  execSync(`pnpm exec tsc -p "${cfg}" --noEmit`, { stdio: "inherit" });
}

console.log("\nTypecheck OK");
