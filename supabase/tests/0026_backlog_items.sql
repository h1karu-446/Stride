-- Verifies migration 0026 (Issue #83). Everything is rolled back.
-- The file runs 0026 itself (twice, via \ir) inside its transaction, so it
-- works whether or not 0026 has already been applied.
--
-- Run from a psql that can read this repository:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/0026_backlog_items.sql
-- With only the Docker container (no host psql), replace each \ir line with
-- the contents of supabase/migrations/0026_backlog_items.sql and pipe the
-- result into: docker exec -i supabase_db_Stride psql -v ON_ERROR_STOP=1 -U postgres -d postgres
begin;
insert into auth.users (id, email) values
 ('a2600000-0000-0000-0000-000000000001', 'stride-test-0026-a@example.invalid'),
 ('a2600000-0000-0000-0000-000000000002', 'stride-test-0026-b@example.invalid');

\ir ../migrations/0026_backlog_items.sql
\ir ../migrations/0026_backlog_items.sql

do $$ begin
  if has_table_privilege('anon', 'public.backlog_items', 'select') then
    raise exception 'anon can read backlog_items';
  end if;
  if has_function_privilege('anon', 'public.schedule_backlog_item(uuid, date, time, time)', 'execute')
     or has_function_privilege('anon', 'public.unschedule_task(uuid)', 'execute') then
    raise exception 'anon can execute the backlog functions';
  end if;
end $$;

set local role authenticated;

-- User A ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a2600000-0000-0000-0000-000000000001', true);
do $$
declare
  me uuid := 'a2600000-0000-0000-0000-000000000001';
  item uuid;
  item2 uuid;
  t uuid;
  back uuid;
begin
  -- Shape: blank title and unknown importance are rejected.
  begin
    insert into public.backlog_items (user_id, title) values (me, '   ');
    raise exception 'blank title accepted';
  exception when check_violation then null; end;
  begin
    insert into public.backlog_items (user_id, title, importance) values (me, 'x', '超');
    raise exception 'unknown importance accepted';
  exception when check_violation then null; end;

  insert into public.backlog_items (user_id, title, importance, deadline, memo)
  values (me, 'Item', '重', current_date + 3, 'note') returning id into item;
  insert into public.backlog_items (user_id, title) values (me, 'Item 2') returning id into item2;
  if (select importance from public.backlog_items where id = item2) <> '中' then
    raise exception 'importance must default to 中';
  end if;

  -- Items are not scored: today's review has nothing scheduled.
  if exists (select 1 from public.tasks where user_id = me) then
    raise exception 'an item became a task';
  end if;

  -- Range and times.
  begin
    perform public.schedule_backlog_item(item, current_date - 2);
    raise exception 'scheduled two days ago';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.schedule_backlog_item(item, current_date, '09:00', null);
    raise exception 'only a start time accepted';
  exception when invalid_parameter_value then null; end;
  begin
    perform public.schedule_backlog_item(item, current_date, '15:00', '09:00');
    raise exception 'an end before the start accepted';
  exception when invalid_parameter_value then null; end;
  if not exists (select 1 from public.backlog_items where id = item) then
    raise exception 'a failed move removed the item';
  end if;

  -- Move to today with times: one task, the item is gone.
  t := public.schedule_backlog_item(item, current_date, '09:00', '10:00');
  if (select (title, importance, memo, scheduled_date, start_time, end_time, completed,
              plan_id, routine_id, from_routine)
        from public.tasks where id = t)
     is distinct from ('Item'::text, '重'::text, 'note'::text, current_date, '09:00'::time,
                       '10:00'::time, false, null::uuid, null::uuid, false) then
    raise exception 'the moved task differs from the item';
  end if;
  if exists (select 1 from public.backlog_items where id = item) then
    raise exception 'the moved item is still listed';
  end if;

  -- Move to a future day without times.
  perform public.schedule_backlog_item(item2, current_date + 10);
  if not exists (select 1 from public.tasks
                  where title = 'Item 2' and scheduled_date = current_date + 10
                    and start_time is null and end_time is null) then
    raise exception 'the future move failed';
  end if;

  -- Moving a missing item.
  begin
    perform public.schedule_backlog_item(item, current_date);
    raise exception 'a moved item was moved again';
  exception when no_data_found then null; end;

  -- Back to the list: title, importance and memo are kept, the task is gone.
  back := public.unschedule_task(t);
  if (select (title, importance, memo, deadline) from public.backlog_items where id = back)
     is distinct from ('Item'::text, '重'::text, 'note'::text, null::date) then
    raise exception 'the item moved back differs from the task';
  end if;
  if exists (select 1 from public.tasks where id = t) then
    raise exception 'the task moved back is still there';
  end if;
  if exists (select 1 from public.routine_skips where user_id = me) then
    raise exception 'moving back recorded a skip';
  end if;

  -- Not movable back: completed, plan schedule, routine task, milestone, past.
  insert into public.tasks (user_id, title, importance, scheduled_date, completed)
  values (me, 'Done', '中', current_date, true) returning id into t;
  begin
    perform public.unschedule_task(t);
    raise exception 'a completed task moved back';
  exception when invalid_parameter_value then null; end;

  insert into public.tasks (user_id, title, importance, scheduled_date, from_routine)
  values (me, 'Routine', '中', current_date, true) returning id into t;
  begin
    perform public.unschedule_task(t);
    raise exception 'a routine task moved back';
  exception when invalid_parameter_value then null; end;

  insert into public.tasks (user_id, title, importance, scheduled_date, is_milestone)
  values (me, 'Milestone', '中', current_date, true) returning id into t;
  begin
    perform public.unschedule_task(t);
    raise exception 'a milestone moved back';
  exception when invalid_parameter_value then null; end;

  insert into public.plans (id, user_id, name, color, status)
  values ('a2600000-0000-0000-0000-000000000011', me, 'Plan', 'blue', 'active');
  insert into public.tasks (user_id, title, importance, scheduled_date, plan_id)
  values (me, 'Schedule', '中', current_date, 'a2600000-0000-0000-0000-000000000011') returning id into t;
  begin
    perform public.unschedule_task(t);
    raise exception 'a plan schedule moved back';
  exception when invalid_parameter_value then null; end;

  insert into public.tasks (user_id, title, importance, scheduled_date, carried_from)
  values (me, 'Copy', '中', current_date, t) returning id into t;
  begin
    perform public.unschedule_task(t);
    raise exception 'a carried copy moved back';
  exception when invalid_parameter_value then null; end;

  insert into public.tasks (user_id, title, importance, scheduled_date)
  values (me, '  ', '中', current_date) returning id into t;
  begin
    perform public.unschedule_task(t);
    raise exception 'a blank title moved back';
  exception when invalid_parameter_value then null; end;

  -- 24:00 is a valid end (the timeline's last slot).
  insert into public.backlog_items (user_id, title) values (me, 'Late') returning id into item;
  perform public.schedule_backlog_item(item, current_date, '23:00', '24:00');

  insert into public.tasks (user_id, title, importance, scheduled_date)
  values (me, 'Old', '中', current_date - 2) returning id into t;
  begin
    perform public.unschedule_task(t);
    raise exception 'a past task moved back';
  exception when invalid_parameter_value then null; end;

  perform set_config('stride.test_item', back::text, true);
  insert into public.tasks (user_id, title, importance, scheduled_date)
  values (me, 'Mine', '中', current_date) returning id into t;
  perform set_config('stride.test_task', t::text, true);
end $$;

-- User B cannot see, move or move back A's rows ---------------------------
select set_config('request.jwt.claim.sub', 'a2600000-0000-0000-0000-000000000002', true);
do $$ begin
  if exists (select 1 from public.backlog_items) then
    raise exception 'B sees A items';
  end if;
  begin
    perform public.schedule_backlog_item(current_setting('stride.test_item')::uuid, current_date);
    raise exception 'B moved A item';
  exception when no_data_found then null; end;
  begin
    perform public.unschedule_task(current_setting('stride.test_task')::uuid);
    raise exception 'B moved back A task';
  exception when no_data_found then null; end;
  begin
    insert into public.backlog_items (user_id, title)
    values ('a2600000-0000-0000-0000-000000000001', 'Forged');
    raise exception 'B inserted an item for A';
  exception when insufficient_privilege then null; end;
  update public.backlog_items set title = 'Changed' where id = current_setting('stride.test_item')::uuid;
  delete from public.backlog_items where id = current_setting('stride.test_item')::uuid;
end $$;

reset role;
do $$ begin
  if not exists (select 1 from public.backlog_items
                  where id = current_setting('stride.test_item')::uuid and title = 'Item') then
    raise exception 'A item changed or deleted by B';
  end if;
  if not exists (select 1 from public.tasks
                  where id = current_setting('stride.test_task')::uuid) then
    raise exception 'A task changed by B';
  end if;
end $$;

select '0026_backlog_items: all checks passed' as result;
rollback;
