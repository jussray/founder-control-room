/**
 * Founder Operator Contract v1.1
 * A governed wrapper around an assistant, NOT a modification to the ChatGPT model.
 * Adapters must retrieve evidence from real tools; model-generated claims are not proof.
 * No merge, deployment, or new PR creation occurs in this module.
 */

import { createHash } from 'node:crypto';

export type ProofKind = 'focused-check' | 'playwright' | 'provider-readback' | 'documentation-truth';
export type Status = 'BLOCKED' | 'NEEDS_APPROVAL' | 'FAILED' | 'VERIFIED';

export interface Task {
  repo: string;
  branch: string;
  expectedHead: string;
  goal: string;
  focusFiles: readonly string[];
  surface: 'ui' | 'backend' | 'docs';
  providerChange: boolean;
  /** Exact external destination, when requesting a provider mutation. */
  providerTarget?: string;
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
  approvalId: string;
  proposalHash: string;
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
  promptIntegrityDigest?: string;
  warnings: readonly string[];
}

export interface Evidence {
  kind: ProofKind;
  sha: string;
  passed: boolean;
  reference: string; // CI run URL, trace path, provider response reference, etc.
  observation: string;
  observedAt: string;
  target?: string;
  revision?: string;
}

export interface Receipt {
  repo: string;
  branch: string;
  goal: string;
  sourceHead: string;
  resultHead?: string;
  proposalHash?: string;
  reservationId?: string;
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
  /** Trusted timestamp source: model text and ambient lab wall clock are never authoritative. */
  getTrustedTime(task: Task): Promise<string>;
  /** Trusted repository protection lookup. Fail closed on an unreadable ref. */
  isProtectedBranch(task: Task): Promise<boolean>;
  /** A trusted classification of the actual patch, independent of caller labels. */
  classify(task: Task, proposal: PatchProposal): Promise<{ surface: Task['surface']; providerTarget?: string; documentationTruth?: boolean }>;
  /** Persist an idempotent PENDING execution receipt BEFORE any write. */
  reserve(task: Task, proposal: PatchProposal, approval: Approval): Promise<string>;
  /** Read immutable Git commit identity after applying the patch. */
  inspectCommit(task: Task, sha: string): Promise<{ parentSha: string; changedFiles: readonly string[] }>;
  /** FCR must verify approval against its trusted ledger/identity, NOT input text. */
  verifyApproval(task: Task, proposal: PatchProposal, approval: Approval): Promise<boolean>;
  /** Atomically reject any diff that touches files outside `allowedFiles`. */
  applyPatch(
    task: Task,
    proposal: PatchProposal,
    allowedFiles: readonly string[],
    expectedHead: string,
    approval: Approval,
    reservationId: string
    // The trusted FCR adapter MUST atomically revalidate/consume active approval,
    // match the proposal digest, and compare-and-swap the expected ref before commit.
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
    promptIntegrityDigest: context.promptos?.integrityDigest,
    warnings: context.warnings,
  };
}

function canonicalFile(file: string): boolean {
  return file.length > 0 && file.length <= 300 && !file.startsWith('/') &&
    !file.includes(String.fromCharCode(92)) && !file.includes(String.fromCharCode(0)) &&
    !file.includes('//') && file.split('/').every(segment => segment !== '.' && segment !== '..' && !!segment) &&
    !/^[A-Za-z]:/.test(file);
}

function requiredProof(task: Task, proposal: PatchProposal, classified: { surface: Task['surface']; providerTarget?: string; documentationTruth?: boolean }): ProofKind[] {
  const kinds = new Set<ProofKind>(['focused-check']);
  if (task.surface === 'ui' || classified.surface === 'ui' ||
      proposal.files.some(file => ['tsx', 'jsx', 'css', 'html'].includes(file.split('.').at(-1) ?? ''))) kinds.add('playwright');
  if (task.providerChange || classified.providerTarget) kinds.add('provider-readback');
  if (classified.documentationTruth || task.surface === 'docs' ||
      proposal.files.some(file => file === 'README.md' || file.startsWith('docs/') ||
        file === 'AGENTS.md' || file === 'GLOBAL_AI.md')) kinds.add('documentation-truth');
  return [...kinds];
}

function within(changed: readonly string[], allowed: readonly string[]): boolean {
  return changed.length > 0 && new Set(changed).size === changed.length && changed.every(file => canonicalFile(file) && allowed.includes(file));
}

