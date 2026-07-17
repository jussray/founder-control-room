import { randomUUID } from 'node:crypto';
import { Router, type NextFunction, type Request, type Response } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { enqueueReconcile } from '../../events/outbox.js';
import { getTerminalCommand, listTerminalCommands } from '../../terminal/registry.js';
import { GuardedTerminalRunner } from '../../terminal/runner.js';
import { TerminalRunnerError } from '../../terminal/types.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

type TerminalExecutor = Pick<GuardedTerminalRunner, 'run' | 'cancel'>;

let sharedRunner: GuardedTerminalRunner | null = null;

function resolveRunner(override?: TerminalExecutor): TerminalExecutor {
  if (override) return override;
  if (!sharedRunner) {
    sharedRunner = new GuardedTerminalRunner(process.env['CONTROL_ROOM_WORKSPACE_ROOT'] ?? '');
  }
  return sharedRunner;
}

function isLoopback(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? '';
  return remote === '127.0.0.1' || remote === '::1' || remote === '::ffff:127.0.0.1';
}

function terminalBoundary(req: Request, res: Response, next: NextFunction) {
  if (process.env['CONTROL_ROOM_TERMINAL_ENABLED'] !== 'true') {
    return res.status(503).json({
      error: 'Guarded terminal is disabled.',
      code: 'TERMINAL_DISABLED',
    });
  }

  const remoteAllowed = process.env['CONTROL_ROOM_TERMINAL_ALLOW_REMOTE'] === 'true';
  if (!remoteAllowed && !isLoopback(req)) {
    return res.status(403).json({
      error: 'Guarded terminal accepts loopback connections only.',
      code: 'TERMINAL_LOOPBACK_ONLY',
    });
  }
  return next();
}

