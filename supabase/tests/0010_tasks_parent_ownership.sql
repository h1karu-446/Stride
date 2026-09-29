-- Run with psql -v ON_ERROR_STOP=1 after migrations 0001..0010 (Issue #23).
-- All fixtures and mutations are rolled back; existing users are untouched.
-- A = ...0001 owns a plan and a routine. B = ...0002 tries to borrow them.
begin;
insert into auth.users (id, email) values
 ('a1000000-0000-0000-0000-000000000001', 'stride-test-0010-a@example.invalid'),
 ('a1000000-0000-0000-0000-000000000002', 'stride-test-0010-b@example.invalid');
set local role authenticated;

-- User A ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000001', true);
insert into public.plans (id, user_id, name, color, status) values
 ('a1000000-0000-0000-0000-000000000011', auth.uid(), 'A plan', 'blue', 'active');
insert into public.routines (id, user_id, phase_id, title)
select 'a1000000-0000-0000-0000-000000000021', auth.uid(), ph.id, 'A routine'
  from public.phases ph
 where ph.plan_id = 'a1000000-0000-0000-0000-000000000011' and ph.is_implicit;

do $$
declare v_task uuid; before_score numeric; after_score numeric;
        d1 date := current_date + 30;
begin
  -- generate_routine_tasks (security invoker) still inserts under the new check
  perform public.generate_routine_tasks(current_date);
  if not exists (select 1 from public.tasks
                  where routine_id = 'a1000000-0000-0000-0000-000000000021'
                    and plan_id = 'a1000000-0000-0000-0000-000000000011'
                    and scheduled_date = current_date) then
    raise exception 'generate_routine_tasks: routine task not created';
  end if;

  -- 0008: moving a task to another date still refreshes the old date's score
  insert into public.daily_reviews (user_id, date, fulfillment) values (auth.uid(), d1, 3);
  insert into public.tasks (user_id, title, importance, scheduled_date, completed, plan_id)
  values (auth.uid(), 'A move', '重', d1, true, 'a1000000-0000-0000-0000-000000000011')
  returning id into v_task;
  select completion_score into before_score from public.daily_reviews where user_id = auth.uid() and date = d1;
  update public.tasks set scheduled_date = d1 + 1 where id = v_task;
  select completion_score into after_score from public.daily_reviews where user_id = auth.uid() and date = d1;
  if before_score is not distinct from after_score then
    raise exception 'DB-41: old date score not recalculated (% -> %)', before_score, after_score;
  end if;
end $$;

-- User B ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1000000-0000-0000-0000-000000000002', true);
insert into public.plans (id, user_id, name, color, status) values
 ('a1000000-0000-0000-0000-000000000012', auth.uid(), 'B plan', 'green', 'active'),
 ('a1000000-0000-0000-0000-000000000013', auth.uid(), 'B plan 2', 'gray', 'active');
insert into public.routines (id, user_id, phase_id, title)
select 'a1000000-0000-0000-0000-000000000022', auth.uid(), ph.id, 'B routine'
  from public.phases ph
 where ph.plan_id = 'a1000000-0000-0000-0000-000000000012' and ph.is_implicit;

do $$
declare v_task uuid;
        a_plan uuid := 'a1000000-0000-0000-0000-000000000011';
        a_routine uuid := 'a1000000-0000-0000-0000-000000000021';
begin
  -- DB-51 (tasks): another owner's plan_id / routine_id is rejected on insert
  begin
    insert into public.tasks (user_id, title, importance, scheduled_date, plan_id)
    values (auth.uid(), 'B -> A plan', '中', current_date, a_plan);
    raise exception 'DB-51: insert with another owner plan_id allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.tasks (user_id, title, importance, scheduled_date, routine_id)
    values (auth.uid(), 'B -> A routine', '中', current_date + 40, a_routine);
    raise exception 'DB-51: insert with another owner routine_id allowed';
  exception when insufficient_privilege then null; end;

  -- Manual task without a plan, and own plan / routine, are allowed
  insert into public.tasks (user_id, title, importance, scheduled_date)
  values (auth.uid(), 'B manual', '軽', current_date) returning id into v_task;
  insert into public.tasks (user_id, title, importance, scheduled_date, plan_id, routine_id)
  values (auth.uid(), 'B own', '中', current_date + 41,
          'a1000000-0000-0000-0000-000000000012', 'a1000000-0000-0000-0000-000000000022');

  -- DB-51 (tasks): another owner's plan_id / routine_id is rejected on update
  begin
    update public.tasks set plan_id = a_plan where id = v_task;
    raise exception 'DB-51: update to another owner plan_id allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.tasks set routine_id = a_routine where id = v_task;
    raise exception 'DB-51: update to another owner routine_id allowed';
  exception when insufficient_privilege then null; end;
  update public.tasks set plan_id = 'a1000000-0000-0000-0000-000000000013', completed = true
   where id = v_task;

  -- generate_routine_tasks as B creates only B's routine task
  perform public.generate_routine_tasks(current_date);
  if exists (select 1 from public.tasks where routine_id = a_routine and user_id = auth.uid()) then
    raise exception 'DB-52: B got a task of A routine';
  end if;
  if not exists (select 1 from public.tasks
                  where routine_id = 'a1000000-0000-0000-0000-000000000022'
                    and scheduled_date = current_date) then
    raise exception 'generate_routine_tasks: B routine task not created';
  end if;

  -- delete_plan on own plan keeps the completed task with plan_id cleared
  perform public.delete_plan('a1000000-0000-0000-0000-000000000013', current_date);
  if (select plan_id from public.tasks where id = v_task) is not null then
    raise exception 'delete_plan: plan_id not cleared';
  end if;

  -- DB-52: delete_plan on A's plan does not touch A's tasks
  begin
    perform public.delete_plan(a_plan, current_date);
  exception when no_data_found then null; end;
end $$;

reset role;
do $$ begin
  if (select count(*) from public.tasks where plan_id = 'a1000000-0000-0000-0000-000000000011') <> 2 then
    raise exception 'DB-52: A tasks changed';
  end if;
  raise notice 'PASS: 0010 tasks parent ownership';
end $$;
rollback;
