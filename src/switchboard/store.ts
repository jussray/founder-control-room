import { supabase } from '../lib/supabaseClient.js';
import {
  findPortfolioSwitch,
  portfolioSwitchCatalog,
  type DesiredSwitchState,
  type PortfolioSwitchDefinition,
} from './catalog.js';

interface SwitchOverrideRow {
  switch_id: string;
  desired_state: DesiredSwitchState;
  reason: string | null;
  updated_by: string | null;
  updated_at: string;
}

interface SwitchEventRow {
  id: string;
  switch_id: string;
  previous_state: DesiredSwitchState;
  desired_state: DesiredSwitchState;
  reason: string | null;
  actor_email: string | null;
  created_at: string;
}

export interface PortfolioSwitchView extends PortfolioSwitchDefinition {
  desiredState: DesiredSwitchState;
  override: boolean;
  reason: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
}

export class SwitchboardError extends Error {
  constructor(
    public readonly code: 'unknown_switch' | 'locked_off' | 'read_failed' | 'write_failed' | 'history_failed',
    message: string,
  ) {
    super(message);
    this.name = 'SwitchboardError';
  }
}

function mergeSwitch(
  definition: PortfolioSwitchDefinition,
  override: SwitchOverrideRow | undefined,
): PortfolioSwitchView {
  return {
    ...definition,
    desiredState: override?.desired_state ?? definition.defaultDesiredState,
    override: Boolean(override),
    reason: override?.reason ?? null,
    updatedBy: override?.updated_by ?? null,
    updatedAt: override?.updated_at ?? null,
  };
}

export async function readSwitchboard(): Promise<PortfolioSwitchView[]> {
  const ids = portfolioSwitchCatalog.map((item) => item.id);
  const { data, error } = await supabase
    .from('founder_switch_overrides')
    .select('switch_id,desired_state,reason,updated_by,updated_at')
    .in('switch_id', ids);

  if (error) {
    throw new SwitchboardError('read_failed', `Could not read founder switch overrides: ${error.message}`);
  }

  const overrides = new Map(
    ((data ?? []) as SwitchOverrideRow[]).map((row) => [row.switch_id, row]),
  );

  return portfolioSwitchCatalog.map((definition) => mergeSwitch(definition, overrides.get(definition.id)));
}

export async function readEffectiveDesiredState(switchId: string): Promise<DesiredSwitchState> {
  const definition = findPortfolioSwitch(switchId);
  if (!definition) {
    throw new SwitchboardError('unknown_switch', `Unknown portfolio switch: ${switchId}`);
  }

  const { data, error } = await supabase
    .from('founder_switch_overrides')
    .select('switch_id,desired_state,reason,updated_by,updated_at')
    .eq('switch_id', switchId)
    .maybeSingle();

  if (error) {
    throw new SwitchboardError('read_failed', `Could not read founder switch ${switchId}: ${error.message}`);
  }

  return (data as SwitchOverrideRow | null)?.desired_state ?? definition.defaultDesiredState;
}

export async function setFounderDesiredState(input: {
  switchId: string;
  desiredState: DesiredSwitchState;
  actorEmail: string;
  reason?: string | null;
}): Promise<PortfolioSwitchView> {
  const definition = findPortfolioSwitch(input.switchId);
  if (!definition) {
    throw new SwitchboardError('unknown_switch', `Unknown portfolio switch: ${input.switchId}`);
  }
  if (definition.controlMode === 'locked_off' && input.desiredState === 'on') {
    throw new SwitchboardError(
      'locked_off',
      `${definition.label} is locked OFF until its code-reviewed activation condition is satisfied.`,
    );
  }

  const normalizedReason = input.reason?.trim().slice(0, 500) || null;
  const previousState = await readEffectiveDesiredState(input.switchId);

  if (previousState === input.desiredState) {
    const { data, error } = await supabase
      .from('founder_switch_overrides')
      .select('switch_id,desired_state,reason,updated_by,updated_at')
      .eq('switch_id', input.switchId)
      .maybeSingle();
    if (error) {
      throw new SwitchboardError('read_failed', `Could not re-read founder switch ${input.switchId}: ${error.message}`);
    }
    return mergeSwitch(definition, (data as SwitchOverrideRow | null) ?? undefined);
  }

  const { data: override, error: writeError } = await supabase
    .from('founder_switch_overrides')
    .upsert({
      switch_id: input.switchId,
      desired_state: input.desiredState,
      reason: normalizedReason,
      updated_by: input.actorEmail,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'switch_id' })
    .select('switch_id,desired_state,reason,updated_by,updated_at')
    .single();

  if (writeError || !override) {
    throw new SwitchboardError('write_failed', `Could not persist founder switch ${input.switchId}: ${writeError?.message ?? 'missing write result'}`);
  }

  const { error: eventError } = await supabase
    .from('founder_switch_events')
    .insert({
      switch_id: input.switchId,
      previous_state: previousState,
      desired_state: input.desiredState,
      reason: normalizedReason,
      actor_email: input.actorEmail,
    });

  if (eventError) {
    // The current state has already been durably written. Surface the audit
    // failure instead of pretending the entire operation was uncommitted.
    throw new SwitchboardError(
      'write_failed',
      `Switch state changed but its audit event failed to persist: ${eventError.message}`,
    );
  }

  return mergeSwitch(definition, override as SwitchOverrideRow);
}

export async function readSwitchHistory(switchId: string): Promise<SwitchEventRow[]> {
  if (!findPortfolioSwitch(switchId)) {
    throw new SwitchboardError('unknown_switch', `Unknown portfolio switch: ${switchId}`);
  }

  const { data, error } = await supabase
    .from('founder_switch_events')
    .select('id,switch_id,previous_state,desired_state,reason,actor_email,created_at')
    .eq('switch_id', switchId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    throw new SwitchboardError('history_failed', `Could not read switch history: ${error.message}`);
  }

  return (data ?? []) as SwitchEventRow[];
}
