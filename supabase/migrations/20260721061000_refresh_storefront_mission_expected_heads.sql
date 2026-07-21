-- Refresh storefront mission expected heads after reviewed CI budget-mode patches.
--
-- This migration intentionally updates only the three known storefront missions,
-- preserves sandboxed status, and guards each write by the previous expected head.
-- It creates no evidence rows, terminal rows, approvals, merge authority, deployment
-- authority, commercial consent, secrets access, or customer/vendor data access.

do $$
declare
  updated_count integer;
begin
  update public.missions
  set
    policy_snapshot = jsonb_set(
      policy_snapshot,
      '{expectedHeadSha}',
      to_jsonb(case id
        when 'ae933e98-ec1d-4a94-b9de-804c4fa78ab8'::uuid then '94ce1b365e38718b1a8372759d6f94909cbf08de'
        when '887083a2-e347-4b5f-9f11-758117752c46'::uuid then '698fe6298eb6b30d0c803fac3970690644ccbc1e'
        when '07e07483-cb88-4ac5-9952-32fbb051f8d5'::uuid then 'd534a2f2fa75e7a8bfa5ffe26a814cf4e9decb18'
      end),
      false
    ),
    updated_at = now()
  where status = 'sandboxed'
    and branch_ref = 'codex/blend-brand-moat'
    and (
      (id = 'ae933e98-ec1d-4a94-b9de-804c4fa78ab8'::uuid
        and policy_snapshot->>'repository' = 'jussray/jbh-private'
        and policy_snapshot->>'pullRequestNumber' = '9'
        and policy_snapshot->>'expectedHeadSha' = 'a77bdcd4314eb9753da6354ffd35d17df5ba6927')
      or
      (id = '887083a2-e347-4b5f-9f11-758117752c46'::uuid
        and policy_snapshot->>'repository' = 'jussray/jussbeautifulhair-site'
        and policy_snapshot->>'pullRequestNumber' = '18'
        and policy_snapshot->>'expectedHeadSha' = '9444483d63d1d10823b80323f3b4c796b444be0c')
      or
      (id = '07e07483-cb88-4ac5-9952-32fbb051f8d5'::uuid
        and policy_snapshot->>'repository' = 'jussray/untold-stories-storefront'
        and policy_snapshot->>'pullRequestNumber' = '17'
        and policy_snapshot->>'expectedHeadSha' = 'eb23d6e364a483b28e0ea8d6577d050b293b9930')
    );

  get diagnostics updated_count = row_count;

  if updated_count <> 3 then
    raise exception 'expected to refresh exactly 3 sandboxed storefront mission heads, updated %', updated_count;
  end if;
end $$;
