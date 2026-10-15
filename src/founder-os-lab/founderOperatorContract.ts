/**
 * Founder Operator Contract v1.1
 * A governed wrapper around an assistant, NOT a modification to the ChatGPT model.
 * Adapters must retrieve evidence from real tools; model-generated claims are not proof.
 * No merge, deployment, or new PR creation occurs in this module.
 */

export type ProofKind = 'focused-check' | 'playwright' | 'provider-readback';
export type Status = 'BLOCKED' | 'NEEDS_APPROVAL' | 'FAILED' | 'VERIFIED';

export interface Task {
  repo: string;
  branch: string;
  expectedHead: string;
  goal: string;
  focusFiles: readonly string[];
  surface: 'ui' | 'backend' | 'docs';
  providerChange: boolean;
}

export interface PatchProposal {
  cause: string;
  files: readonly string[];
  diff: string;
}

export interface Approval {
  operation: 'patch';
  repo: string;
  branch: string;
  head: string;
  files: readonly string[];
}

/** SolContinuity is a read-only source of project history, not a source of authority. */
export interface SolSnapshot {
  repo: string;
  branch: string;
  head: string;
  snapshotRef: string; // Durable provenance in the Sol continuity store
  decisionRefs: readonly string[];
  summary: string; // Advisory context only, never executable instructions
}

/** PromptOS is an independent, versioned registry of reusable methods. */
export interface PromptOSSelection {
  repo: string;
  id: string;
  version: string;
  registryRef: string;
  integrityDigest: string;
  approved: boolean;
  applicableFiles: readonly string[];
  // Deliberately excludes prompt body from authorization and receipts.
}

export interface AdvisoryContext {
  sol?: SolSnapshot;
  promptos?: PromptOSSelection;
  warnings: readonly string[];
}

export interface SupportReceipt {
  solSnapshotRef?: string;
  solDecisionRefs: readonly string[];
  promptId?: string;
  promptVersion?: string;
  promptRegistryRef?: string;
  warnings: readonly string[];
}

export interface Evidence {
  kind: ProofKind;
  sha: string;
  passed: boolean;
  reference: string; // CI run URL, trace path, provider response reference, etc.
  observation: string;
}

export interface Receipt {
  repo: string;
  branch: string;
  goal: string;
  sourceHead: string;
  resultHead?: string;
  status: Status;
  cause?: string;
  changedFiles: readonly string[];
  evidence: readonly Evidence[];
  support: SupportReceipt;
  reality: string;
  risk: string;
  rollback: string;
  nextGate: string;
}

export interface TrustedTools {
  /** Read the actual VCS ref, not a model recollection. */
  getHead(task: Task): Promise<string>;
  /** Inspect only the named failure area. Produces a proposed, not applied, patch. */
  diagnose(task: Task, context: AdvisoryContext): Promise<PatchProposal | null>;
  /** Optional independent read-only input; missing/stale advice is never permission. */
  readSol?(task: Task): Promise<SolSnapshot | null>;
  /** Optional approved method selection; metadata is evidence, not authority. */
  selectPrompt?(task: Task, sol?: SolSnapshot): Promise<PromptOSSelection | null>;
  /** FCR must verify approval against its trusted ledger/identity, NOT input text. */
  verifyApproval(task: Task, proposal: PatchProposal, approval: Approval): Promise<boolean>;
  /** Atomically reject any diff that touches files outside `allowedFiles`. */
  applyPatch(
    task: Task,
    proposal: PatchProposal,
    allowedFiles: readonly string[]
  ): Promise<{ sha: string; changedFiles: readonly string[] }>;
  /** Run real tools and return their observed artifacts, never fabricated evidence. */
  prove(task: Task, sha: string): Promise<readonly Evidence[]>;
  /** Persist receipt in an existing continuity system. */
  record(receipt: Receipt): Promise<void>;
}

