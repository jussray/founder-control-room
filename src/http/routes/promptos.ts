/**
 * PromptOS — founder-gated CRUD over the prompt template library.
 *
 * The schema comment in 0001_init.sql calls this "already a real product —
 * 157 prompts today," with full versioning (promptos_template_versions)
 * already modeled. This wires that existing, RLS-protected schema to HTTP;
 * it does not change the data model.
 */

import { Router } from 'express';
import { supabase } from '../../lib/supabaseClient.js';
import { requireFounder, type FounderRequest } from '../middleware/requireFounder.js';

export const promptosRouter = Router();
promptosRouter.use(requireFounder);

const TEMPLATE_COLUMNS =
  'id, name, tagline, slash_command, category, platforms, icon, body_template, variables, is_starred, is_custom, current_version, created_at, updated_at';

/** Extracts [PLACEHOLDER] tokens from a prompt body, matching the column's own naming. */
function extractVariables(bodyTemplate: string): string[] {
  const matches = bodyTemplate.match(/\[([A-Z0-9_]+)\]/g) ?? [];
  return [...new Set(matches.map((m) => m.slice(1, -1)))];
}

/** GET /promptos — list templates, optionally filtered by ?category= or ?platform=. */
promptosRouter.get('/', async (req: FounderRequest, res) => {
  let query = supabase.from('promptos_templates').select(TEMPLATE_COLUMNS).order('updated_at', { ascending: false });

  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  if (category) query = query.eq('category', category);

  const platform = typeof req.query.platform === 'string' ? req.query.platform : undefined;
  if (platform) query = query.contains('platforms', [platform]);

  const { data, error } = await query;
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ templates: data ?? [] });
});

/** GET /promptos/:id — a single template plus its full version history. */
promptosRouter.get('/:id', async (req: FounderRequest, res) => {
  const { id } = req.params;

  const { data: template, error } = await supabase
    .from('promptos_templates')
    .select(TEMPLATE_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  if (!template) return res.status(404).json({ error: 'Template not found' });

  const { data: versions, error: versionsError } = await supabase
    .from('promptos_template_versions')
    .select('id, version, body_template, change_note, created_at')
    .eq('template_id', id)
    .order('version', { ascending: false });
  if (versionsError) return res.status(500).json({ error: versionsError.message });

  return res.json({ template, versions: versions ?? [] });
});

/**
 * POST /promptos
 * Body: { name, tagline?, slashCommand?, category?, platforms?, icon?, bodyTemplate }
 *
 * Creates a new template at version 1 and seeds its first version row.
 * Founder-authored templates are marked isCustom: true — this route never
 * creates the seeded, non-custom 157-prompt baseline.
 */
promptosRouter.post('/', async (req: FounderRequest, res) => {
  const body = req.body as Record<string, unknown>;
  const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
  const bodyTemplate = typeof body['bodyTemplate'] === 'string' ? body['bodyTemplate'] : '';

  if (!name || !bodyTemplate) {
    return res.status(400).json({ error: 'name and bodyTemplate are required' });
  }

  const variables = extractVariables(bodyTemplate);
  const { data: template, error } = await supabase
    .from('promptos_templates')
    .insert({
      name,
      tagline: typeof body['tagline'] === 'string' ? body['tagline'] : null,
      slash_command: typeof body['slashCommand'] === 'string' ? body['slashCommand'] : null,
      category: typeof body['category'] === 'string' ? body['category'] : null,
      platforms: Array.isArray(body['platforms']) ? body['platforms'] : [],
      icon: typeof body['icon'] === 'string' ? body['icon'] : null,
      body_template: bodyTemplate,
      variables,
      is_starred: false,
      is_custom: true,
      current_version: 1,
    })
    .select(TEMPLATE_COLUMNS)
    .single();

  if (error) return res.status(500).json({ error: error.message });

  const { error: versionError } = await supabase.from('promptos_template_versions').insert({
    template_id: template.id,
    version: 1,
    body_template: bodyTemplate,
    change_note: 'Initial version',
  });
  if (versionError) {
    return res.status(500).json({
      error: 'Template created, but its first version record could not be saved.',
      detail: versionError.message,
      template,
    });
  }

  return res.status(201).json({ template });
});

/**
 * PATCH /promptos/:id
 * Body: { tagline?, category?, platforms?, icon?, isStarred?, bodyTemplate?, changeNote? }
 *
 * Metadata fields update in place. Supplying `bodyTemplate` instead creates
 * a NEW version row and bumps `current_version` — template bodies are
 * append-only history, never silently overwritten.
 */
promptosRouter.patch('/:id', async (req: FounderRequest, res) => {
  const { id } = req.params;
  const body = req.body as Record<string, unknown>;

  const { data: existing, error: existingError } = await supabase
    .from('promptos_templates')
    .select('id, current_version')
    .eq('id', id)
    .maybeSingle();
  if (existingError) return res.status(500).json({ error: existingError.message });
  if (!existing) return res.status(404).json({ error: 'Template not found' });

  const update: Record<string, unknown> = {};
  if (typeof body['tagline'] === 'string') update['tagline'] = body['tagline'];
  if (typeof body['category'] === 'string') update['category'] = body['category'];
  if (Array.isArray(body['platforms'])) update['platforms'] = body['platforms'];
  if (typeof body['icon'] === 'string') update['icon'] = body['icon'];
  if (typeof body['isStarred'] === 'boolean') update['is_starred'] = body['isStarred'];

  let nextVersion: number | null = null;
  if (typeof body['bodyTemplate'] === 'string' && body['bodyTemplate'].trim() !== '') {
    nextVersion = existing.current_version + 1;
    update['body_template'] = body['bodyTemplate'];
    update['variables'] = extractVariables(body['bodyTemplate']);
    update['current_version'] = nextVersion;
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No recognized fields to update were provided.' });
  }

  const { data: template, error } = await supabase
    .from('promptos_templates')
    .update(update)
    .eq('id', id)
    .select(TEMPLATE_COLUMNS)
    .single();
  if (error) return res.status(500).json({ error: error.message });

  if (nextVersion) {
    const { error: versionError } = await supabase.from('promptos_template_versions').insert({
      template_id: id,
      version: nextVersion,
      body_template: body['bodyTemplate'],
      change_note: typeof body['changeNote'] === 'string' ? body['changeNote'] : null,
    });
    if (versionError) {
      return res.status(500).json({
        error: 'Template updated, but the new version record could not be saved.',
        detail: versionError.message,
        template,
      });
    }
  }

  return res.json({ template });
});
