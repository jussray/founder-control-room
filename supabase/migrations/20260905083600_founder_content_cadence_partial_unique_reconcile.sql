-- Reconcile legacy founder-content cadence UNIQUE constraints by definition.
-- PostgreSQL may truncate auto-generated constraint names, so the preceding
-- cadence execution-lease migration must not rely on guessed identifier text.
-- This source-only follow-up removes only the two predecessor table-wide UNIQUE
-- constraints whose exact column definitions are known, then reasserts the
-- partial active indexes required by the cadence lease contract.

begin;

do $drop_legacy_cadence_uniques$
declare
  legacy_constraint text;
begin
  for legacy_constraint in
    select c.conname
      from pg_catalog.pg_constraint as c
     where c.conrelid = 'public.founder_content_cadence_reservations'::pg_catalog.regclass
       and c.contype = 'u'
       and pg_catalog.pg_get_constraintdef(c.oid) in (
         'UNIQUE (provider, channel, content_id)',
         'UNIQUE (provider, channel, reserved_schedule_at)'
       )
  loop
    execute pg_catalog.format(
      'alter table public.founder_content_cadence_reservations drop constraint %I',
      legacy_constraint
    );
  end loop;
end
$drop_legacy_cadence_uniques$;

create unique index if not exists founder_content_cadence_active_content_unique
  on public.founder_content_cadence_reservations (provider, channel, content_id)
  where lease_state in ('provisional', 'confirmed');

create unique index if not exists founder_content_cadence_confirmed_slot_unique
  on public.founder_content_cadence_reservations (provider, channel, reserved_schedule_at)
  where lease_state = 'confirmed';

comment on index public.founder_content_cadence_active_content_unique is
  'One active provisional-or-confirmed cadence lease per provider/channel/content identity. Released historical rows do not block a safe retry.';

comment on index public.founder_content_cadence_confirmed_slot_unique is
  'Only execution-confirmed cadence owns an exact provider/channel schedule slot. Provisional candidates are serialized at execution confirmation instead of acting as hour-long authority.';

commit;
