import "dotenv/config";
import { GitHubProvider } from "./providers/GitHubProvider.js";

/**
 * Entry point placeholder. Phase 1 goal: prove that the Control Room can
 * read Bip's repo through the provider-agnostic interface, with zero
 * GitHub-specific code outside providers/GitHubProvider.ts.
 *
 * This intentionally does nothing fancy yet — Mission Engine, Approval
 * Engine, and Change Proposal endpoints come next, once this adapter is
 * proven against the real repo.
 */
async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.log(
      "GITHUB_TOKEN not set — skipping live check. Copy .env.example to .env and fill it in."
    );
    return;
  }

  const provider = new GitHubProvider({
    token,
    projectMap: {
      "sekret-bip": "jussray/Sekret-Bip",
    },
  });

  const project = await provider.getProject("sekret-bip");
  console.log("RepositoryProvider check:", project);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
