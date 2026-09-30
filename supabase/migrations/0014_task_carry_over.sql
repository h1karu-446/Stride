-- Stride: carrying an overdue schedule over copies it (Issue #36)
-- "今日に移す" used to update scheduled_date, which removed an open task from
-- the past day and raised that day's score. It now inserts a new task and
-- leaves the original on its day. carried_from points at the original so the
-- plan screens can tell that it has been carried over (spec BR-04).
-- - on delete set null: deleting the original keeps the copy as a plain task
-- - one copy per original (partial unique index); deleting the copy frees the
--   original to be carried again
-- - tasks_owner_all: with check also requires carried_from to be the caller's
--   own task (same rule as plan_id / routine_id in 0010). A subquery on tasks
--   inside the tasks policy recurses, so the lookup is a security definer
--   function that only answers "does this task belong to the caller".
-- Existing rows get NULL; no score changes. Idempotent.

alter table public.tasks
  add column if not exists carried_from uuid
    references public.tasks(id) on delete set null;

create unique index if not exists tasks_carried_from_uniq
  on public.tasks (carried_from) where carried_from is not null;

create or replace function public.is_own_task(p_task_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tasks t
     where t.id = p_task_id and t.user_id = auth.uid()
  );
$$;
revoke all on function public.is_own_task(uuid) from public, anon;
grant execute on function public.is_own_task(uuid) to authenticated;

drop policy if exists "tasks_owner_all" on public.tasks;
create policy "tasks_owner_all" on public.tasks for all
  using (auth.uid() = user_id)
  with check (
    auth.uid() = user_id
    and (
      plan_id is null
      or exists (
        select 1 from public.plans p
         where p.id = plan_id and p.user_id = auth.uid()
      )
    )
    and (
      routine_id is null
      or exists (
        select 1 from public.routines r
         where r.id = routine_id and r.user_id = auth.uid()
      )
    )
    and (carried_from is null or public.is_own_task(carried_from))
  );
