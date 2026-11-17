-- Verifies the receipt-chain constraints on the isolated preview only; not
-- live Supabase proof. Test rows are rolled back.
\set ON_ERROR_STOP on
begin;
do $proof$
declare
  head_a uuid;
  head_b uuid;
begin
  insert into public.content_queue (id, project, account, caption, fingerprint, content_hash)
  values
    ('ci-chain-a', 'ci-preview', 'ci-preview', 'a', 'fp-a', repeat('a', 64)),
    ('ci-chain-b', 'ci-preview', 'ci-preview', 'b', 'fp-b', repeat('b', 64));

  insert into public.publication_receipts (queue_id, platform, account, native_post_id, content_hash, published_at)
  values ('ci-chain-a', 'instagram', 'ci-preview', 'ci-chain-a-1', repeat('a', 64), now())
  returning id into head_a;
  insert into public.publication_receipts (queue_id, platform, account, native_post_id, content_hash, published_at)
  values ('ci-chain-b', 'instagram', 'ci-preview', 'ci-chain-b-1', repeat('b', 64), now())
  returning id into head_b;

  -- A first successor on the same item is accepted.
  insert into public.publication_receipts (queue_id, predecessor_receipt_id, platform, account, native_post_id, content_hash, published_at)
  values ('ci-chain-a', head_a, 'instagram', 'ci-preview', 'ci-chain-a-2', repeat('a', 64), now());

  -- A second successor of the same receipt (fork) is rejected.
  begin
    insert into public.publication_receipts (queue_id, predecessor_receipt_id, platform, account, native_post_id, content_hash, published_at)
    values ('ci-chain-a', head_a, 'instagram', 'ci-preview', 'ci-chain-a-3', repeat('a', 64), now());
    raise exception 'Receipt chain fork was accepted';
  exception when unique_violation then null;
  end;

  -- A predecessor from a different queue item is rejected.
  begin
    insert into public.publication_receipts (queue_id, predecessor_receipt_id, platform, account, native_post_id, content_hash, published_at)
    values ('ci-chain-a', head_b, 'instagram', 'ci-preview', 'ci-chain-a-4', repeat('a', 64), now());
    raise exception 'Cross-item receipt predecessor was accepted';
  exception when foreign_key_violation then null;
  end;
end
$proof$;
rollback;
