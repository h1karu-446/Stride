-- Release 4: wishes and a live, owner-scoped achievement feed (ADR-0005).
-- Depends on 0008_materials_and_milestones.sql. No historical scores change.
create table public.wishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 60),
  note text check (note is null or char_length(note) <= 100),
  achieved_at date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index wishes_user_created_idx on public.wishes (user_id, created_at);
alter table public.wishes enable row level security;
create policy wishes_owner_all on public.wishes for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke all on public.wishes from anon, authenticated;
grant select, insert, update, delete on public.wishes to authenticated;
create trigger wishes_updated_at before update on public.wishes
  for each row execute function public.set_updated_at();

-- Invoker semantics preserve each source table's RLS, including joined plans.
-- LEFT JOIN retains completed historical milestones when their plan is deleted.
create view public.achievements with (security_invoker = true) as
select 'wish'::text as kind, w.id, w.user_id, w.title,
       w.achieved_at as achieved_on, null::uuid as plan_id,
       null::text as plan_name, null::text as plan_color, null::date as started_on
from public.wishes w where w.achieved_at is not null
union all
select 'plan', p.id, p.user_id, p.name, p.completed_at,
       p.id, p.name, p.color, p.created_at::date
from public.plans p where p.status = 'done' and p.completed_at is not null
union all
select 'milestone', t.id, t.user_id, t.title, t.scheduled_date,
       t.plan_id, p.name, p.color, null::date
from public.tasks t left join public.plans p on p.id = t.plan_id
where t.is_milestone and t.completed and t.scheduled_date is not null
union all
select 'material', m.id, m.user_id, m.title, m.completed_at,
       m.plan_id, p.name, p.color, null::date
from public.materials m join public.plans p on p.id = m.plan_id
where m.status = 'done' and m.completed_at is not null;
revoke all on public.achievements from anon, authenticated;
grant select on public.achievements to authenticated;
