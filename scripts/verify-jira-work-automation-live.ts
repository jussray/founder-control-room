import type { JiraWorkAutomationInput } from '../src/lib/jiraWorkAutomation.js';
import { runJiraWorkAutomationLiveProbe } from '../src/lib/jiraWorkAutomationLiveProbe.js';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

let observation: JiraWorkAutomationInput;
try {
  observation = JSON.parse(required('JIRA_AUTOMATION_PROBE_OBSERVATION_JSON')) as JiraWorkAutomationInput;
} catch (error) {
  throw new Error(`JIRA_AUTOMATION_PROBE_OBSERVATION_JSON must be valid JSON: ${error instanceof Error ? error.message : 'parse failed'}`);
}

const receipt = await runJiraWorkAutomationLiveProbe({
  expectedHeadSha: required('JIRA_AUTOMATION_PROBE_HEAD_SHA'),
  probeIssueKey: required('JIRA_AUTOMATION_PROBE_ISSUE_KEY'),
  ingressUrl: required('FCR_JIRA_AUTOMATION_INGRESS_URL'),
  ingressToken: required('FCR_JIRA_AUTOMATION_INGRESS_TOKEN'),
  approvalReference: required('JIRA_AUTOMATION_PROBE_APPROVAL_REFERENCE'),
  observation,
});

process.stdout.write(`${JSON.stringify(receipt, null, 2)}\n`);
