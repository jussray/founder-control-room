const OPERATOR_TOKENS = new Map([
  ['!==', 'semantic_operator_strict_not_equal'],
  ['===', 'semantic_operator_strict_equal'],
  ['<=', 'semantic_operator_less_than_or_equal'],
  ['>=', 'semantic_operator_greater_than_or_equal'],
  ['&&', 'semantic_operator_logical_and'],
  ['||', 'semantic_operator_logical_or'],
  ['==', 'semantic_operator_equal'],
  ['!=', 'semantic_operator_not_equal'],
  ['<', 'semantic_operator_less_than'],
  ['>', 'semantic_operator_greater_than'],
  ['!', 'semantic_operator_not'],
]);

function tokenizeOperators(value, { allowSpacedUnary = false } = {}) {
  const withBinaryOperators = value
    .replace(/!==|===|<=|>=|&&|\|\||==|!=/g, (operator) => ` ${OPERATOR_TOKENS.get(operator)} `)
    .replace(/([a-z0-9_)"'\]}])\s*([<>])\s*(?=(?:["'([{]|[+-]?\s*[a-z0-9_]))/g, (_match, left, operator) => `${left} ${OPERATOR_TOKENS.get(operator)} `);

  const unaryPattern = allowSpacedUnary
    ? /(?<!!)!(?!!)\s*(?=[a-z_(])/g
    : /(?<!!)!(?!!)(?=[a-z_(])/g;
  return withBinaryOperators.replace(unaryPattern, () => ` ${OPERATOR_TOKENS.get('!')} `);
}

function stripDelimited(value, opening, closing) {
  let result = '';
  let cursor = 0;
  while (cursor < value.length) {
    const start = value.indexOf(opening, cursor);
    if (start === -1) return result + value.slice(cursor);
    result += value.slice(cursor, start);
    const end = value.indexOf(closing, start + opening.length);
    if (end === -1) return result + value.slice(start);
    result += ' ';
    cursor = end + closing.length;
  }
  return result;
}

function stripMarkdownLinkDestinations(value) {
  let result = '';
  let cursor = 0;
  while (cursor < value.length) {
    const labelStart = value.indexOf('[', cursor);
    if (labelStart === -1) return result + value.slice(cursor);
    result += value.slice(cursor, labelStart);
    const labelEnd = value.indexOf(']', labelStart + 1);
    if (labelEnd === -1 || value[labelEnd + 1] !== '(') {
      result += '[';
      cursor = labelStart + 1;
      continue;
    }

    let depth = 1;
    let destinationCursor = labelEnd + 2;
    for (; destinationCursor < value.length && depth > 0; destinationCursor += 1) {
      if (value[destinationCursor] === '\\') {
        destinationCursor += 1;
      } else if (value[destinationCursor] === '(') {
        depth += 1;
      } else if (value[destinationCursor] === ')') {
        depth -= 1;
      }
    }

    if (depth !== 0) {
      result += '[';
      cursor = labelStart + 1;
      continue;
    }
    result += value.slice(labelStart + 1, labelEnd);
    cursor = destinationCursor;
  }
  return result;
}

function claimText(value) {
  return stripDelimited(stripMarkdownLinkDestinations(String(value)), '<!--', '-->')
    .replace(/<\/?[a-z][^>]*>/gi, ' ');
}

export function claimInvariantUnits(value) {
  const text = claimText(value);
  const units = [];
  let start = 0;
  let inCodeSpan = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '`') {
      inCodeSpan = !inCodeSpan;
      continue;
    }
    const followedByBoundary = index + 1 === text.length || /\s/.test(text[index + 1]);
    if (!inCodeSpan && (character === ';' || character === '\n' || ('.?!'.includes(character) && followedByBoundary))) {
      const unit = text.slice(start, index + 1).trim();
      if (unit) units.push(unit);
      start = index + 1;
    }
  }
  const remainder = text.slice(start).trim();
  if (remainder) units.push(remainder);
  return units;
}

export function normalizedClaimFingerprint(value) {
  const codeAware = claimText(value)
    .toLowerCase()
    .replace(/`([^`]*)`/g, (_match, code) => tokenizeOperators(code, { allowSpacedUnary: true }));

  return tokenizeOperators(codeAware)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizedClaimUnits(value) {
  return claimInvariantUnits(value)
    .map((unit) => normalizedClaimFingerprint(unit))
    .filter(Boolean);
}
