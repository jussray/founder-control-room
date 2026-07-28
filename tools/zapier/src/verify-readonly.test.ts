import assert from "node:assert/strict";
import test from "node:test";
import {
  buildReadonlySummary,
  classifyFailure,
} from "./verify-readonly.js";

test("redacts connection and profile details from the summary", () => {
  const summary = buildReadonlySummary(
    [
      {
        slug: "github",
        key: "GitHubCLIAPI",
        title: "GitHub",
      },
    ],
    [
      {
        id: "connection-secret-123",
        title: "personal@example.com",
        label: "Private GitHub account",
        app_key: "GitHubCLIAPI",
        is_expired: "false",
      },
      {
        id: "connection-secret-456",
        title: "company@example.com",
        app_key: "HubSpotCLIAPI",
        is_expired: "true",
      },
    ],
  );

  const output = JSON.stringify(summary);

  assert.equal(summary.authenticated, true);
  assert.equal(summary.connectionsObserved, 2);
  assert.equal(summary.expiredConnectionsObserved, 1);
  assert.deepEqual(summary.appKeys, ["GitHubCLIAPI", "HubSpotCLIAPI", "github"]);
  assert.equal(output.includes("connection-secret"), false);
  assert.equal(output.includes("example.com"), false);
  assert.equal(output.includes("Private GitHub account"), false);
});

test("uses safe failure classifications instead of raw provider errors", () => {
  assert.equal(
    classifyFailure(new Error("401 Unauthorized: login required for ray@example.com")),
    "authentication_required",
  );
  assert.equal(
    classifyFailure(new Error("ECONNRESET while fetching provider response")),
    "network_failure",
  );
  assert.equal(
    classifyFailure(new Error("unexpected provider detail")),
    "verification_failed",
  );
});
