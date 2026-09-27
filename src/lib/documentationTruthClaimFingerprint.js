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

export function normalizedClaimFingerprint(value) {
  const codeAware = String(value)
    .replace(/\[([^\]]+)\]\((?:\\.|[^)])*\)/g, '$1')
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    .toLowerCase()
    .replace(/`([^`]*)`/g, (_match, code) => tokenizeOperators(code, { allowSpacedUnary: true }));

  return tokenizeOperators(codeAware)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
