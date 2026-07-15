import { describe, expect, it } from "vitest";
import { sanitizeGitHubEvent } from "./githubEventSanitizer.js";

const repository = {
  id: 123,
  full_name: "founder/example",
  private: true,
  default_branch: "main",
  archived: false,
  owner: { login: "private-owner", email: "owner@example.com" },
};

describe("GitHub event sanitizer", () => {
  it("keeps push identity and commit SHAs but drops messages, authors, emails, and sender", () => {
    const result = sanitizeGitHubEvent("push", {
      repository,
      ref: "refs/heads/main",
      before: "a".repeat(40),
      after: "b".repeat(40),
      commits: [{
        id: "c".repeat(40),
        message: "private roadmap detail",
        author: { name: "Founder Name", email: "founder@example.com" },
        committer: { name: "Builder", email: "builder@example.com" },
      }],
      sender: { login: "founder", email: "founder@example.com" },
    });

    const encoded = JSON.stringify(result);
    expect(result).toMatchObject({
      repository: { id: 123, full_name: "founder/example", private: true },
      push: {
        ref: "refs/heads/main",
        before: "a".repeat(40),
        after: "b".repeat(40),
        commit_ids: ["c".repeat(40)],
      },
    });
    expect(encoded).not.toContain("private roadmap detail");
    expect(encoded).not.toContain("Founder Name");
    expect(encoded).not.toContain("founder@example.com");
    expect(encoded).not.toContain("private-owner");
  });

  it("keeps pull request refs and stats but drops title, body, comments, and people", () => {
    const result = sanitizeGitHubEvent("pull_request", {
      action: "opened",
      repository,
      pull_request: {
        number: 42,
        title: "Secret acquisition plan",
        body: "Customer details and private strategy",
        state: "open",
        draft: true,
        merged: false,
        mergeable: true,
        additions: 12,
        deletions: 3,
        changed_files: 2,
        base: { ref: "main", sha: "a".repeat(40) },
        head: { ref: "feature", sha: "b".repeat(40) },
        user: { login: "founder", email: "founder@example.com" },
        requested_reviewers: [{ login: "reviewer" }],
        html_url: "https://github.com/founder/example/pull/42?token=private#discussion",
      },
      sender: { login: "founder" },
    });

    const encoded = JSON.stringify(result);
    expect(result).toMatchObject({
      action: "opened",
      pull_request: {
        number: 42,
        state: "open",
        draft: true,
        base_ref: "main",
        head_ref: "feature",
        additions: 12,
        deletions: 3,
        changed_files: 2,
        html_url: "https://github.com/founder/example/pull/42",
      },
    });
    expect(encoded).not.toContain("Secret acquisition plan");
    expect(encoded).not.toContain("Customer details");
    expect(encoded).not.toContain("founder@example.com");
    expect(encoded).not.toContain("reviewer");
    expect(encoded).not.toContain("token=private");
  });

  it("retains workflow proof fields while removing unknown nested payloads", () => {
    const result = sanitizeGitHubEvent("workflow_run", {
      repository,
      workflow_run: {
        id: 9001,
        name: "Quality Gate",
        event: "pull_request",
        status: "completed",
        conclusion: "failure",
        head_branch: "feature",
        head_sha: "d".repeat(40),
        run_number: 77,
        html_url: "https://github.com/founder/example/actions/runs/9001?check_suite_focus=true",
        triggering_actor: { login: "private-person" },
        head_commit: { message: "secret message", author: { email: "private@example.com" } },
      },
    });

    const encoded = JSON.stringify(result);
    expect(result).toMatchObject({
      workflow_run: {
        id: 9001,
        name: "Quality Gate",
        status: "completed",
        conclusion: "failure",
        head_sha: "d".repeat(40),
        html_url: "https://github.com/founder/example/actions/runs/9001",
      },
    });
    expect(encoded).not.toContain("private-person");
    expect(encoded).not.toContain("secret message");
    expect(encoded).not.toContain("private@example.com");
  });

  it("rejects non-HTTPS evidence URLs", () => {
    const result = sanitizeGitHubEvent("check_run", {
      repository,
      check_run: {
        id: 5,
        name: "Typecheck",
        status: "completed",
        conclusion: "success",
        head_sha: "e".repeat(40),
        details_url: "http://localhost/private?token=secret",
      },
    });

    expect(result).toMatchObject({
      check_run: { id: 5, name: "Typecheck", details_url: null },
    });
  });
});
