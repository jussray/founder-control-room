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

async function readOverride(switchId: string): Promise<SwitchOverrideRow | null> {
  const { data, error } = await supabase
    .from('founder_switch_overrides')
    .select('switch_id,desired_state,reason,updated_by,updated_at')
    .eq('switch_id', switchId)
    .maybeSingle();

  if (error) {
    throw new SwitchboardError('read_failed', `Could not read founder switch ${switchId}: ${error.message}`);
  }
  return data as SwitchOverrideRow | null;
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
  return (await readOverride(switchId))?.desired_state ?? definition.defaultDesiredState;
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
    return mergeSwitch(definition, (await readOverride(input.switchId)) ?? undefined);
  }

  // This RPC updates the current override and appends its audit event inside
  // one Postgres transaction. A caller can therefore never receive a failed
  // response after the switch changed without its evidence receipt, or a
  // receipt claiming a state change that rolled back.
  const { data, error } = await supabase.rpc('set_founder_switch_state', {
    p_switch_id: input.switchId,
    p_previous_state: previousState,
    p_desired_state: input.desiredState,
    p_reason: normalizedReason,
    p_actor_email: input.actorEmail,
  });

  if (error) {
    throw new SwitchboardError('write_failed', `Could not persist founder switch ${input.switchId}: ${error.message}`);
  }

  const result = Array.isArray(data) ? data[0] : data;
  if (!result || typeof result !== 'object') {
    throw new SwitchboardError('write_failed', `Could not persist founder switch ${input.switchId}: missing atomic write receipt`);
  }

  const row = result as Record<string, unknown>;
  const override: SwitchOverrideRow = {
    switch_id: String(row.switch_id ?? input.switchId),
    desired_state: row.desired_state === 'off' ? 'off' : 'on',
    reason: typeof row.reason === 'string' ? row.reason : null,
    updated_by: typeof row.updated_by === 'string' ? row.updated_by : input.actorEmail,
    updated_at: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };

  return mergeSwitch(definition, override);
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
