-- Enforce the publication receipt chain that 20261104022801 documents but did
-- not constrain: one linear successor chain per content_queue item.
--
-- Gaps closed (append-only; the original migration is not rewritten):
-- 1. Fork: two receipts naming the same predecessor were accepted. A partial
--    unique index now allows at most one successor per receipt.
-- 2. Cross-item link: a receipt could name a predecessor that belongs to a
--    different queue item. A composite foreign key now requires the
--    predecessor to carry the same queue_id. MATCH SIMPLE leaves chain heads
--    (predecessor_receipt_id is null) unchecked, as intended.
--
-- Grants, RLS, append-only revocations and existing rows are unchanged.
-- Source-only until an explicitly authorized database apply.

begin;

create unique index if not exists publication_receipts_single_successor_idx
  on public.publication_receipts (predecessor_receipt_id)
  where predecessor_receipt_id is not null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.publication_receipts'::regclass
       and conname = 'publication_receipts_id_queue_key'
  ) then
    alter table public.publication_receipts
      add constraint publication_receipts_id_queue_key unique (id, queue_id);
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.publication_receipts'::regclass
       and conname = 'publication_receipts_predecessor_same_queue_fkey'
  ) then
    alter table public.publication_receipts
      add constraint publication_receipts_predecessor_same_queue_fkey
      foreign key (predecessor_receipt_id, queue_id)
      references public.publication_receipts (id, queue_id)
      on delete restrict;
  end if;
end
$constraints$;

comment on index public.publication_receipts_single_successor_idx is
  'At most one successor per receipt: the receipt chain for a queue item cannot fork.';

commit;
