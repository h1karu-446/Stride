-- Stride: return a plan's start as timestamptz in achievements (Issue #34)
-- 0009 exposed started_on = p.created_at::date, which is the UTC date. A plan
-- created between 00:00 and 09:00 JST showed the previous day (or month) in
-- Journey while Plans used the device's local date. The view now returns the
-- raw timestamp as started_at; the client converts it to the local date.
-- A column cannot be renamed or retyped with create or replace view, so the
-- view is dropped and recreated. Nothing depends on it.
-- Keeps security_invoker = true (source-table RLS applies) and the grants of
-- 0009: select for authenticated only, nothing for anon.
-- Idempotent: drop if exists + create, revoke + grant.

drop view if exists public.achievements;

-- Invoker semantics preserve each source table's RLS, including joined plans.
-- LEFT JOIN retains completed historical milestones when their plan is deleted.
create view public.achievements with (security_invoker = true) as
select 'wish'::text as kind, w.id, w.user_id, w.title,
       w.achieved_at as achieved_on, null::uuid as plan_id,
       null::text as plan_name, null::text as plan_color,
       null::timestamptz as started_at
from public.wishes w where w.achieved_at is not null
union all
select 'plan', p.id, p.user_id, p.name, p.completed_at,
       p.id, p.name, p.color, p.created_at
from public.plans p where p.status = 'done' and p.completed_at is not null
union all
select 'milestone', t.id, t.user_id, t.title, t.scheduled_date,
       t.plan_id, p.name, p.color, null::timestamptz
from public.tasks t left join public.plans p on p.id = t.plan_id
where t.is_milestone and t.completed and t.scheduled_date is not null
union all
select 'material', m.id, m.user_id, m.title, m.completed_at,
       m.plan_id, p.name, p.color, null::timestamptz
from public.materials m join public.plans p on p.id = m.plan_id
where m.status = 'done' and m.completed_at is not null;

revoke all on public.achievements from anon, authenticated;
grant select on public.achievements to authenticated;
