-- Verifies migration 0018 (Issue #54). Everything is rolled back; existing
-- users and wishes are untouched.
-- The file runs 0018 itself (three times, via \ir) inside its transaction, so
-- it works whether or not 0018 has already been applied. To check the
-- "existing rows get emphasis ON" step, it drops the new columns inside the
-- transaction (the state before 0018), inserts a wish, and runs 0018 again.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0018_wish_importance_emphasis.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0018_wish_importance_emphasis.sql and
-- pipe the result into:
--   docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
\ir ../migrations/0018_wish_importance_emphasis.sql

insert into auth.users (id, email) values
 ('a1800000-0000-0000-0000-000000000001', 'stride-test-0018-a@example.invalid'),
 ('a1800000-0000-0000-0000-000000000002', 'stride-test-0018-b@example.invalid');

-- State before 0018: no importance / emphasize_achievement, old view --------
drop view public.achievements;
alter table public.wishes drop column importance, drop column emphasize_achievement;
insert into public.wishes (id, user_id, title, achieved_at) values
 ('a1800000-0000-0000-0000-000000000011', 'a1800000-0000-0000-0000-000000000001', 'existing achieved', '2026-09-01'),
 ('a1800000-0000-0000-0000-000000000012', 'a1800000-0000-0000-0000-000000000001', 'existing open', null);

\ir ../migrations/0018_wish_importance_emphasis.sql

do $$ begin
 if exists (select 1 from public.wishes where user_id = 'a1800000-0000-0000-0000-000000000001'
            and (importance <> '中' or not emphasize_achievement)) then
   raise exception 'existing wishes must become importance 中 and emphasis ON';
 end if;
end $$;

-- Columns, defaults, constraint, view shape, options and grants -------------
do $$ begin
 if (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'wishes' and column_name = 'emphasize_achievement')
    is distinct from 'false' then
   raise exception 'emphasize_achievement must default to false for new wishes';
 end if;
 if (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'wishes' and column_name = 'importance') <> 'NO'
    or (select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'wishes' and column_name = 'emphasize_achievement') <> 'NO' then
   raise exception 'importance and emphasize_achievement must be not null';
 end if;
 if (select string_agg(attname || ':' || atttypid::regtype::text, ',' order by attnum) from pg_attribute
     where attrelid = 'public.achievements'::regclass and attnum > 0 and not attisdropped)
    is distinct from 'kind:text,id:uuid,user_id:uuid,title:text,achieved_on:date,plan_id:uuid,plan_name:text,plan_color:text,started_at:timestamp with time zone,emphasized:boolean' then
   raise exception 'achievements columns changed unexpectedly';
 end if;
 if not (select coalesce('security_invoker=true' = any(reloptions), false) from pg_class where oid = 'public.achievements'::regclass) then
   raise exception 'DB-50: security_invoker lost';
 end if;
 if has_table_privilege('anon', 'public.achievements', 'select') then raise exception 'DB-53: anon can select'; end if;
 if not has_table_privilege('authenticated', 'public.achievements', 'select') then raise exception 'authenticated cannot select'; end if;
 if has_table_privilege('authenticated', 'public.achievements', 'insert,update,delete,truncate') then
   raise exception 'authenticated has write privileges on achievements';
 end if;
 if has_table_privilege('anon', 'public.wishes', 'select') then raise exception 'DB-53: anon can select wishes'; end if;
end $$;

-- As owner A: defaults for new wishes, constraint, view values --------------
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000001', true);
insert into public.wishes (id, user_id, title) values
 ('a1800000-0000-0000-0000-000000000013', auth.uid(), 'new wish');
do $$ begin
 if (select (importance, emphasize_achievement) from public.wishes where id = 'a1800000-0000-0000-0000-000000000013')
    is distinct from ('中'::text, false) then
   raise exception 'new wishes must default to importance 中 and emphasis OFF';
 end if;
 begin
   update public.wishes set importance = '高' where id = 'a1800000-0000-0000-0000-000000000013';
   raise exception 'importance outside 重/中/軽 was accepted';
 exception when check_violation then null; end;
end $$;
update public.wishes set importance = '重', achieved_at = '2026-09-02'
 where id = 'a1800000-0000-0000-0000-000000000013';
insert into public.plans (id, user_id, name, color, status, completed_at) values
 ('a1800000-0000-0000-0000-000000000021', auth.uid(), 'done plan', 'blue', 'done', '2026-09-03');
do $$ begin
 if (select emphasized from public.achievements where kind = 'wish' and id = 'a1800000-0000-0000-0000-000000000011') is distinct from true then
   raise exception 'existing achieved wish must stay emphasized';
 end if;
 if (select emphasized from public.achievements where kind = 'wish' and id = 'a1800000-0000-0000-0000-000000000013') is distinct from false then
   raise exception 'new achieved wish must not be emphasized';
 end if;
 if exists (select 1 from public.achievements where kind <> 'wish' and emphasized is not null) then
   raise exception 'emphasized must be null except for wishes';
 end if;
 if (select count(*) from public.achievements where kind = 'wish') <> 2 then
   raise exception 'DB-60: only achieved wishes are listed';
 end if;
end $$;
-- Toggling emphasis is reflected at once; the achieved date is unchanged.
update public.wishes set emphasize_achievement = true where id = 'a1800000-0000-0000-0000-000000000013';
do $$ begin
 if (select (emphasized, achieved_on) from public.achievements where id = 'a1800000-0000-0000-0000-000000000013')
    is distinct from (true, date '2026-09-02') then
   raise exception 'emphasis toggle must be reflected without changing the date';
 end if;
end $$;
-- Keep one existing wish OFF to prove a re-run does not reset values.
update public.wishes set emphasize_achievement = false where id = 'a1800000-0000-0000-0000-000000000011';

-- As owner B: nothing of A is visible or writable (DB-50) -------------------
select set_config('request.jwt.claim.sub', 'a1800000-0000-0000-0000-000000000002', true);
do $$ begin
 if exists (select 1 from public.achievements) or exists (select 1 from public.wishes) then
   raise exception 'DB-50: another owner visible';
 end if;
 update public.wishes set emphasize_achievement = true, importance = '軽';
 if found then raise exception 'DB-50: another owner updated'; end if;
end $$;

-- Anonymous access is refused (DB-53) ---------------------------------------
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$ begin
 begin
   perform * from public.achievements;
   raise exception 'DB-53: anon achievements access allowed';
 exception when insufficient_privilege then null; end;
 begin
   perform * from public.wishes;
   raise exception 'DB-53: anon wishes access allowed';
 exception when insufficient_privilege then null; end;
end $$;
reset role;

-- A re-run keeps every stored value and the defaults ------------------------
\ir ../migrations/0018_wish_importance_emphasis.sql
do $$ begin
 if (select string_agg(title || ':' || importance || ':' || emphasize_achievement, ',' order by title)
     from public.wishes where user_id = 'a1800000-0000-0000-0000-000000000001')
    is distinct from 'existing achieved:中:false,existing open:中:true,new wish:重:true' then
   raise exception 're-running 0018 changed stored values';
 end if;
 if (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'wishes' and column_name = 'emphasize_achievement')
    is distinct from 'false' then
   raise exception 're-running 0018 changed the default';
 end if;
 if not (select coalesce('security_invoker=true' = any(reloptions), false) from pg_class where oid = 'public.achievements'::regclass)
    or has_table_privilege('anon', 'public.achievements', 'select') then
   raise exception 're-running 0018 changed view options or grants';
 end if;
end $$;
rollback;
\echo 'PASS 0018: existing wishes ON / 中, new wishes OFF / 中, importance check, view columns and types, security_invoker, grants, DB-50, DB-53, idempotent.'
