-- Stride: タスク削除の取り消しの整理 (Issue #67)
-- Same behaviour as 0016, with three changes:
-- - restore_deleted_task checks the parents itself. A plan, routine or the
--   source of a carried copy (carried_from) deleted meanwhile now raises
--   23503 (foreign_key_violation) before the insert. Before, the RLS check of
--   tasks_owner_all (0010) ran first and raised 42501, so the screen said
--   "権限がありません". The parents are read under RLS, so another user's row
--   counts as missing, the same as before.
-- - carried_from is read and written with static SQL: 0014 is always applied
--   before this migration.
-- - Both functions pin search_path to '' (every name is schema-qualified),
--   as the Supabase advisor asks for.
-- GRANTs are unchanged: create or replace keeps them, and they are restated.

create or replace function public.delete_task_for_undo(p_task_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task jsonb;
  v_copies uuid[];
begin
  select to_jsonb(t) into v_task
    from public.tasks t
   where t.id = p_task_id
     for update;
  if v_task is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;

  select coalesce(array_agg(c.id order by c.id), '{}'::uuid[]) into v_copies
    from public.tasks c where c.carried_from = p_task_id;

  delete from public.tasks where id = p_task_id;

  return jsonb_build_object('task', v_task, 'carried_copy_ids', to_jsonb(v_copies));
end;
$$;

create or replace function public.restore_deleted_task(
  p_task jsonb,
  p_carried_copy_ids uuid[] default '{}'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_row public.tasks;
  v_restored jsonb;
begin
  if auth.uid() is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;
  if p_task is null or jsonb_typeof(p_task) <> 'object' or p_task->>'id' is null then
    raise exception 'p_task must be a deleted task row' using errcode = '22023';
  end if;

  v_row := jsonb_populate_record(null::public.tasks, p_task);
  if v_row.user_id is distinct from auth.uid() then
    raise exception 'task % belongs to another user', v_row.id using errcode = '42501';
  end if;

  -- Parents deleted meanwhile: report them as such (not as an RLS failure).
  if v_row.plan_id is not null
     and not exists (select 1 from public.plans where id = v_row.plan_id) then
    raise exception 'plan % was deleted', v_row.plan_id using errcode = '23503';
  end if;
  if v_row.routine_id is not null
     and not exists (select 1 from public.routines where id = v_row.routine_id) then
    raise exception 'routine % was deleted', v_row.routine_id using errcode = '23503';
  end if;
  if v_row.carried_from is not null
     and not exists (select 1 from public.tasks where id = v_row.carried_from) then
    raise exception 'task % (carried from) was deleted', v_row.carried_from using errcode = '23503';
  end if;

  -- The skip was recorded by deleting this task; the task comes back, so the
  -- day is no longer skipped. Same transaction as the insert below.
  if v_row.routine_id is not null and v_row.scheduled_date is not null then
    delete from public.routine_skips
     where routine_id = v_row.routine_id
       and date = v_row.scheduled_date;
  end if;

  -- Plain insert: a taken id or (routine_id, scheduled_date) raises 23505.
  insert into public.tasks select (v_row).*;

  if coalesce(cardinality(p_carried_copy_ids), 0) > 0 then
    update public.tasks set carried_from = v_row.id
     where id = any(p_carried_copy_ids) and carried_from is null;
  end if;

  select to_jsonb(t) into v_restored from public.tasks t where t.id = v_row.id;
  return v_restored;
end;
$$;

revoke all on function public.delete_task_for_undo(uuid) from public, anon;
revoke all on function public.restore_deleted_task(jsonb, uuid[]) from public, anon;
grant execute on function public.delete_task_for_undo(uuid) to authenticated;
grant execute on function public.restore_deleted_task(jsonb, uuid[]) to authenticated;