export function proposalDigest(task: Task, proposal: PatchProposal): string {
  return createHash('sha256').update(JSON.stringify([task.repo, task.branch, task.expectedHead, [...proposal.files].sort(), proposal.diff])).digest('hex');
}

function approved(task: Task, proposal: PatchProposal, authority?: Approval): boolean {
  return !!authority && authority.operation === 'patch' &&
    authority.repo === task.repo && authority.branch === task.branch &&
    authority.head === task.expectedHead &&
    authority.approvalId.trim().length > 0 && authority.proposalHash === proposalDigest(task, proposal) &&
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
  let lastKnown = basis;
  async function finish(receipt: Receipt): Promise<Receipt> {
    try {
      await tools.record(receipt);
      return receipt;
    } catch {
      return {
        ...receipt,
        status: 'BLOCKED',
        reality: 'Receipt finalization failed; inspect reserved execution before retry.',
        risk: 'The final evidence trail is not durable; a pending reservation may exist.',
        nextGate: 'Repair receipt storage and reconcile VCS state before any retry.',
      };
    }
  }
  try {
    if (!task.repo || !task.branch || !/^[0-9a-f]{40}$/.test(task.expectedHead) ||
        !task.goal.trim() || !task.focusFiles.length ||
        task.focusFiles.some(f => !canonicalFile(f)) ||
        new Set(task.focusFiles).size !== task.focusFiles.length) {
      return finish({ ...basis, nextGate: 'Supply a canonical repository-relative scope and exact SHA.' });
    }
    if (task.branch === 'main' || task.branch === 'master' || await tools.isProtectedBranch(task)) {
      return finish({ ...basis, reality: 'Protected branches require the existing PR merge membrane.',
        nextGate: 'Use a permitted review branch. No direct write was attempted.' });
    }
    if (await tools.getHead(task) !== task.expectedHead) {
      return finish({ ...basis, reality: 'The source branch has moved.',
        nextGate: 'Re-inspect the head and obtain fresh approval.' });
    }

    const context = await loadSupport(task, tools);
    lastKnown = { ...basis, support: supportReceipt(context) };
    const proposal = await tools.diagnose(task, context);
    if (!proposal || !proposal.diff.trim() || !within(proposal.files, task.focusFiles)) {
      return finish({ ...lastKnown, nextGate: 'Find one supported cause and an in-scope patch.' });
    }
    if (context.promptos && !within(proposal.files, context.promptos.applicableFiles)) {
      lastKnown = {
        ...lastKnown,
        support: supportReceipt({ ...context, promptos: undefined,
          warnings: [...context.warnings, 'PromptOS method not applicable to final proposal; ignored.'] }),
      };
    }
    const proposalHash = proposalDigest(task, proposal);
    lastKnown = { ...lastKnown, proposalHash, cause: proposal.cause };
    const classified = await tools.classify(task, proposal);
    if (!classified || (classified.surface !== 'ui' && classified.surface !== 'backend' && classified.surface !== 'docs')) {
      return finish({ ...lastKnown, nextGate: 'Trusted change classification unavailable; mutation denied.' });
    }
    if ((task.providerChange || classified.providerTarget) &&
        (!classified.providerTarget || (task.providerTarget && task.providerTarget !== classified.providerTarget))) {
      return finish({ ...lastKnown, nextGate: 'Exact provider target was not independently confirmed.' });
    }
    if (!approved(task, proposal, authority)) {
      return finish({ ...lastKnown, status: 'NEEDS_APPROVAL',
        reality: 'Exact-head diagnosis available; no write performed.',
        nextGate: 'Obtain approval bound to the exact proposal digest and source head.' });
    }
    if (!await tools.verifyApproval(task, proposal, authority!)) {
      return finish({ ...lastKnown, status: 'NEEDS_APPROVAL',
        reality: 'FCR authority ledger did not verify approval; no write performed.',
        nextGate: 'Verify founder approval in the existing FCR ledger.' });
    }
    if (await tools.getHead(task) !== task.expectedHead) {
      return finish({ ...lastKnown, nextGate: 'Source branch moved after approval. Reapprove.' });
    }
    // A durable pending reservation must exist before the external mutation starts.
    const reservationId = await tools.reserve(task, proposal, authority!);
    if (!reservationId || !reservationId.trim()) {
      return finish({ ...lastKnown, nextGate: 'Execution reservation failed; no mutation permitted.' });
    }
    lastKnown = { ...lastKnown, reservationId,
      reality: 'Execution was durably reserved. Mutation outcome is not yet known.',
      risk: 'A reserved action may be partially completed if the adapter fails.',
      nextGate: 'Read the reserved action and repository before any retry.' };
    // The trusted FCR adapter must atomically consume current exact approval and
    // compare-and-swap the branch ref. Proposal files, never broader approval files,
    // constrain what the patch executor is permitted to write.
    const written = await tools.applyPatch(
      task, proposal, proposal.files, task.expectedHead, authority!, reservationId,
    );
    const mutated: Receipt = {
      ...lastKnown,
      changedFiles: written.changedFiles,
      resultHead: written.sha,
      rollback: `Revert the focused commit ${written.sha} only after inspecting the current branch.`,
      reality: 'Write returned a commit. Independent immutable readback is required.',
      nextGate: 'Read the exact commit, then gather trusted proof.',
    };
    lastKnown = mutated;
    if (!/^[0-9a-f]{40}$/.test(written.sha) || written.sha === task.expectedHead ||
        !within(written.changedFiles, proposal.files)) {
      return finish({ ...mutated, risk: 'Invalid SHA or modified files outside the proposal.',
        nextGate: 'Inspect and safely reconcile the uncertain mutation.' });
    }
    const immutableCommit = await tools.inspectCommit(task, written.sha);
    if (immutableCommit.parentSha !== task.expectedHead ||
        !within(immutableCommit.changedFiles, proposal.files) ||
        [...written.changedFiles].sort().join('\n') !== [...immutableCommit.changedFiles].sort().join('\n')) {
      return finish({ ...mutated, risk: 'Immutable commit ancestry or changed-file readback did not match.',
        nextGate: 'Investigate the commit before any further mutation.' });
    }
    if (await tools.getHead(task) !== written.sha) {
      return finish({ ...mutated, risk: 'Branch moved before verification.',
        nextGate: 'Reconcile the changed branch.' });
    }

    const raw = await tools.prove(task, written.sha);
    const now = Date.parse(await tools.getTrustedTime(task));
    if (!Number.isFinite(now)) {
      return finish({ ...mutated, risk: 'Trusted evidence clock unavailable or invalid.',
        nextGate: 'Restore the trusted time adapter and reverify the exact head.' });
    }
    const admissible = raw.filter(e => {
      const observed = Date.parse(e.observedAt);
      return e.sha === written.sha && !!e.reference.trim() &&
        e.reference.startsWith('https://') &&
        Number.isFinite(observed) && observed <= now &&
        now - observed <= 10 * 60 * 1000 &&
        (e.kind !== 'provider-readback' ||
          (e.target === classified.providerTarget && !!e.revision?.trim()));
    });
    const kinds = requiredProof(task, proposal, classified);
    const failed = admissible.some(e => kinds.includes(e.kind) && !e.passed);
    if (failed || !kinds.every(k => admissible.some(e => e.kind === k && e.passed))) {
      return finish({ ...mutated, status: failed ? 'FAILED' : 'BLOCKED', evidence: admissible,
        risk: 'Mandatory exact-head or time-bound evidence is missing or failed.',
        nextGate: 'Repair the failing proof gate without skipping or suppressing it.' });
    }
    if (await tools.getHead(task) !== written.sha) {
      return finish({ ...mutated, evidence: admissible, risk: 'Head changed after proof.',
        nextGate: 'Revalidate exact head before considering release.' });
    }
    return finish({ ...mutated, status: 'VERIFIED', evidence: admissible,
      reality: `Bound and independently checked scoped commit ${written.sha}.`,
      risk: 'This is source verification, not merge or deployment authority.',
      nextGate: 'Independent review, CI and exact-candidate founder merge approval remain separate.' });
  } catch {
    // Adapter exceptions may contain credentials and personal data: never persist
    // a raw exception body in a founder-visible continuity receipt.
    return finish({ ...lastKnown, status: 'BLOCKED',
      reality: 'A trusted adapter operation failed; its raw diagnostic was withheld.',
      risk: 'A reserved action may have partially executed. Reconcile before retry.',
      nextGate: 'Inspect the trusted diagnostic channel and durable reservation.' });
  }
}
