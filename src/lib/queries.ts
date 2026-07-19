import { supabaseAdmin } from '@/lib/supabase';
import type { Lane, Mission, ControlRoomEvent, Evidence } from '@/lib/db-types';

export async function getLanes(): Promise<Lane[]> {
  const { data, error } = await supabaseAdmin()
    .from('lanes')
    .select('*')
    .order('id');
  if (error) throw error;
  return data;
}

export async function getMissions(laneId?: string): Promise<Mission[]> {
  let q = supabaseAdmin()
    .from('missions')
    .select('*, ooda_steps(*), evidence(*)')
    .order('created_at', { ascending: false });
  if (laneId) q = q.eq('lane_id', laneId);
  const { data, error } = await q;
  if (error) throw error;
  return data;
}

export async function enqueueEvent(
  event: Omit<ControlRoomEvent, 'id' | 'processed' | 'observed_at'>
) {
  const { data, error } = await supabaseAdmin()
    .from('events')
    .insert(event)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function appendEvidence(
  evidence: Omit<Evidence, 'id' | 'created_at'>
) {
  const { data, error } = await supabaseAdmin()
    .from('evidence')
    .insert(evidence)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function escalate(entry: {
  lane_id?: string;
  mission_id?: string;
  blocker: string;
  verified?: string;
  safest_path?: string;
  needs?: string;
}) {
  const { data, error } = await supabaseAdmin()
    .from('escalations')
    .insert(entry)
    .select()
    .single();
  if (error) throw error;
  return data;
}
