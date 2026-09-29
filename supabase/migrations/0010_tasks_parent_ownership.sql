-- Stride: tasks must not point at someone else's plan or routine (Issue #23)
-- The tasks policy from 0001 only checked user_id, so a user could attach a
-- task to another user's plan_id / routine_id. Child tables added in 0007 and
-- 0008 already require the parent to belong to the caller (DB-51); tasks now
-- follows the same rule.
-- - using: unchanged (auth.uid() = user_id)
-- - with check: plus "plan_id / routine_id, when set, belong to the caller"
-- Existing rows are not re-checked; only new inserts and updates are.
-- Idempotent: the policy is dropped and recreated.

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
  );
