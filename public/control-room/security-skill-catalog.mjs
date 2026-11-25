// Metadata only. Authentication is enforced by the same-origin server.
export async function readSkillCatalog(fetcher = globalThis.fetch) {
  const response = await fetcher('/founder-os/security-skills/catalog', {
    method: 'GET', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error('founder_auth_required');
    error.auth = true;
    throw error;
  }
  if (!response.ok) throw new Error('Catalog unavailable');
  const catalog = await response.json();
  if (catalog?.schema_version !== 1 || catalog.execution_enabled !== false ||
      catalog.auto_fetch !== false || catalog.auto_handoff !== false ||
      catalog.owner_approval_required_for_disclosure !== true ||
      !Array.isArray(catalog.records) || catalog.records.length !== 3 ||
      new Set(catalog.records.map(r => r?.id)).size !== 3 ||
      !catalog.records.every(r => r && ['aegis','sarissa','medusa'].includes(r.id) &&
        typeof r.version === 'string' && typeof r.purpose === 'string' &&
        r.repository === 'jussray/' + r.id && /^[a-f0-9]{40}$/.test(r.commit) &&
        /^[a-f0-9]{40}$/.test(r.blob))) {
    throw new Error('Catalog metadata invalid');
  }
  return catalog;
}

export function renderSkillCatalog(container, catalog) {
  const doc = container.ownerDocument;
  const heading = doc.createElement('h2');
  heading.textContent = 'Security Skills Library';
  const description = doc.createElement('p');
  description.textContent = 'Read-only source catalog. Recorded CI is not proof of runtime activation.';
  const grid = doc.createElement('div');
  grid.className = 'summary-grid';
  for (const record of catalog.records) {
    const card = doc.createElement('article');
    card.className = 'summary-card';
    const title = doc.createElement('strong');
    title.textContent = record.id.toUpperCase() + ' · v' + record.version;
    const purpose = doc.createElement('p');
    purpose.textContent = record.purpose;
    const evidence = doc.createElement('p');
    evidence.textContent = 'Pinned source: ' + record.repository + ' @ ' + record.commit.slice(0, 12) +
      ' · recorded CI: ' + (record.ci?.conclusion === 'success' ? 'passed' : 'unverified');
    card.append(title, purpose, evidence);
    grid.append(card);
  }
  container.replaceChildren(heading, description, grid);
}
