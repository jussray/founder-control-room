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

export function normalizedClaimFingerprint(value) {
  return String(value)
    .toLowerCase()
    .replace(/!==|===|<=|>=|&&|\|\||==|!=|<|>|!/g, (operator) => ` ${OPERATOR_TOKENS.get(operator)} `)
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
