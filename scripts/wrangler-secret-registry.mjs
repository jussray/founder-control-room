function stripTomlComments(source) {
  let output = '';
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (const character of source) {
    if (inComment) {
      if (character === '\n') {
        inComment = false;
        output += character;
      }
      continue;
    }

    if (quote) {
      output += character;
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '#') {
      inComment = true;
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
    }
    output += character;
  }

  return output;
}

function parseNames(listSource, label) {
  const uncommented = stripTomlComments(listSource);
  const names = [...uncommented.matchAll(/["']([A-Z][A-Z0-9_]*)["']/g)].map((match) => match[1]);
  const remainder = uncommented
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

function arrayBody(section, label) {
  const assignment = new RegExp(`(?:^|\\n)\\s*${label}\\s*=\\s*\\[`, 'm').exec(section);
  if (!assignment) {
    throw new Error(`missing [secrets].${label} registry`);
  }

  const openOffset = assignment[0].lastIndexOf('[');
  const openIndex = assignment.index + openOffset;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = openIndex; index < section.length; index += 1) {
    const character = section[index];

    if (inComment) {
      if (character === '\n') inComment = false;
      continue;
    }

    if (quote) {
      if (quote === '"' && escaped) {
        escaped = false;
      } else if (quote === '"' && character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (character === '#') {
      inComment = true;
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }
    if (character === '[') {
      depth += 1;
      continue;
    }
    if (character === ']') {
      depth -= 1;
      if (depth === 0) {
        return section.slice(openIndex + 1, index);
      }
    }
  }

  throw new Error(`unterminated [secrets].${label} registry`);
}

function registryList(section, label) {
  return parseNames(arrayBody(section, label), label);
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