export function createTerminalRouter(runnerOverride?: TerminalExecutor) {
  const router = Router();
  const runner = resolveRunner(runnerOverride);

  router.use(requireFounder);
  router.use(terminalBoundary);

  router.get('/:projectSlug/commands', async (req: FounderRequest, res) => {
    const { projectSlug } = req.params as { projectSlug: string };
    const { data: project, error } = await supabase
      .from('projects')
      .select('id, slug, name, verification_enabled')
      .eq('slug', projectSlug)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!project) return res.status(404).json({ error: `Unknown project: ${projectSlug}` });

    return res.json({
      project: { slug: project.slug, name: project.name },
      commands: listTerminalCommands(projectSlug).map((command) => ({
        id: command.id,
        label: command.label,
        risk: command.risk,
        timeoutMs: command.timeoutMs,
        evidenceKind: command.evidenceKind ?? null,
      })),
    });
  });

  router.get('/runs/:runId', async (req: FounderRequest, res) => {
    const { runId } = req.params as { runId: string };
    const { data, error } = await supabase
      .from('terminal_runs')
      .select('id, project_id, mission_id, command_id, expected_commit_sha, observed_commit_sha, status, exit_code, signal, output_truncated, stdout_excerpt, stderr_excerpt, started_at, finished_at, executed_by, error_code')
      .eq('id', runId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message });
    if (!data) return res.status(404).json({ error: 'Terminal run not found' });
    return res.json({ run: data });
  });

  router.post('/runs/:runId/cancel', async (req: FounderRequest, res) => {
    const { runId } = req.params as { runId: string };
    const cancelled = runner.cancel(runId);
    if (!cancelled) {
      return res.status(409).json({
        error: 'Run is not active in this terminal process.',
        code: 'RUN_NOT_ACTIVE',
      });
    }
    return res.status(202).json({ ok: true, runId, status: 'cancellation_requested' });
  });

  router.post('/:projectSlug/run', async (req: FounderRequest, res) => {
    const { projectSlug } = req.params as { projectSlug: string };
    const body = req.body as Record<string, unknown>;
    const commandId = typeof body['commandId'] === 'string' ? body['commandId'] : '';
    const missionId = typeof body['missionId'] === 'string' ? body['missionId'] : '';
    const expectedCommitSha =
      typeof body['expectedCommitSha'] === 'string' ? body['expectedCommitSha'].toLowerCase() : '';

    if (!commandId || !missionId || !expectedCommitSha) {
      return res.status(400).json({
        error: 'commandId, missionId, and expectedCommitSha are required.',
      });
    }
    if (!/^[0-9a-f]{40}$/.test(expectedCommitSha)) {
      return res.status(400).json({
        error: 'expectedCommitSha must be a full 40-character Git commit SHA.',
        code: 'INVALID_HEAD_SHA',
      });
    }

    const command = getTerminalCommand(projectSlug, commandId);
    if (!command) {
      return res.status(400).json({
        error: `Command "${commandId}" is not approved for project "${projectSlug}".`,
        code: 'UNKNOWN_COMMAND',
      });
    }

    if (command.risk === 'write' && body['confirmWrite'] !== true) {
      return res.status(409).json({
        error: 'Write-risk commands require confirmWrite: true for this request.',
        code: 'WRITE_CONFIRMATION_REQUIRED',
      });
    }

    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, slug, verification_enabled')
      .eq('slug', projectSlug)
      .maybeSingle();

    if (projectError) return res.status(500).json({ error: projectError.message });
    if (!project) return res.status(404).json({ error: `Unknown project: ${projectSlug}` });
    if (!project.verification_enabled) {
      return res.status(409).json({
        error: 'Verification is disabled for this project.',
        code: 'PROJECT_VERIFICATION_DISABLED',
      });
    }

    const { data: mission, error: missionError } = await supabase
      .from('missions')
      .select('id, project_id, status')
      .eq('id', missionId)
      .eq('project_id', project.id)
      .maybeSingle();

    if (missionError) return res.status(500).json({ error: missionError.message });
    if (!mission) {
      return res.status(404).json({ error: 'Mission not found for this project.' });
    }

    // Recover from a process crash without allowing two live runs. Fresh runs
    // remain protected by both the DB partial unique index and the runner map.
    const staleCutoff = new Date(Date.now() - 60 * 60_000).toISOString();
    const { error: staleCleanupError } = await supabase
      .from('terminal_runs')
      .update({
        status: 'failed',
        error_code: 'ORPHANED_RUN',
        stderr_excerpt: 'The terminal process ended before this run completed.',
        finished_at: new Date().toISOString(),
      })
      .eq('project_id', project.id)
      .eq('status', 'running')
      .lt('started_at', staleCutoff);

    if (staleCleanupError) {
      return res.status(500).json({
        error: 'Unable to reconcile stale terminal runs; command was not started.',
        detail: staleCleanupError.message,
      });
    }

    const runId = randomUUID();
    const startedAt = new Date().toISOString();
    const auditBase = {
      id: runId,
      project_id: project.id,
      mission_id: mission.id,
      command_id: command.id,
      executable: command.executable,
      args: [...command.args],
      working_directory: command.relativeCwd,
      expected_commit_sha: expectedCommitSha,
      status: 'running',
      timeout_ms: command.timeoutMs,
      max_output_bytes: command.maxOutputBytes,
      executed_by: req.founder!.email,
      started_at: startedAt,
    };

    const { error: insertError } = await supabase.from('terminal_runs').insert(auditBase);
    if (insertError) {
      return res.status(500).json({
        error: 'Unable to persist terminal audit record; command was not started.',
        detail: insertError.message,
      });
    }

    try {
      const result = await runner.run({
        runId,
        projectSlug,
        commandId,
        expectedCommitSha,
      });

      const { error: updateError } = await supabase
        .from('terminal_runs')
        .update({
          observed_commit_sha: result.observedCommitSha,
          status: result.status,
          exit_code: result.exitCode,
          signal: result.signal,
          output_truncated: result.outputTruncated,
          stdout_excerpt: result.stdout,
          stderr_excerpt: result.stderr,
          finished_at: result.finishedAt,
        })
        .eq('id', runId);

      if (updateError) {
        return res.status(500).json({
          error: 'Command finished, but its audit result could not be persisted.',
          detail: updateError.message,
          runId,
        });
      }

      const proofEligible = result.status === 'passed' && !result.outputTruncated;
      let evidenceId: string | null = null;
      if (command.evidenceKind) {
        const { data: evidence, error: evidenceError } = await supabase
          .from('evidence')
          .insert({
            project_id: project.id,
            mission_id: mission.id,
            subject: `terminal:${command.id}`,
            kind: command.evidenceKind,
            status: proofEligible ? 'pass' : result.status === 'passed' ? 'warn' : 'fail',
            provider: 'custom',
            commit_sha: result.observedCommitSha,
            details_ref: `terminal-run:${runId}`,
          })
          .select('id')
          .single();

        if (evidenceError || !evidence) {
          return res.status(500).json({
            error: 'Terminal result persisted, but evidence could not be recorded.',
            detail: evidenceError?.message ?? 'Evidence insert returned no record.',
            runId,
          });
        }
        evidenceId = evidence.id as string;

        await enqueueReconcile({
          projectId: project.id as string,
          controller: 'MissionController',
          resourceId: mission.id as string,
          reason: 'dependency_changed',
        });
      }

      return res.status(result.status === 'passed' ? 200 : 422).json({
        ok: result.status === 'passed',
        proofEligible,
        run: result,
        evidenceId,
      });
    } catch (error) {
      const runnerError = error instanceof TerminalRunnerError ? error : null;
      const message = error instanceof Error ? error.message : String(error);
      await supabase
        .from('terminal_runs')
        .update({
          status: 'failed',
          error_code: runnerError?.code ?? 'UNEXPECTED_ERROR',
          stderr_excerpt: message,
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);

      const status = runnerError?.code === 'HEAD_MISMATCH' || runnerError?.code === 'PROJECT_BUSY'
        ? 409
        : runnerError?.code === 'INVALID_HEAD_SHA' || runnerError?.code === 'UNKNOWN_COMMAND'
          ? 400
          : runnerError?.code === 'WORKSPACE_NOT_CONFIGURED' || runnerError?.code === 'WORKSPACE_MISSING'
            ? 503
            : 500;

      return res.status(status).json({
        ok: false,
        runId,
        error: message,
        code: runnerError?.code ?? 'UNEXPECTED_ERROR',
      });
    }
  });

  return router;
}

export const terminalRouter = createTerminalRouter();
