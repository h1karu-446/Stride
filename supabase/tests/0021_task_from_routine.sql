-- Verifies migration 0021. Everything is rolled back.
-- The file runs 0021 itself (twice, via \ir) inside its transaction, so it
-- works whether or not 0021 has already been applied.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0021_task_from_routine.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0021_task_from_routine.sql and pipe the
-- result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
insert into auth.users (id, email) values
 ('a2100000-0000-0000-0000-000000000001', 'stride-test-0021@example.invalid');
insert into public.plans (id, user_id, name, color, status) values
 ('a2100000-0000-0000-0000-000000000011', 'a2100000-0000-0000-0000-000000000001', 'Plan', 'blue', 'active');
insert into public.routines (id, user_id, phase_id, title, minutes)
select 'a2100000-0000-0000-0000-000000000021', user_id, id, 'Linked menu', 30
  from public.phases where plan_id = 'a2100000-0000-0000-0000-000000000011' and is_implicit;

-- Rows that exist before 0021 (plain inserts never name from_routine):
-- a routine task whose menu was already deleted, a schedule, and an
-- overdue schedule's copy.
insert into public.tasks (id, user_id, title, importance, scheduled_date, plan_id, planned_minutes, carried_from) values
 ('a2100000-0000-0000-0000-000000000031', 'a2100000-0000-0000-0000-000000000001', 'Orphaned routine task', '中', current_date - 3,
  'a2100000-0000-0000-0000-000000000011', 60, null),
 ('a2100000-0000-0000-0000-000000000032', 'a2100000-0000-0000-0000-000000000001', 'Schedule', '中', current_date - 3,
  'a2100000-0000-0000-0000-000000000011', null, null),
 ('a2100000-0000-0000-0000-000000000033', 'a2100000-0000-0000-0000-000000000001', 'Copy', '中', current_date,
  'a2100000-0000-0000-0000-000000000011', 60, 'a2100000-0000-0000-0000-000000000032'),
 ('a2100000-0000-0000-0000-000000000034', 'a2100000-0000-0000-0000-000000000001', 'Manual', '中', current_date,
  null, 45, null);

\ir ../migrations/0021_task_from_routine.sql
\ir ../migrations/0021_task_from_routine.sql

do $$ begin
  if (select attnotnull from pg_attribute
       where attrelid = 'public.tasks'::regclass and attname = 'from_routine' and not attisdropped)
     is distinct from true then
    raise exception 'tasks.from_routine must be not null';
  end if;
  if not (select from_routine from public.tasks where id = 'a2100000-0000-0000-0000-000000000031') then
    raise exception 'orphaned routine task was not backfilled';
  end if;
  if (select from_routine from public.tasks where id = 'a2100000-0000-0000-0000-000000000032')
     or (select from_routine from public.tasks where id = 'a2100000-0000-0000-0000-000000000033')
     or (select from_routine from public.tasks where id = 'a2100000-0000-0000-0000-000000000034') then
    raise exception 'schedule, copy or manual task was marked as a routine task';
  end if;
end $$;

-- As the user: generation sets the flag, and deleting the menu keeps it.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2100000-0000-0000-0000-000000000001', true);
select public.generate_routine_tasks(current_date);

do $$
declare
  t uuid;
begin
  select id into t from public.tasks
   where routine_id = 'a2100000-0000-0000-0000-000000000021' and scheduled_date = current_date;
  if t is null then raise exception 'routine task was not generated'; end if;
  if not (select from_routine from public.tasks where id = t) then
    raise exception 'generated task must have from_routine = true';
  end if;

  delete from public.routines where id = 'a2100000-0000-0000-0000-000000000021';
  if not exists (select 1 from public.tasks where id = t and routine_id is null and from_routine) then
    raise exception 'task must stay a routine task after its menu is deleted';
  end if;

  -- Any row with routine_id gets the flag, even when the insert omits it.
  insert into public.routines (id, user_id, phase_id, title)
  select 'a2100000-0000-0000-0000-000000000022', auth.uid(), id, 'Another'
    from public.phases where plan_id = 'a2100000-0000-0000-0000-000000000011' and is_implicit;
  insert into public.tasks (id, user_id, title, importance, scheduled_date, plan_id, routine_id, from_routine)
  values ('a2100000-0000-0000-0000-000000000035', auth.uid(), 'Inserted', '中', current_date + 1,
          'a2100000-0000-0000-0000-000000000011', 'a2100000-0000-0000-0000-000000000022', false);
  if not (select from_routine from public.tasks where id = 'a2100000-0000-0000-0000-000000000035') then
    raise exception 'routine_id must imply from_routine';
  end if;
  -- An update cannot clear the flag of a routine task either.
  update public.tasks set from_routine = false where id = 'a2100000-0000-0000-0000-000000000035';
  if not (select from_routine from public.tasks where id = 'a2100000-0000-0000-0000-000000000035') then
    raise exception 'update cleared from_routine of a routine task';
  end if;
end $$;

-- Delete with undo keeps the flag (restore_deleted_task reinserts the row).
do $$
declare
  t uuid;
  v jsonb;
begin
  select id into t from public.tasks
   where title = 'Linked menu' and scheduled_date = current_date;
  v := public.delete_task_for_undo(t);
  perform public.restore_deleted_task(v->'task', array[]::uuid[]);
  if not (select from_routine from public.tasks where id = t) then
    raise exception 'restored task lost from_routine';
  end if;
  -- A row saved before 0021 has no from_routine key: restored as false.
  v := public.delete_task_for_undo('a2100000-0000-0000-0000-000000000032');
  perform public.restore_deleted_task((v->'task') - 'from_routine', array[]::uuid[]);
  if (select from_routine from public.tasks where id = 'a2100000-0000-0000-0000-000000000032') is distinct from false then
    raise exception 'restoring a pre-0021 row must give from_routine = false';
  end if;
end $$;

rollback;
