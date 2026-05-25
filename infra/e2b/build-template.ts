/**
 * Optional: build a custom E2B template with Node + tsx.
 * Run: E2B_API_KEY=e2b_... pnpm exec tsx infra/e2b/build-template.ts
 */
const alias = process.env.E2B_TEMPLATE_ALIAS ?? "agentd-agent";

async function main() {
  const apiKey = process.env.E2B_API_KEY;
  if (!apiKey) {
    console.error("Set E2B_API_KEY to build a template");
    process.exit(1);
  }

  const { Template } = await import("e2b");
  const template = Template()
    .fromBaseImage()
    .setWorkdir("/home/user")
    .runCmd("npm install -g tsx")
    .setStartCmd("sleep infinity");

  const built = await Template.build(template, {
    alias,
    apiKey,
    cpuCount: 2,
    memoryMB: 1024,
  });

  console.log(`Template built: ${built.templateId} (alias: ${alias})`);
  console.log(`Set E2B_TEMPLATE_ID=${alias} in production`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
