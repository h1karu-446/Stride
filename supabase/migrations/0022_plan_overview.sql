-- Stride: 計画の「概要」(Issue #70)
-- - plans.overview: optional Markdown text, up to 10000 characters. The client
--   strips trailing whitespace and sends NULL when it is blank.
-- - Existing plans keep overview = NULL; no row is rewritten.
-- - GRANT, RLS and triggers are unchanged: 0007 grants select / insert /
--   update / delete on the whole table to authenticated (anon gets nothing),
--   so the new column is covered, and plans_owner_all still applies.
--   The achievements view lists its columns explicitly and does not change.
-- - Idempotent: add column if not exists, and the check constraint is dropped
--   and added again under a fixed name.

alter table public.plans
  add column if not exists overview text;

alter table public.plans
  drop constraint if exists plans_overview_length;
alter table public.plans
  add constraint plans_overview_length
  check (overview is null or char_length(overview) <= 10000);
