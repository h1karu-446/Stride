-- Run with psql -v ON_ERROR_STOP=1 after migrations 0001..0012.
-- All fixtures and mutations are rolled back; existing users are untouched.
begin;
do $$ begin
 if (select atttypid::regtype::text from pg_attribute
     where attrelid = 'public.achievements'::regclass and attname = 'started_at' and not attisdropped)
    is distinct from 'timestamp with time zone' then
   raise exception 'started_at must be timestamptz';
 end if;
 if exists (select 1 from pg_attribute where attrelid = 'public.achievements'::regclass and attname = 'started_on' and not attisdropped) then
   raise exception 'started_on must be gone';
 end if;
 if not (select coalesce('security_invoker=true' = any(reloptions), false) from pg_class where oid = 'public.achievements'::regclass) then
   raise exception 'DB-50: security_invoker lost';
 end if;
 if has_table_privilege('anon', 'public.achievements', 'select') then raise exception 'DB-53: anon can select'; end if;
 if not has_table_privilege('authenticated', 'public.achievements', 'select') then raise exception 'authenticated cannot select'; end if;
 if has_table_privilege('authenticated', 'public.achievements', 'insert,update,delete,truncate') then
   raise exception 'authenticated has write privileges';
 end if;
end $$;
insert into auth.users (id, email) values
 ('a1200000-0000-0000-0000-000000000001', 'stride-test-0012-a@example.invalid'),
 ('a1200000-0000-0000-0000-000000000002', 'stride-test-0012-b@example.invalid');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1200000-0000-0000-0000-000000000001', true);
-- 2026-03-31 20:30 UTC is 2026-04-01 05:30 JST: the UTC date is a different day and month.
insert into public.plans (id, user_id, name, color, status, completed_at, created_at) values
 ('a1200000-0000-0000-0000-000000000021', auth.uid(), 'done plan', 'blue', 'done', '2026-08-15', '2026-03-31 20:30:00+00');
insert into public.tasks (id, user_id, plan_id, title, importance, scheduled_date, completed, is_milestone) values
 ('a1200000-0000-0000-0000-000000000041', auth.uid(), 'a1200000-0000-0000-0000-000000000021', 'milestone', '中', current_date, true, true);
do $$ begin
 if (select started_at from public.achievements where kind = 'plan' and id = 'a1200000-0000-0000-0000-000000000021')
    is distinct from '2026-03-31 20:30:00+00'::timestamptz then
   raise exception 'plan started_at must equal plans.created_at';
 end if;
 if exists (select 1 from public.achievements where kind <> 'plan' and started_at is not null) then
   raise exception 'started_at must be null except for plans';
 end if;
end $$;
select set_config('request.jwt.claim.sub', 'a1200000-0000-0000-0000-000000000002', true);
do $$ begin
 if exists (select 1 from public.achievements) then raise exception 'DB-50: another owner visible'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
 begin
   perform * from public.achievements;
   raise exception 'DB-53: anon achievements access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
\echo 'PASS 0012: started_at is timestamptz (= plans.created_at), security_invoker, grants, DB-50, DB-53.'
