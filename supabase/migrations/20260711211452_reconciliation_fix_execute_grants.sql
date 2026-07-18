revoke execute on function claim_outbox_work(int) from public, anon, authenticated;
revoke execute on function fail_outbox_work(uuid, text) from public, anon, authenticated;
revoke execute on function increment_attempt_count(uuid) from public, anon, authenticated;

grant execute on function claim_outbox_work(int) to service_role;
grant execute on function fail_outbox_work(uuid, text) to service_role;
grant execute on function increment_attempt_count(uuid) to service_role;
