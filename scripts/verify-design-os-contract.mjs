import { readFile } from "node:fs/promises";

const files = {
  workflow: await readFile(new URL("../.github/workflows/design-os-contract.yml", import.meta.url), "utf8"),
  registry: await readFile(new URL("../src/design-os/registry.ts", import.meta.url), "utf8"),
  commands: await readFile(new URL("../src/design-os/commands.ts", import.meta.url), "utf8"),
  l99Repository: await readFile(new URL("../src/config/l99Repository.ts", import.meta.url), "utf8"),
  types: await readFile(new URL("../src/design-os/types.ts", import.meta.url), "utf8"),
  route: await readFile(new URL("../src/http/routes/designOs.ts", import.meta.url), "utf8"),
  server: await readFile(new URL("../src/http/server.ts", import.meta.url), "utf8"),
  skillRouter: await readFile(new URL("../src/lib/fcrSkillRouter.ts", import.meta.url), "utf8"),
  designSkill: await readFile(new URL("../.agents/skills/control-room-design-implementation/SKILL.md", import.meta.url), "utf8"),
  controlRoom: await readFile(new URL("../public/control-room/index.html", import.meta.url), "utf8"),
  commandPage: await readFile(new URL("../public/control-room/design-commands.html", import.meta.url), "utf8"),
  playwrightProof: await readFile(new URL("../e2e/design-commands-proof.ts", import.meta.url), "utf8"),
  packageJson: await readFile(new URL("../package.json", import.meta.url), "utf8"),
};

const errors = [];

function requireFragment(file, label, fragment) {
  if (!files[file].includes(fragment)) {
    errors.push(`${label}: missing ${JSON.stringify(fragment)}`);
  }
}

const registryRepositories = [
  "jussray/founder-control-room",
  "jussray/Sekret-Bip",
  "jussray/chief-ai-machine",
  "jussray/jussbeautifulhair-site",
  "jussray/untold-stories-storefront",
  "jussray/jbh-private",
];

const designCommandIds = [
  "intent",
  "critique",
  "hierarchy",
  "flow",
  "information",
  "copy",
  "typeset",
  "layout",
  "spacing",
  "color",
  "components",
  "states",
  "forms",
  "responsive",
  "touch",
  "accessibility",
  "motion",
  "feedback",
  "empty",
  "recovery",
  "brand",
  "polish",
  "prove",
];

for (const repository of registryRepositories) {
  requireFragment("registry", "portfolio coverage", repository);
}
requireFragment(
  "l99Repository",
  "StoryEngine canonical repository",
  'L99_REPOSITORY_IDENTIFIER = "jussray/StoryEngine"',
);
requireFragment(
  "registry",
  "StoryEngine canonical repository usage",
  "repoIdentifier: L99_REPOSITORY_IDENTIFIER",
);
requireFragment(
  "registry",
  "StoryEngine canonical PR URL",
  "`https://github.com/${L99_REPOSITORY_IDENTIFIER}/pull/28`",
);

requireFragment("workflow", "supported Node runtime", "node-version: 24");
requireFragment("registry", "Command Center registration", "QevLkXHXSzXfEsqsZltGRJ");
requireFragment("registry", "design/runtime separation", "designIsNotRuntimeProof: true");
requireFragment(
  "registry",
  "approval/implementation separation",
  "approvalDoesNotAuthorizeImplementation: true",
);
requireFragment(
  "registry",
  "implementation/deployment separation",
  "implementationDoesNotAuthorizeDeployment: true",
);
requireFragment("registry", "sanitized fixture boundary", "syntheticOrSanitizedDataOnly: true");
requireFragment("registry", "exact-head evidence gate", 'reference.kind === "exact_head"');
requireFragment("registry", "deployment evidence gate", 'reference.kind === "deployment_observation"');
requireFragment("registry", "Code Connect evidence count", "codeConnectMappings");
requireFragment("route", "founder authentication", "designOsRouter.use(requireFounder)");
requireFragment("route", "unknown-project failure", "DESIGN_OS_PROJECT_NOT_FOUND");
requireFragment("route", "command deck response", "commands: DESIGN_COMMANDS");
requireFragment("route", "unknown-command failure", "DESIGN_COMMAND_NOT_FOUND");
requireFragment("server", "server mount", "app.use('/design-os', designOsRouter)");
requireFragment("packageJson", "focused verification command", '"verify:design-os"');

requireFragment("commands", "design command contract", 'juss/design-command-deck@v1');
requireFragment("commands", "shared design capability", 'control-room-design-implementation');
for (const commandId of designCommandIds) {
  requireFragment("commands", `design command /${commandId}`, `"${commandId}"`);
  requireFragment("designSkill", `skill command /${commandId}`, `\`/${commandId}\``);
}
requireFragment("skillRouter", "command router source", "DESIGN_COMMANDS");
requireFragment("skillRouter", "shared command capability routing", "DESIGN_COMMAND_SHARED_CAPABILITY");
requireFragment("controlRoom", "Projects Control Room design-command entry", "data-project-design-commands");
requireFragment("controlRoom", "Projects Control Room design-command href", '/control-room/design-commands.html');
requireFragment("commandPage", "project command control room title", "23 design commands");
requireFragment("commandPage", "read-only Design OS loading", "fetch('/design-os'");
requireFragment("commandPage", "prepared bounded handoff", "Prepare command");
requireFragment("commandPage", "project query binding", "URLSearchParams(window.location.search).get('project')");
requireFragment("playwrightProof", "Projects Control Room Playwright entry proof", "data-project-design-commands");
requireFragment("playwrightProof", "desktop browser proof", "width: 1440");
requireFragment("playwrightProof", "mobile browser proof", "width: 390");
requireFragment("playwrightProof", "exact command count proof", "count() === 23");
requireFragment("workflow", "Playwright Chromium install", "playwright install --with-deps chromium");
requireFragment("workflow", "Design Commands Playwright proof", "e2e/design-commands-proof.ts");

for (const writeMethod of [".post(", ".put(", ".patch(", ".delete("]) {
  if (files.route.includes(writeMethod)) {
    errors.push(`read-only route contract: unexpected write method ${writeMethod}`);
  }
}

const combined = Object.values(files).join("\n");
for (const forbiddenPattern of [
  /sk-[A-Za-z0-9_-]{12,}/,
  /service_role\s*[:=]\s*["'][^"']+/i,
  /Bearer\s+[A-Za-z0-9._-]{20,}/,
]) {
  if (forbiddenPattern.test(combined)) {
    errors.push(`credential boundary: matched forbidden pattern ${forbiddenPattern}`);
  }
}

if (errors.length > 0) {
  console.error("Portfolio Design OS contract verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log("Portfolio Design OS contract verified.");
console.log(`Repositories covered: ${registryRepositories.length + 1}`);
console.log(`Design commands: ${designCommandIds.length}`);
console.log("Shared design capabilities: 1");
console.log("Project Control Room entry points: 1");
console.log("Node runtime: 24");
console.log("Write routes: 0");
console.log("Embedded credential patterns: 0");
