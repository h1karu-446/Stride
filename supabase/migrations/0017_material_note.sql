-- Stride: 教材の「学ぶこと・メモ」(Issue #53)
-- - materials.note: optional free text, up to 1000 characters (same limit as
--   plans.goal_note). The client trims it and sends NULL when it is blank.
-- - Existing materials keep note = NULL; no row is rewritten.
-- - GRANT, RLS and triggers are unchanged: 0008 grants select / insert /
--   update / delete on the whole table to authenticated (anon gets nothing),
--   so the new column is covered, and materials_owner_all still applies.
--   The achievements view lists its columns explicitly and does not change.
-- - Idempotent: add column if not exists, and the check constraint is dropped
--   and added again under a fixed name.

alter table public.materials
  add column if not exists note text;

alter table public.materials
  drop constraint if exists materials_note_length;
alter table public.materials
  add constraint materials_note_length
  check (note is null or char_length(note) <= 1000);
