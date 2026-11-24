/** Exact-match founder allowlist test double; email alone never grants access. */
interface FounderRow { email: string; user_id: string }
interface Query {
  eq(field: string, value: unknown): Query;
  maybeSingle(): Promise<{ data: FounderRow | null; error: null }>;
}
export function boundFounderRow(email: string, userId: string) {
  let queriedEmail: string | null = null;
  let queriedUserId: string | null = null;
  const query: Query = {
    eq(field, value) {
      if (field === 'email') queriedEmail = String(value);
      if (field === 'user_id') queriedUserId = String(value);
      return query;
    },
    async maybeSingle() {
      return { data: queriedEmail === email && queriedUserId === userId ? { email, user_id: userId } : null, error: null };
    },
  };
  return { select: () => query };
}
