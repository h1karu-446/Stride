-- Run with psql -v ON_ERROR_STOP=1 after migrations 0001..0016 (Issue #56).
-- All fixtures and mutations are rolled back; existing users are untouched.
-- A = ...0001 owns plan P (routine R) and the tasks below. B = ...0002.
begin;
insert into auth.users (id, email) values
 ('a1600000-0000-0000-0000-000000000001', 'stride-test-0016-a@example.invalid'),
 ('a1600000-0000-0000-0000-000000000002', 'stride-test-0016-b@example.invalid');
set local role authenticated;

-- User A: fixtures ----------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1600000-0000-0000-0000-000000000001', true);
insert into public.plans (id, user_id, name, color, status) values
 ('a1600000-0000-0000-0000-000000000011', auth.uid(), 'P', 'blue', 'active');
insert into public.routines (id, user_id, phase_id, title, importance, minutes, menu)
select 'a1600000-0000-0000-0000-000000000021', auth.uid(), ph.id, 'R', '重', 30, 'menu'
  from public.phases ph
 where ph.plan_id = 'a1600000-0000-0000-0000-000000000011' and ph.is_implicit;

-- Today's routine task of R
select public.generate_routine_tasks(current_date);

insert into public.tasks
  (id, user_id, title, importance, scheduled_date, start_time, end_time,
   completed, memo, plan_id, planned_minutes, is_milestone, created_at)
values
 -- manual task with times, completed
 ('a1600000-0000-0000-0000-000000000101', auth.uid(), 'manual', '中', current_date,
  '09:00', '10:30', true, 'memo', null, null, false, now() - interval '3 days'),
 -- plan schedule, completed milestone
 ('a1600000-0000-0000-0000-000000000102', auth.uid(), 'milestone', '軽', current_date,
  null, null, true, null, 'a1600000-0000-0000-0000-000000000011', 45, true, now() - interval '2 days'),
 -- overdue schedule and its carried-over copy (0014)
 ('a1600000-0000-0000-0000-000000000103', auth.uid(), 'overdue', '中', current_date - 1,
  null, null, false, null, 'a1600000-0000-0000-0000-000000000011', null, false, now() - interval '1 day');
insert into public.tasks (id, user_id, title, importance, scheduled_date, plan_id, carried_from)
values ('a1600000-0000-0000-0000-000000000104', auth.uid(), 'overdue', '中', current_date,
        'a1600000-0000-0000-0000-000000000011', 'a1600000-0000-0000-0000-000000000103');

insert into public.daily_reviews (user_id, date, fulfillment)
values (auth.uid(), current_date, 3);

do $$
declare
  v_before jsonb;
  v_res jsonb;
  v_after jsonb;
  v_score_before numeric;
  v_score_mid numeric;
  v_score_after numeric;
  v_routine_task jsonb;
  n integer;
begin
  -- Manual task: delete -> undo restores the identical row and the score ----
  select to_jsonb(t) into v_before from public.tasks t
   where id = 'a1600000-0000-0000-0000-000000000101';
  select total_score into v_score_before from public.daily_reviews
   where user_id = auth.uid() and date = current_date;

  v_res := public.delete_task_for_undo('a1600000-0000-0000-0000-000000000101');
  if v_res->'task' is distinct from v_before then
    raise exception 'delete: snapshot differs: % vs %', v_res->'task', v_before;
  end if;
  if v_res->'carried_copy_ids' <> '[]'::jsonb then
    raise exception 'delete: unexpected copies %', v_res->'carried_copy_ids';
  end if;
  if exists (select 1 from public.tasks where id = 'a1600000-0000-0000-0000-000000000101') then
    raise exception 'delete: row still exists';
  end if;
  select total_score into v_score_mid from public.daily_reviews
   where user_id = auth.uid() and date = current_date;
  if v_score_mid is not distinct from v_score_before then
    raise exception 'delete: score was not recalculated (%)', v_score_mid;
  end if;

  v_after := public.restore_deleted_task(v_res->'task', array[]::uuid[]);
  if v_after is distinct from v_before then
    raise exception 'restore: row differs: % vs %', v_after, v_before;
  end if;
  select total_score into v_score_after from public.daily_reviews
   where user_id = auth.uid() and date = current_date;
  if v_score_after is distinct from v_score_before then
    raise exception 'restore: score % -> %', v_score_before, v_score_after;
  end if;

  -- Restoring the same snapshot twice (another device) fails, no overwrite
  begin
    perform public.restore_deleted_task(v_res->'task', array[]::uuid[]);
    raise exception 'restore twice succeeded';
  exception when unique_violation then null; end;

  -- Milestone schedule: all columns including plan_id / is_milestone -------
  select to_jsonb(t) into v_before from public.tasks t
   where id = 'a1600000-0000-0000-0000-000000000102';
  v_res := public.delete_task_for_undo('a1600000-0000-0000-0000-000000000102');
  if exists (select 1 from public.achievements where kind = 'milestone'
              and id = 'a1600000-0000-0000-0000-000000000102') then
    raise exception 'milestone still in achievements after delete';
  end if;
  v_after := public.restore_deleted_task(v_res->'task');
  if v_after is distinct from v_before then
    raise exception 'restore milestone: % vs %', v_after, v_before;
  end if;
  if not exists (select 1 from public.achievements where kind = 'milestone'
                  and id = 'a1600000-0000-0000-0000-000000000102') then
    raise exception 'milestone missing from achievements after restore';
  end if;

  -- Routine task: skip is recorded on delete and removed on undo -----------
  select to_jsonb(t) into v_routine_task from public.tasks t
   where routine_id = 'a1600000-0000-0000-0000-000000000021' and scheduled_date = current_date;
  v_res := public.delete_task_for_undo((v_routine_task->>'id')::uuid);
  if not exists (select 1 from public.routine_skips
                  where routine_id = 'a1600000-0000-0000-0000-000000000021'
                    and date = current_date) then
    raise exception 'routine delete: skip not recorded';
  end if;
  if public.generate_routine_tasks(current_date) <> 0 then
    raise exception 'routine delete: task was generated again';
  end if;
  v_after := public.restore_deleted_task(v_res->'task');
  if v_after is distinct from v_routine_task then
    raise exception 'routine restore: % vs %', v_after, v_routine_task;
  end if;
  if exists (select 1 from public.routine_skips
              where routine_id = 'a1600000-0000-0000-0000-000000000021') then
    raise exception 'routine restore: skip remains';
  end if;
  if public.generate_routine_tasks(current_date) <> 0 then
    raise exception 'routine restore: a second task was generated';
  end if;

  -- Routine slot taken meanwhile: restore fails and the skip stays ---------
  v_res := public.delete_task_for_undo((v_routine_task->>'id')::uuid);
  insert into public.tasks (user_id, title, importance, scheduled_date, routine_id)
  values (auth.uid(), 'other device', '中', current_date,
          'a1600000-0000-0000-0000-000000000021');
  begin
    perform public.restore_deleted_task(v_res->'task');
    raise exception 'restore into a taken routine slot succeeded';
  exception when unique_violation then null; end;
  if not exists (select 1 from public.routine_skips
                  where routine_id = 'a1600000-0000-0000-0000-000000000021'
                    and date = current_date) then
    raise exception 'failed restore removed the skip';
  end if;
  if exists (select 1 from public.tasks where id = (v_routine_task->>'id')::uuid) then
    raise exception 'failed restore left the row';
  end if;

  -- Carried-over original: the copy is unlinked on delete, relinked on undo -
  select to_jsonb(t) into v_before from public.tasks t
   where id = 'a1600000-0000-0000-0000-000000000103';
  v_res := public.delete_task_for_undo('a1600000-0000-0000-0000-000000000103');
  if v_res->'carried_copy_ids' <> '["a1600000-0000-0000-0000-000000000104"]'::jsonb then
    raise exception 'carried: copies %', v_res->'carried_copy_ids';
  end if;
  if (select carried_from from public.tasks
       where id = 'a1600000-0000-0000-0000-000000000104') is not null then
    raise exception 'carried: copy still linked after delete';
  end if;
  v_after := public.restore_deleted_task(
    v_res->'task',
    array(select jsonb_array_elements_text(v_res->'carried_copy_ids'))::uuid[]);
  if v_after is distinct from v_before then
    raise exception 'carried restore: % vs %', v_after, v_before;
  end if;
  if (select carried_from from public.tasks
       where id = 'a1600000-0000-0000-0000-000000000104')
     is distinct from 'a1600000-0000-0000-0000-000000000103'::uuid then
    raise exception 'carried: copy not relinked';
  end if;

  -- Bad input
  begin
    perform public.restore_deleted_task('{}'::jsonb);
    raise exception 'restore of an empty object succeeded';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.delete_task_for_undo('a1600000-0000-0000-0000-000000000999');
    raise exception 'delete of a missing task succeeded';
  exception when no_data_found then null; end;
end $$;

-- User B: cannot delete or restore A's tasks ---------------------------------
select set_config('request.jwt.claim.sub', 'a1600000-0000-0000-0000-000000000002', true);
do $$
declare
  v_snapshot jsonb;
begin
  begin
    perform public.delete_task_for_undo('a1600000-0000-0000-0000-000000000101');
    raise exception 'B deleted A task';
  exception when no_data_found then null; end;

  -- A snapshot of A's task (e.g. guessed) cannot be restored as A ...
  v_snapshot := jsonb_build_object(
    'id', 'a1600000-0000-0000-0000-000000000201',
    'user_id', 'a1600000-0000-0000-0000-000000000001',
    'title', 'x', 'importance', '中', 'scheduled_date', current_date,
    'completed', false, 'is_milestone', false,
    'created_at', now(), 'updated_at', now());
  begin
    perform public.restore_deleted_task(v_snapshot);
    raise exception 'B restored a task owned by A';
  exception when insufficient_privilege then null; end;

  -- ... nor as B onto A's plan (RLS with check) or A's existing id (no overwrite)
  begin
    perform public.restore_deleted_task(v_snapshot
      || jsonb_build_object('user_id', auth.uid(),
                            'plan_id', 'a1600000-0000-0000-0000-000000000011'));
    raise exception 'B restored a task onto A plan';
  exception when insufficient_privilege then null; end;
  begin
    perform public.restore_deleted_task(v_snapshot
      || jsonb_build_object('user_id', auth.uid(),
                            'id', 'a1600000-0000-0000-0000-000000000101'));
    raise exception 'B overwrote A task id';
  exception when unique_violation then null; end;
end $$;

-- anon cannot call either function
reset role;
set local role anon;
do $$
begin
  begin
    perform public.delete_task_for_undo('a1600000-0000-0000-0000-000000000101');
    raise exception 'anon called delete_task_for_undo';
  exception when insufficient_privilege then null; end;
  begin
    perform public.restore_deleted_task('{"id": "a1600000-0000-0000-0000-000000000101"}'::jsonb);
    raise exception 'anon called restore_deleted_task';
  exception when insufficient_privilege then null; end;
end $$;

reset role;
do $$
begin
  if (select count(*) from public.tasks
       where id = 'a1600000-0000-0000-0000-000000000101'
         and user_id = 'a1600000-0000-0000-0000-000000000001'
         and title = 'manual') <> 1 then
    raise exception 'A task changed by B';
  end if;
  raise notice 'PASS: 0016 task delete undo';
end $$;
rollback;
