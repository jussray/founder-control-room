import { readFile } from "node:fs/promises";

const files = {
  registry: await readFile(new URL("../src/design-os/registry.ts", import.meta.url), "utf8"),
  types: await readFile(new URL("../src/design-os/types.ts", import.meta.url), "utf8"),
  route: await readFile(new URL("../src/http/routes/designOs.ts", import.meta.url), "utf8"),
  server: await readFile(new URL("../src/http/server.ts", import.meta.url), "utf8"),
  packageJson: await readFile(new URL("../package.json", import.meta.url), "utf8"),
};

const errors = [];

function requireFragment(file, label, fragment) {
  if (!files[file].includes(fragment)) {
    errors.push(`${label}: missing ${JSON.stringify(fragment)}`);
  }
}

const repositories = [
  "jussray/founder-control-room",
  "jussray/Sekret-Bip",
  "jussray/l99-StoryEngine",
  "jussray/chief-ai-machine",
  "jussray/jussbeautifulhair-site",
  "jussray/untold-stories-storefront",
  "jussray/jbh-private",
];

for (const repository of repositories) {
  requireFragment("registry", "portfolio coverage", repository);
}

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
requireFragment("server", "server mount", "app.use('/design-os', designOsRouter)");
requireFragment("packageJson", "focused verification command", '"verify:design-os"');

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
console.log(`Repositories covered: ${repositories.length}`);
console.log("Write routes: 0");
console.log("Embedded credential patterns: 0");
