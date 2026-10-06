-- Verifies migration 0024 (Issue #67). Everything is rolled back.
-- The file runs 0024 itself (twice, via \ir) inside its transaction. Run
-- supabase/tests/0016_task_delete_undo.sql afterwards (with 0024 applied) for
-- the full delete / undo regression.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0024_task_undo_cleanup.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0024_task_undo_cleanup.sql and pipe the
-- result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
insert into auth.users (id, email) values
 ('a2400000-0000-0000-0000-000000000001', 'stride-test-0024-a@example.invalid');

\ir ../migrations/0024_task_undo_cleanup.sql
\ir ../migrations/0024_task_undo_cleanup.sql

do $$ begin
  if exists (select 1 from pg_proc
              where oid in ('public.delete_task_for_undo(uuid)'::regprocedure,
                            'public.restore_deleted_task(jsonb, uuid[])'::regprocedure)
                and (proconfig is null or not ('search_path=""' = any(proconfig)))) then
    raise exception 'search_path must be pinned to empty on both functions';
  end if;
  if exists (select 1 from pg_proc
              where oid in ('public.delete_task_for_undo(uuid)'::regprocedure,
                            'public.restore_deleted_task(jsonb, uuid[])'::regprocedure)
                and (prosrc ilike '%execute %' or prosecdef)) then
    raise exception 'no dynamic SQL and no security definer expected';
  end if;
  if has_function_privilege('anon', 'public.restore_deleted_task(jsonb, uuid[])', 'execute')
     or not has_function_privilege('authenticated', 'public.restore_deleted_task(jsonb, uuid[])', 'execute') then
    raise exception 'grants changed';
  end if;
end $$;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a2400000-0000-0000-0000-000000000001', true);
insert into public.plans (id, user_id, name, color, status) values
 ('a2400000-0000-0000-0000-000000000011', auth.uid(), 'P', 'blue', 'active'),
 ('a2400000-0000-0000-0000-000000000012', auth.uid(), 'Q', 'pink', 'active');
insert into public.routines (id, user_id, phase_id, title, importance, minutes, menu)
select 'a2400000-0000-0000-0000-000000000021', auth.uid(), ph.id, 'R', '重', 30, null
  from public.phases ph
 where ph.plan_id = 'a2400000-0000-0000-0000-000000000012' and ph.is_implicit;
select public.generate_routine_tasks(current_date);
insert into public.tasks (id, user_id, title, importance, scheduled_date, plan_id) values
 ('a2400000-0000-0000-0000-000000000101', auth.uid(), 'schedule', '中', current_date,
  'a2400000-0000-0000-0000-000000000011'),
 ('a2400000-0000-0000-0000-000000000102', auth.uid(), 'overdue', '中', current_date - 1, null);
insert into public.tasks (id, user_id, title, importance, scheduled_date, carried_from) values
 ('a2400000-0000-0000-0000-000000000103', auth.uid(), 'overdue', '中', current_date,
  'a2400000-0000-0000-0000-000000000102');

do $$
declare
  v_res jsonb;
  v_routine_task uuid;
begin
  -- Carried copies are found and relinked with static SQL.
  v_res := public.delete_task_for_undo('a2400000-0000-0000-0000-000000000102');
  if v_res->'carried_copy_ids' <> '["a2400000-0000-0000-0000-000000000103"]'::jsonb then
    raise exception 'copies not returned: %', v_res->'carried_copy_ids';
  end if;
  perform public.restore_deleted_task(v_res->'task',
    array['a2400000-0000-0000-0000-000000000103']::uuid[]);
  if (select carried_from from public.tasks where id = 'a2400000-0000-0000-0000-000000000103')
     is distinct from 'a2400000-0000-0000-0000-000000000102'::uuid then
    raise exception 'copy not relinked';
  end if;

  -- The plan is deleted meanwhile: 23503, not 42501.
  v_res := public.delete_task_for_undo('a2400000-0000-0000-0000-000000000101');
  delete from public.plans where id = 'a2400000-0000-0000-0000-000000000011';
  begin
    perform public.restore_deleted_task(v_res->'task', array[]::uuid[]);
    raise exception 'restored onto a deleted plan';
  exception when foreign_key_violation then null; end;

  -- The routine is deleted meanwhile: 23503, and nothing is inserted.
  select id into v_routine_task from public.tasks
   where routine_id = 'a2400000-0000-0000-0000-000000000021' and scheduled_date = current_date;
  v_res := public.delete_task_for_undo(v_routine_task);
  delete from public.routines where id = 'a2400000-0000-0000-0000-000000000021';
  begin
    perform public.restore_deleted_task(v_res->'task', array[]::uuid[]);
    raise exception 'restored onto a deleted routine';
  exception when foreign_key_violation then null; end;
  if exists (select 1 from public.tasks where id = v_routine_task) then
    raise exception 'the task came back although the routine was deleted';
  end if;

  -- The source of a carried copy is deleted meanwhile: 23503.
  v_res := public.delete_task_for_undo('a2400000-0000-0000-0000-000000000103');
  delete from public.tasks where id = 'a2400000-0000-0000-0000-000000000102';
  begin
    perform public.restore_deleted_task(v_res->'task', array[]::uuid[]);
    raise exception 'restored a copy whose source was deleted';
  exception when foreign_key_violation then null; end;
end $$;

reset role;
select '0024_task_undo_cleanup: all checks passed' as result;
rollback;
