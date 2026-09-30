-- Stride: wish importance and achievement emphasis (Issue #54)
-- Depends on 0012_achievements_started_at.sql (latest achievements view).
-- importance: 重 / 中 / 軽, for ordering and recognition only. It does not
--   affect scores or the annual achievement count.
-- emphasize_achievement: whether an achieved wish is shown prominently
--   (gold, bold, star) in Journey. Independent of importance.
-- Existing wishes keep today's look: importance 中 and emphasis ON. New wishes
-- default to 中 and emphasis OFF (decided in Issue #43).
-- The achievements view gains `emphasized` (the wish setting; NULL for the
-- other kinds, whose look follows their kind). The view is dropped and
-- recreated like 0012, keeping security_invoker = true and the grants
-- (select for authenticated only, nothing for anon). Nothing depends on it.
-- Idempotent: add column if not exists, set default, drop if exists + create,
-- revoke + grant.

-- Adding the column with default true fills every existing row with true;
-- the default is then switched so that later inserts get false. On a re-run
-- the add is skipped and existing values are kept.
alter table public.wishes
  add column if not exists importance text not null default '中'
    constraint wishes_importance_check check (importance in ('重', '中', '軽')),
  add column if not exists emphasize_achievement boolean not null default true;
alter table public.wishes alter column emphasize_achievement set default false;

drop view if exists public.achievements;

-- Invoker semantics preserve each source table's RLS, including joined plans.
-- LEFT JOIN retains completed historical milestones when their plan is deleted.
create view public.achievements with (security_invoker = true) as
select 'wish'::text as kind, w.id, w.user_id, w.title,
       w.achieved_at as achieved_on, null::uuid as plan_id,
       null::text as plan_name, null::text as plan_color,
       null::timestamptz as started_at,
       w.emphasize_achievement as emphasized
from public.wishes w where w.achieved_at is not null
union all
select 'plan', p.id, p.user_id, p.name, p.completed_at,
       p.id, p.name, p.color, p.created_at, null::boolean
from public.plans p where p.status = 'done' and p.completed_at is not null
union all
select 'milestone', t.id, t.user_id, t.title, t.scheduled_date,
       t.plan_id, p.name, p.color, null::timestamptz, null::boolean
from public.tasks t left join public.plans p on p.id = t.plan_id
where t.is_milestone and t.completed and t.scheduled_date is not null
union all
select 'material', m.id, m.user_id, m.title, m.completed_at,
       m.plan_id, p.name, p.color, null::timestamptz, null::boolean
from public.materials m join public.plans p on p.id = m.plan_id
where m.status = 'done' and m.completed_at is not null;

revoke all on public.achievements from anon, authenticated;
grant select on public.achievements to authenticated;
