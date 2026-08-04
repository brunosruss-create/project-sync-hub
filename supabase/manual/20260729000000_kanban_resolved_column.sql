-- Add 'resolved' to kanban_column valid values
-- Drop existing constraint and recreate with new value
alter table if exists public.contacts
drop constraint if exists contacts_kanban_column_check;

alter table if exists public.contacts
add constraint contacts_kanban_column_check
check (kanban_column in ('waiting', 'in_progress', 'scheduled', 'urgent', 'resolved', 'archived'));

select 'kanban_column_check constraint updated' as status;
