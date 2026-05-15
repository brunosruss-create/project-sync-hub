-- ════════════════════════════════════════════════════════════
-- Persiste campos cosméticos do Perfil (pessoal) e do Negócio.
-- ════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists phone               text,
  add column if not exists user_timezone       text    default 'America/Sao_Paulo',
  add column if not exists notify_email        boolean default true,
  add column if not exists notify_push         boolean default true,
  add column if not exists business_address    text,
  add column if not exists business_phone      text,
  add column if not exists business_website    text,
  add column if not exists business_logo_url   text;

update public.profiles
set notify_email  = coalesce(notify_email, true),
    notify_push   = coalesce(notify_push, true),
    user_timezone = coalesce(user_timezone, 'America/Sao_Paulo');
