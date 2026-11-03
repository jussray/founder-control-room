import { describe, expect, it } from 'vitest';
import { PLUGIN_CATALOG, pluginDescriptorFor } from '../pluginCenter.js';

describe('Google Workspace Plugin Center registration', () => {
  it('registers one unified Google Drive entry with all five native skill routes', () => {
    const descriptor = PLUGIN_CATALOG.find((item) => item.type === 'google-drive');
    expect(descriptor).toBeDefined();
    expect(descriptor?.label).toBe('Google Drive');
    for (const skill of ['google-drive', 'google-docs', 'google-sheets', 'google-slides', 'google-drive-comments']) {
      expect(descriptor?.description).toContain(skill);
    }
    expect(descriptor?.defaultDataBoundary).toContain('per-user');
    expect(descriptor?.blockedByDefault).toEqual(expect.arrayContaining([
      'cross_tenant_file_access',
      'share_without_explicit_approval',
      'delete_without_explicit_approval',
      'bulk_drive_scan',
    ]));
  });

  it('recognizes the legacy other-type connection only when its label is exactly Google Drive', () => {
    expect(pluginDescriptorFor('other', 'Google Drive')?.type).toBe('google-drive');
    expect(pluginDescriptorFor('other', 'google drive')?.type).toBe('google-drive');
    expect(pluginDescriptorFor('other', 'Google Cloud')?.type).toBe('other');
    expect(pluginDescriptorFor('other', 'Drive analytics')?.type).toBe('other');
    expect(pluginDescriptorFor('other')?.type).toBe('other');
    expect(pluginDescriptorFor('google-drive')?.type).toBe('google-drive');
  });

  it('does not grant permission to write just by catalog registration', () => {
    const descriptor = pluginDescriptorFor('other', 'Google Drive');
    expect(descriptor?.defaultAuthorityLevel).toBe('L1');
    expect(descriptor?.description).toContain('not a live OAuth connection');
    expect(descriptor?.blockedByDefault).toContain('write_without_exact_file_and_revision');
  });
});