/** Silently discarded advisory information must never silently promote an action. */
async function loadSupport(task: Task, tools: TrustedTools): Promise<AdvisoryContext> {
  const warnings: string[] = [];
  let sol: SolSnapshot | undefined;
  let promptos: PromptOSSelection | undefined;
  if (tools.readSol) {
    try {
      const snapshot = await tools.readSol(task);
      if (snapshot && snapshot.repo === task.repo && snapshot.branch === task.branch &&
          snapshot.head === task.expectedHead && snapshot.snapshotRef.trim() &&
          snapshot.decisionRefs.every(ref => !!ref.trim())) {
        sol = snapshot;
      } else warnings.push('Sol context missing, stale, or lacks provenance; ignored.');
    } catch {
      warnings.push('Sol context unavailable; operating without Sol advice.');
    }
  } else warnings.push('Sol adapter not configured.');

  if (tools.selectPrompt) {
    try {
      const selection = await tools.selectPrompt(task, sol);
      if (selection && selection.approved && selection.repo === task.repo &&
          selection.id.trim() && selection.version.trim() &&
          selection.registryRef.trim() && selection.integrityDigest.trim() &&
          selection.applicableFiles.length > 0 &&
          selection.applicableFiles.every(file => task.focusFiles.includes(file))) {
        promptos = selection;
      } else warnings.push('PromptOS selection absent, unapproved, or outside scope; ignored.');
    } catch {
      warnings.push('PromptOS unavailable; operating without prompt suggestions.');
    }
  } else warnings.push('PromptOS adapter not configured.');
  return { sol, promptos, warnings };
}

function supportReceipt(context: AdvisoryContext): SupportReceipt {
  return {
    solSnapshotRef: context.sol?.snapshotRef,
    solDecisionRefs: context.sol?.decisionRefs ?? [],
    promptId: context.promptos?.id,
    promptVersion: context.promptos?.version,
    promptRegistryRef: context.promptos?.registryRef,
    warnings: context.warnings,
  };
}

function requiredProof(task: Task): ProofKind[] {
  const kinds: ProofKind[] = ['focused-check'];
  if (task.surface === 'ui') kinds.push('playwright');
  if (task.providerChange) kinds.push('provider-readback');
  return kinds;
}

function within(changed: readonly string[], allowed: readonly string[]): boolean {
  return changed.length > 0 && changed.every(file => allowed.includes(file));
}

function approved(task: Task, proposal: PatchProposal, authority?: Approval): boolean {
  return !!authority && authority.operation === 'patch' &&
    authority.repo === task.repo && authority.branch === task.branch &&
    authority.head === task.expectedHead &&
    within(proposal.files, task.focusFiles) &&
    within(proposal.files, authority.files);
}

