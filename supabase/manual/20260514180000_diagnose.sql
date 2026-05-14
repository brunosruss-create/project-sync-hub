-- DIAGNÓSTICO. Rode TUDO no SQL Editor do Supabase e cole o resultado de cada bloco.

-- 1) Roles da Jaqueline
select u.id, u.email, array_agg(ur.role) as roles
from auth.users u
left join public.user_roles ur on ur.user_id = u.id
where lower(u.email) = lower('jaqueline@gmail.com')
group by u.id, u.email;

-- 2) Workspace membership da Jaqueline
select wm.*, owner.email as owner_email, member.email as member_email
from public.workspace_members wm
join auth.users owner on owner.id = wm.workspace_owner_id
join auth.users member on member.id = wm.member_user_id
where lower(member.email) = lower('jaqueline@gmail.com');

-- 3) Existência das funções
select proname from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in ('get_my_role','get_my_workspace_owner','is_workspace_manager','has_role','is_contact_visible');

-- 4) Policies ATIVAS em contacts/messages (nome importa: as antigas "ws members ..." dão acesso ao workspace inteiro)
select tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('contacts','messages','appointments','kanban_columns')
order by tablename, policyname;

-- 5) Existe coluna assigned_agent_id em contacts?
select column_name from information_schema.columns
where table_schema='public' and table_name='contacts' and column_name='assigned_agent_id';
