-- Extend the plan palette without changing existing color values.
alter table public.plans drop constraint if exists plans_color_check;
alter table public.plans add constraint plans_color_check
  check (color in (
    'pink', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'gray',
    'coral', 'lime', 'indigo', 'brown'
  ));