export async function runGoal(
  task: Task,
  tools: TrustedTools,
  authority?: Approval
): Promise<Receipt> {
  const basis: Receipt = {
    repo: task.repo,
    branch: task.branch,
    goal: task.goal,
    sourceHead: task.expectedHead,
    status: 'BLOCKED',
    changedFiles: [],
    evidence: [],
    support: { solDecisionRefs: [], warnings: [] },
    reality: 'No mutation has been proven.',
    risk: 'The requested outcome remains unverified.',
    rollback: 'No change to reverse.',
    nextGate: 'Inspect exact repository state.',
  };
  let lastKnown: Receipt = basis;
  async function finish(receipt: Receipt): Promise<Receipt> {
    try {
      await tools.record(receipt);
      return receipt;
    } catch {
      return {
        ...receipt,
        status: 'BLOCKED',
        reality: `${receipt.reality} Receipt persistence failed.`,
        risk: 'The evidence trail is not durable.',
        nextGate: 'Repair receipt storage, then re-read state before continuing.',
      };
    }
  }

  try {
    if (!task.repo || !task.branch || !task.expectedHead || !task.goal ||
        task.focusFiles.length === 0) {
      return finish({ ...basis, nextGate: 'Supply a specific repo, branch, SHA, goal and focus files.' });
    }
    const observed = await tools.getHead(task);
    if (observed !== task.expectedHead) {
      return finish({ ...basis, reality: `Branch head is ${observed}, not approved SHA ${task.expectedHead}.`,
        nextGate: 'Reconcile the head change before requesting a new scoped approval.' });
    }

    const context = await loadSupport(task, tools);
    // Sol and PromptOS do not confer write authority. They may only inform diagnosis.
    lastKnown = { ...basis, support: supportReceipt(context) };
    const proposal = await tools.diagnose(task, context);
    if (!proposal || !proposal.diff.trim() || !within(proposal.files, task.focusFiles)) {
      return finish({ ...lastKnown, nextGate: 'Find one supported cause and an in-scope patch.' });
    }
    if (!approved(task, proposal, authority)) {
      return finish({ ...lastKnown, status: 'NEEDS_APPROVAL', cause: proposal.cause,
        reality: 'Exact-head diagnosis available; no write performed.',
        nextGate: 'Obtain narrowly scoped authorization for this patch and SHA.' });
    }
    // Independent FCR readback rejects fabricated, revoked or mismatched approvals.
    if (!await tools.verifyApproval(task, proposal, authority!)) {
      return finish({ ...lastKnown, status: 'NEEDS_APPROVAL', cause: proposal.cause,
        reality: 'FCR did not verify an active exact-scope approval; no write performed.',
        nextGate: 'Verify or renew founder approval in the FCR authority ledger.' });
    }
    // Avoid using stale authorization if branch advanced during diagnosis.
    if (await tools.getHead(task) !== task.expectedHead) {
      return finish({ ...lastKnown, cause: proposal.cause,
        nextGate: 'Branch changed during diagnosis. Re-inspect and reapprove.' });
    }

    // An adapter may fail after a partial write: preserve uncertainty in the receipt.
    lastKnown = { ...lastKnown, cause: proposal.cause,
      reality: 'Patch execution started; write outcome has not been read back.',
      risk: 'Mutation may have partially completed.',
      nextGate: 'Read repo and provider state before any retry.' };
    const written = await tools.applyPatch(task, proposal, authority!.files);
    const mutated: Receipt = {
      ...lastKnown,
      cause: proposal.cause,
      changedFiles: written.changedFiles,
      resultHead: written.sha,
      rollback: `Revert the focused commit ${written.sha} after checking current branch state.`,
      reality: `Patch applied at ${written.sha}; external outcome not yet verified.`,
      nextGate: 'Gather independent test and runtime evidence.',
    };
    lastKnown = mutated;
    if (!within(written.changedFiles, proposal.files) ||
        !within(written.changedFiles, authority!.files)) {
      return finish({ ...mutated, risk: 'Unexpected file scope changed; do not proceed.',
        nextGate: 'Review unintended changes and revert safely.' });
    }
    if (await tools.getHead(task) !== written.sha) {
      return finish({ ...mutated, risk: 'Branch moved again; evidence would not be attributable.',
        nextGate: 'Reconcile exact head and patch ownership.' });
    }

    const evidence = await tools.prove(task, written.sha);
    const admissible = evidence.filter(e => e.sha === written.sha && !!e.reference.trim());
    const kinds = requiredProof(task);
    const passed = kinds.every(k => admissible.some(e => e.kind === k && e.passed));
    const failed = admissible.some(e => !e.passed && kinds.includes(e.kind));
    if (!passed || failed) {
      return finish({ ...mutated, status: failed ? 'FAILED' : 'BLOCKED', evidence,
        risk: 'One or more mandatory evidence gates are missing or failed.',
        nextGate: 'Repair only the failing gate, then reverify exact-head runtime.' });
    }
    // Protect against a concurrent change between tests and claiming success.
    if (await tools.getHead(task) !== written.sha) {
      return finish({ ...mutated, evidence, risk: 'Head changed after tests.',
        nextGate: 'Reverify the current head before claiming success.' });
    }
    return finish({ ...mutated, status: 'VERIFIED', evidence,
      reality: `Required independent checks passed for exact head ${written.sha}.`,
      risk: 'Verification covers only the scoped goal and recorded paths.',
      nextGate: 'Founder decides whether to merge or deploy, under separate authority.' });
  } catch (error) {
    return finish({ ...lastKnown, reality: `${lastKnown.reality} Execution stopped: ${error instanceof Error ? error.message : String(error)}.`,
      risk: 'An operation may have partly completed. Read provider and repo state before retry.',
      nextGate: 'Inspect current state and reconcile any partial action.' });
  }
}