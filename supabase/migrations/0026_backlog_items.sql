-- Stride: 日付未設定のタスク（やることリスト）(Issue #83)
-- - backlog_items: things to do soon whose day is not decided yet. They have
--   no date, so no score (calculate_daily_score reads only tasks) and no
--   screen that reads tasks sees them. deadline is optional and only for
--   ordering / display. memo keeps a hand task's memo when it is moved back.
-- - schedule_backlog_item(p_item_id, p_date, p_start_time, p_end_time):
--   moves an item to a day: inserts a plain task (no plan, no routine) and
--   deletes the item in one transaction, and returns the task id. p_date may
--   not be before DB date - 1 (the screen sends its local date and only
--   offers today and later; the 1 day is the time zone, as elsewhere).
--   Both times or neither (a time-less task); the end after the start
--   (24:00 is allowed as the end, as the timeline sends it).
-- - unschedule_task(p_task_id): moves a task back to the list: inserts an
--   item (title, importance, memo) and deletes the task in one transaction,
--   and returns the item id. Only an unfinished hand task of DB date - 1 or
--   later: not completed, no plan (schedules), not from a routine, not a
--   carried copy, not a milestone, and with a title that is not blank (tasks
--   allow it, backlog_items do not). Such a task has no routine_id, so
--   tasks_record_routine_skip records nothing; trg_touch_review_on_task
--   rescores the day as for any delete. Times are not kept.
-- - Both functions are security invoker with search_path '': RLS decides
--   whose rows they can see, so another user's item / task counts as missing.
-- - Idempotent: create table / index if not exists, policy and trigger
--   dropped and re-created, functions created or replaced.

create table if not exists public.backlog_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  importance text not null default '中',
  deadline date,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint backlog_items_title_not_blank check (char_length(btrim(title)) >= 1),
  constraint backlog_items_importance check (importance in ('重', '中', '軽'))
);
create index if not exists backlog_items_user_idx on public.backlog_items (user_id, created_at);

alter table public.backlog_items enable row level security;
drop policy if exists backlog_items_owner_all on public.backlog_items;
create policy backlog_items_owner_all on public.backlog_items for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.backlog_items from anon, authenticated;
grant select, insert, update, delete on public.backlog_items to authenticated;

drop trigger if exists backlog_items_updated_at on public.backlog_items;
create trigger backlog_items_updated_at before update on public.backlog_items
  for each row execute function public.set_updated_at();

create or replace function public.schedule_backlog_item(
  p_item_id uuid,
  p_date date,
  p_start_time time default null,
  p_end_time time default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_item public.backlog_items;
  v_task_id uuid;
begin
  if p_date is null or p_date < current_date - 1 then
    raise exception 'p_date % is out of the allowed range', p_date using errcode = '22023';
  end if;
  if (p_start_time is null) <> (p_end_time is null) then
    raise exception 'give both times or neither' using errcode = '22023';
  end if;
  if p_end_time <= p_start_time then
    raise exception 'the end must be after the start' using errcode = '22023';
  end if;

  select * into v_item from public.backlog_items where id = p_item_id for update;
  if not found then
    raise exception 'backlog item % not found', p_item_id using errcode = 'P0002';
  end if;

  insert into public.tasks (
    user_id, title, importance, memo, scheduled_date, start_time, end_time, completed
  ) values (
    v_item.user_id, v_item.title, v_item.importance, v_item.memo,
    p_date, p_start_time, p_end_time, false
  ) returning id into v_task_id;

  delete from public.backlog_items where id = p_item_id;
  return v_task_id;
end;
$$;

create or replace function public.unschedule_task(p_task_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_task public.tasks;
  v_item_id uuid;
begin
  select * into v_task from public.tasks where id = p_task_id for update;
  if not found then
    raise exception 'task % not found', p_task_id using errcode = 'P0002';
  end if;
  if v_task.completed
     or v_task.plan_id is not null
     or v_task.from_routine
     or v_task.routine_id is not null
     or v_task.carried_from is not null
     or v_task.is_milestone
     or char_length(btrim(v_task.title)) = 0 then
    raise exception 'task % cannot be moved back to the list', p_task_id using errcode = '22023';
  end if;
  if v_task.scheduled_date is null or v_task.scheduled_date < current_date - 1 then
    raise exception 'task % is in the past', p_task_id using errcode = '22023';
  end if;

  insert into public.backlog_items (user_id, title, importance, memo)
  values (v_task.user_id, v_task.title, v_task.importance, v_task.memo)
  returning id into v_item_id;

  delete from public.tasks where id = p_task_id;
  return v_item_id;
end;
$$;

revoke all on function public.schedule_backlog_item(uuid, date, time, time) from public, anon;
revoke all on function public.unschedule_task(uuid) from public, anon;
grant execute on function public.schedule_backlog_item(uuid, date, time, time) to authenticated;
grant execute on function public.unschedule_task(uuid) to authenticated;
