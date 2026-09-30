-- Run with psql -v ON_ERROR_STOP=1 after migrations 0001..0011 and 0014 (Issue #36).
-- All fixtures and mutations are rolled back; existing users are untouched.
-- A = ...0001 carries an overdue schedule over. B = ...0002 tries to point at A's task.
begin;
insert into auth.users (id, email) values
 ('a1400000-0000-0000-0000-000000000001', 'stride-test-0014-a@example.invalid'),
 ('a1400000-0000-0000-0000-000000000002', 'stride-test-0014-b@example.invalid');
set local role authenticated;

-- User A ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1400000-0000-0000-0000-000000000001', true);
insert into public.plans (id, user_id, name, color, status) values
 ('a1400000-0000-0000-0000-000000000011', auth.uid(), 'A plan', 'blue', 'active');

do $$
declare v_orig uuid; v_copy uuid; before_score numeric; after_score numeric;
        today_before numeric; today_after numeric;
        d0 date := current_date - 1;
begin
  -- DB-40: an open schedule on yesterday (which has a review) lowers its score
  insert into public.daily_reviews (user_id, date, fulfillment) values (auth.uid(), d0, 3);
  insert into public.tasks (user_id, title, importance, scheduled_date, completed)
  values (auth.uid(), 'A done', '中', d0, true);
  select completion_score into before_score from public.daily_reviews
   where user_id = auth.uid() and date = d0;
  insert into public.tasks (user_id, title, importance, scheduled_date, plan_id, is_milestone, memo)
  values (auth.uid(), 'A overdue', '重', d0, 'a1400000-0000-0000-0000-000000000011', true, 'note')
  returning id into v_orig;
  select completion_score into after_score from public.daily_reviews
   where user_id = auth.uid() and date = d0;
  if not after_score < before_score then
    raise exception 'DB-40: yesterday score not lowered (% -> %)', before_score, after_score;
  end if;
  before_score := after_score;

  -- Today has a review and one completed task (completion 100%)
  insert into public.daily_reviews (user_id, date, fulfillment) values (auth.uid(), current_date, 3);
  insert into public.tasks (user_id, title, importance, scheduled_date, completed)
  values (auth.uid(), 'A today done', '中', current_date, true);
  select completion_score into today_before from public.daily_reviews
   where user_id = auth.uid() and date = current_date;

  -- DB-41: carrying over inserts a copy; the original day keeps its score
  insert into public.tasks (user_id, title, importance, scheduled_date, plan_id,
                            is_milestone, memo, carried_from)
  select user_id, title, importance, current_date, plan_id, is_milestone, memo, id
    from public.tasks where id = v_orig
  returning id into v_copy;
  select completion_score into after_score from public.daily_reviews
   where user_id = auth.uid() and date = d0;
  if before_score is distinct from after_score then
    raise exception 'DB-41: yesterday score changed (% -> %)', before_score, after_score;
  end if;
  if not exists (select 1 from public.tasks
                  where id = v_orig and scheduled_date = d0 and not completed) then
    raise exception 'DB-41: original moved or changed';
  end if;
  -- DB-41: the open copy is counted on today, so today's score drops
  select completion_score into today_after from public.daily_reviews
   where user_id = auth.uid() and date = current_date;
  if not today_after < today_before then
    raise exception 'DB-41: today score not lowered by the copy (% -> %)', today_before, today_after;
  end if;

  -- DB-43: one copy per original
  begin
    insert into public.tasks (user_id, title, importance, scheduled_date, carried_from)
    values (auth.uid(), 'A second copy', '中', current_date, v_orig);
    raise exception 'DB-43: second copy of the same original allowed';
  exception when unique_violation then null; end;

  -- Deleting the copy frees the original to be carried again
  delete from public.tasks where id = v_copy;
  insert into public.tasks (user_id, title, importance, scheduled_date, carried_from)
  values (auth.uid(), 'A copy again', '重', current_date + 1, v_orig)
  returning id into v_copy;

  -- Deleting the original keeps the copy with carried_from cleared
  delete from public.tasks where id = v_orig;
  if (select carried_from from public.tasks where id = v_copy) is not null then
    raise exception 'on delete set null: carried_from not cleared';
  end if;
end $$;

-- A keeps one task for B to try to reference
insert into public.tasks (id, user_id, title, importance, scheduled_date)
values ('a1400000-0000-0000-0000-000000000031', auth.uid(), 'A target', '中', current_date - 2);

-- User B ------------------------------------------------------------------
select set_config('request.jwt.claim.sub', 'a1400000-0000-0000-0000-000000000002', true);
do $$
declare v_task uuid;
        a_task uuid := 'a1400000-0000-0000-0000-000000000031';
begin
  -- DB-44: another owner's task is rejected as carried_from (insert and update)
  begin
    insert into public.tasks (user_id, title, importance, scheduled_date, carried_from)
    values (auth.uid(), 'B -> A task', '中', current_date, a_task);
    raise exception 'DB-44: insert with another owner carried_from allowed';
  exception when insufficient_privilege then null; end;
  insert into public.tasks (user_id, title, importance, scheduled_date)
  values (auth.uid(), 'B own', '中', current_date - 1) returning id into v_task;
  begin
    update public.tasks set title = 'B changed', carried_from = a_task where id = v_task;
    raise exception 'DB-44: update to another owner carried_from allowed';
  exception when insufficient_privilege then null; end;

  -- Own task as carried_from is allowed
  insert into public.tasks (user_id, title, importance, scheduled_date, carried_from)
  values (auth.uid(), 'B copy', '中', current_date, v_task);
end $$;

reset role;
do $$ begin
  if exists (select 1 from public.tasks
              where carried_from = 'a1400000-0000-0000-0000-000000000031') then
    raise exception 'DB-44: a copy of A task exists';
  end if;
  raise notice 'PASS: 0014 task carry over';
end $$;
rollback;
