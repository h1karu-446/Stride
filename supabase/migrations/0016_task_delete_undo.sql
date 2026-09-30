-- Stride: undo a task deleted on Today (Issue #56)
-- Deleting stays immediate (no delayed DELETE that depends on the tab staying
-- open). Undo puts the same row back:
-- - delete_task_for_undo(p_task_id) locks the row, keeps it as jsonb (every
--   column, so later columns are kept too) and the ids of copies that point
--   at it through carried_from (0014), then deletes it. The delete triggers run
--   as before: tasks_record_routine_skip records the skip (ADR-0003) and the
--   day's score is recalculated.
-- - restore_deleted_task(p_task, p_carried_copy_ids) inserts the row with the
--   same id / owner / values and, in the same transaction, removes the
--   routine_skips row of (routine_id, scheduled_date) and relinks the copies.
--   If the id or the (routine_id, scheduled_date) slot is taken meanwhile
--   (another device), the unique index raises and nothing changes: no
--   overwrite. A plan / routine deleted meanwhile raises a FK error the same way.
-- Both are security invoker: RLS on tasks / routine_skips applies as it does
-- to direct API calls, so a caller cannot read, delete or restore someone
-- else's task. carried_from is read through dynamic SQL so these functions do
-- not depend on whether 0014 is applied.

create or replace function public.delete_task_for_undo(p_task_id uuid)
returns jsonb
language plpgsql
security invoker
as $$
declare
  v_task jsonb;
  v_copies uuid[] := '{}';
begin
  select to_jsonb(t) into v_task
    from public.tasks t
   where t.id = p_task_id
     for update;
  if v_task is null then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;

  if v_task ? 'carried_from' then
    execute 'select coalesce(array_agg(c.id order by c.id), ''{}''::uuid[])
               from public.tasks c where c.carried_from = $1'
       into v_copies
      using p_task_id;
  end if;

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
    execute 'update public.tasks set carried_from = $1
              where id = any($2) and carried_from is null'
      using v_row.id, p_carried_copy_ids;
  end if;

  select to_jsonb(t) into v_restored from public.tasks t where t.id = v_row.id;
  return v_restored;
end;
$$;

revoke all on function public.delete_task_for_undo(uuid) from public, anon;
revoke all on function public.restore_deleted_task(jsonb, uuid[]) from public, anon;
grant execute on function public.delete_task_for_undo(uuid) to authenticated;
grant execute on function public.restore_deleted_task(jsonb, uuid[]) to authenticated;
