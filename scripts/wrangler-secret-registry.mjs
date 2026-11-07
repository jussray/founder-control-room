function parseNames(listSource, label) {
  const names = [...listSource.matchAll(/["']([A-Z][A-Z0-9_]*)["']/g)].map((match) => match[1]);
  const remainder = listSource
    .replace(/#.*$/gm, '')
    .replace(/["'][A-Z][A-Z0-9_]*["']/g, '')
    .replace(/[\s,]/g, '');

  if (remainder) {
    throw new Error(`invalid [secrets].${label} registry entry`);
  }

  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`duplicate [secrets].${label} secret: ${duplicates[0]}`);
  }

  return names;
}

function registryList(section, label) {
  const match = section.match(new RegExp(`(?:^|\\n)\\s*${label}\\s*=\\s*\\[([\\s\\S]*?)\\]`, 'm'));
  if (!match) {
    throw new Error(`missing [secrets].${label} registry`);
  }
  return parseNames(match[1], label);
}

export function parseWranglerSecretRegistry(source) {
  if (typeof source !== 'string') {
    throw new TypeError('wrangler source must be a string');
  }

  const header = source.match(/^\[secrets\]\s*$/m);
  if (!header || header.index === undefined) {
    throw new Error('missing [secrets] registry');
  }

  const afterHeader = source.slice(header.index + header[0].length);
  const nextHeaderOffset = afterHeader.search(/^\s*\[\[?[^\]\n]+\]\]?\s*$/m);
  const section = nextHeaderOffset === -1
    ? afterHeader
    : afterHeader.slice(0, nextHeaderOffset);

  const required = registryList(section, 'required');
  const optional = registryList(section, 'optional');
  const requiredSet = new Set(required);

  for (const name of optional) {
    if (requiredSet.has(name)) {
      throw new Error(`secret appears in both required and optional registries: ${name}`);
    }
  }

  return { required, optional };
}
