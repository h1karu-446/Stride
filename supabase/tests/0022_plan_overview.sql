-- Verifies migration 0022 (Issue #70). Everything is rolled back.
-- The file runs 0022 itself (twice, via \ir) inside its transaction, so it
-- works whether or not 0022 has already been applied.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0022_plan_overview.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0022_plan_overview.sql and pipe the
-- result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
insert into auth.users (id, email) values
 ('a2200000-0000-0000-0000-000000000001', 'stride-test-0022-a@example.invalid'),
 ('a2200000-0000-0000-0000-000000000002', 'stride-test-0022-b@example.invalid');
-- A plan that exists before 0022 (when 0022 is not applied yet).
insert into public.plans (id, user_id, name, color, status) values
 ('a2200000-0000-0000-0000-000000000011', 'a2200000-0000-0000-0000-000000000001', 'A plan', 'blue', 'active');

\ir ../migrations/0022_plan_overview.sql
\ir ../migrations/0022_plan_overview.sql

do $$ begin
  if (select atttypid::regtype::text from pg_attribute
       where attrelid = 'public.plans'::regclass and attname = 'overview' and not attisdropped)
     is distinct from 'text' then
    raise exception 'plans.overview must be text';
  end if;
  if (select attnotnull from pg_attribute
       where attrelid = 'public.plans'::regclass and attname = 'overview') then
    raise exception 'plans.overview must be nullable';
  end if;
  if (select count(*) from pg_constraint
       where conrelid = 'public.plans'::regclass and conname = 'plans_overview_length') <> 1 then
    raise exception 'plans_overview_length must exist exactly once';
  end if;
  -- Existing rows are untouched.
  if (select overview from public.plans where id = 'a2200000-0000-0000-0000-000000000011') is not null then
    raise exception 'existing plan must keep overview NULL';
  end if;
  -- GRANT and RLS stay as in 0007.
  if has_table_privilege('anon', 'public.plans', 'select') then raise exception 'anon can select plans'; end if;
  if not has_column_privilege('authenticated', 'public.plans', 'overview', 'select,insert,update') then
    raise exception 'authenticated cannot read / write plans.overview';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.plans'::regclass) then
    raise exception 'RLS disabled on plans';
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'plans'
                  and policyname = 'plans_owner_all') then
    raise exception 'plans_owner_all lost';
  end if;
end $$;

set local role authenticated;

-- User A ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a2200000-0000-0000-0000-000000000001', true);
do $$ begin
  update public.plans set overview = E'## 方針\n- **毎朝** 30分\n- [ ] 模試を受ける'
   where id = 'a2200000-0000-0000-0000-000000000011';
  if (select overview from public.plans where id = 'a2200000-0000-0000-0000-000000000011')
     <> E'## 方針\n- **毎朝** 30分\n- [ ] 模試を受ける' then
    raise exception 'overview not stored as sent';
  end if;

  -- 10000 characters (multibyte) is allowed, 10001 is rejected.
  update public.plans set overview = repeat('あ', 10000) where id = 'a2200000-0000-0000-0000-000000000011';
  begin
    update public.plans set overview = repeat('あ', 10001) where id = 'a2200000-0000-0000-0000-000000000011';
    raise exception 'overview of 10001 characters allowed';
  exception when check_violation then null; end;
  update public.plans set overview = 'mine' where id = 'a2200000-0000-0000-0000-000000000011';
end $$;

-- User B cannot see or change A's overview --------------------------------
select set_config('request.jwt.claim.sub', 'a2200000-0000-0000-0000-000000000002', true);
do $$
declare n int;
begin
  if exists (select 1 from public.plans where id = 'a2200000-0000-0000-0000-000000000011') then
    raise exception 'B can see A plan';
  end if;
  update public.plans set overview = 'B was here' where id = 'a2200000-0000-0000-0000-000000000011';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'B updated A plan overview'; end if;
end $$;

reset role;
do $$ begin
  if (select overview from public.plans where id = 'a2200000-0000-0000-0000-000000000011') <> 'mine' then
    raise exception 'A overview changed by B';
  end if;
end $$;

select '0022_plan_overview: all checks passed' as result;
rollback;
